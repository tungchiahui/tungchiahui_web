import { createHash } from 'node:crypto'
import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import { createDatabaseClient } from '../database/client'
import {
  contentAliases,
  contentSourceFiles,
  contentSyncState,
  documents,
  documentTranslations,
  ingestionRuns,
} from '../database/schema'
import { sourceCommitSchema } from '../domain/persistence'
import { contentGlossary } from '../i18n/content-glossary'
import { localizeContentMarkdown } from '../i18n/content-markdown'
import { redactTelemetryText } from '../observability/telemetry'
import { applyGitMemoryImport, planGitMemoryImport } from '../translation/git-import'
import { gitBlobSha, sourceCacheVersion } from '../translation/git-memory'
import { reconcileEnglishTranslation, retireEnglishTranslations } from '../translation/memory'
import {
  contentSnapshotSchema,
  type PreparedContentDocument,
  preparedContentDocumentSchema,
} from './contracts'
import {
  type ContentChange,
  type ContentHookInput,
  type ContentIngestionHooks,
  contentHookInputSchema,
} from './hooks'
import { legacyAliasApprovalReference, legacyContentAliases } from './legacy-aliases'
import { ContentRouteCollisionError, prepareContentSnapshot } from './markdown'

const jobIdSchema = z.uuid()

export class AmbiguousContentIdentityError extends Error {
  override readonly name = 'AmbiguousContentIdentityError'
}

export class ContentSnapshotValidationError extends Error {
  override readonly name = 'ContentSnapshotValidationError'
}

type ExistingDocument = typeof documents.$inferSelect

type PlannedDocument = Readonly<{
  existing: ExistingDocument | undefined
  incoming: PreparedContentDocument
}>

const deterministicContentLocales = ['zh-hk', 'zh-tw'] as const

function sha256(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  if (value !== null && typeof value === 'object') {
    const record = z.record(z.string(), z.unknown()).parse(value)
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

function sameDate(left: Date | null, right: Date | null) {
  return left?.getTime() === right?.getTime()
}

function documentContentChanged(existing: ExistingDocument, incoming: PreparedContentDocument) {
  return (
    existing.contentType !== incoming.contentType ||
    existing.title !== incoming.title ||
    canonicalJson(existing.rawFrontmatter) !== canonicalJson(incoming.rawFrontmatter) ||
    existing.rawMarkdown !== incoming.rawMarkdown ||
    existing.sourceHash !== incoming.sourceHash ||
    existing.routePath !== incoming.routePath ||
    !sameDate(existing.sourceUpdatedAt, incoming.sourceUpdatedAt) ||
    existing.isDeleted
  )
}

function groupBy<T>(values: readonly T[], key: (value: T) => string) {
  const groups = new Map<string, T[]>()
  for (const value of values) {
    const groupKey = key(value)
    const group = groups.get(groupKey) ?? []
    group.push(value)
    groups.set(groupKey, group)
  }
  return groups
}

function planIdentity(
  existingDocuments: readonly ExistingDocument[],
  incomingDocuments: readonly PreparedContentDocument[],
) {
  const byPath = new Map(existingDocuments.map((document) => [document.sourcePath, document]))
  const byRoute = new Map(existingDocuments.map((document) => [document.routePath, document]))
  const activeByHash = groupBy(
    existingDocuments.filter((document) => !document.isDeleted),
    (document) => `${document.contentType}:${document.sourceHash}`,
  )
  const unmatchedIncomingByHash = groupBy(
    incomingDocuments.filter((document) => !byPath.has(document.sourcePath)),
    (document) => `${document.contentType}:${document.sourceHash}`,
  )
  const usedIds = new Set<string>()
  const plan: PlannedDocument[] = []

  for (const incoming of incomingDocuments) {
    let existing = byPath.get(incoming.sourcePath)
    if (existing && usedIds.has(existing.id)) existing = undefined

    if (!existing) {
      const routeMatch = byRoute.get(incoming.routePath)
      if (routeMatch && !usedIds.has(routeMatch.id)) existing = routeMatch
    }

    if (!existing) {
      const identityHash = `${incoming.contentType}:${incoming.sourceHash}`
      const hashMatches = (activeByHash.get(identityHash) ?? []).filter(
        (candidate) => !usedIds.has(candidate.id),
      )
      const incomingHashMatches = unmatchedIncomingByHash.get(identityHash) ?? []
      if (hashMatches.length > 1 || (hashMatches.length === 1 && incomingHashMatches.length > 1)) {
        throw new AmbiguousContentIdentityError(
          `Cannot safely preserve identity for ${incoming.sourcePath}; content hash is ambiguous`,
        )
      }
      existing = hashMatches[0]
    }

    if (existing) usedIds.add(existing.id)
    plan.push({ existing, incoming })
  }

  return Object.freeze({ plan, usedIds })
}

function changeType(existing: ExistingDocument | undefined, incoming: PreparedContentDocument) {
  if (!existing || existing.isDeleted) return 'added' as const
  if (existing.sourcePath !== incoming.sourcePath) return 'moved' as const
  return 'modified' as const
}

export type IngestionResult = Readonly<{
  changes: readonly ContentChange[]
  filesChanged: number
  filesDeleted: number
  filesSeen: number
  sourceCommit: string
  englishOnlyDocumentIds?: readonly string[] | undefined
  memory?:
    | Readonly<{
        entriesChanged: number
        shardsChanged: number
        documentsMaterialized: number
        filesFetched: number
        error: string | null
      }>
    | undefined
  translation: Readonly<{
    fallbackSegments: number
    memoryHits: number
    pendingSegments: number
    translatedSegments: number
  }>
}>

export class ContentHookDeliveryError extends Error {
  override readonly name = 'ContentHookDeliveryError'
  readonly result: IngestionResult

  constructor(result: IngestionResult, cause: unknown) {
    super('Content materialization completed but downstream hooks were not delivered', { cause })
    this.result = result
  }
}
export class ContentMemoryValidationError extends Error {
  override readonly name = 'ContentMemoryValidationError'
  readonly result: IngestionResult
  constructor(result: IngestionResult) {
    super(
      'Git translation memory was rejected; canonical content is published with last valid memory',
    )
    this.result = result
  }
}

export class ContentIngestionRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>
  readonly #hooks: ContentIngestionHooks

  constructor(connectionString: string, hooks: ContentIngestionHooks) {
    this.#hooks = hooks
    this.#client = createDatabaseClient({
      applicationName: 'content-worker-ingestion',
      connectionString,
      maxConnections: 4,
      queryTimeoutMilliseconds: 30_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async deliverHooks(input: ContentHookInput) {
    const validated = contentHookInputSchema.parse(input)
    await this.#hooks.diffTranslations(validated)
    await this.#hooks.refreshSearch(validated)
    await this.#hooks.revalidatePublicContent(validated)
  }

  async deliverResultHooks(result: IngestionResult) {
    const englishOnly = new Set(result.englishOnlyDocumentIds ?? [])
    const canonical = result.changes.filter((change) => !englishOnly.has(change.documentId))
    const english = result.changes.filter((change) => englishOnly.has(change.documentId))
    if (canonical.length)
      await this.deliverHooks({
        changes: canonical,
        sourceCommit: result.sourceCommit,
        translation: result.translation,
      })
    if (english.length)
      await this.deliverHooks({
        changes: english,
        searchLocales: ['en-us'],
        sourceCommit: result.sourceCommit,
        translation: result.translation,
      })
  }

  async readSourceCache() {
    return this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      const files = await transaction
        .select()
        .from(contentSourceFiles)
        .where(eq(contentSourceFiles.cacheVersion, sourceCacheVersion))
      const state = (
        await transaction
          .select()
          .from(contentSyncState)
          .where(eq(contentSyncState.key, 'canonical'))
      )[0]
      return { files, ...(state ? { sourceCommit: state.sourceCommit } : {}) }
    })
  }

  async recordFailure(jobIdInput: unknown, sourceCommitInput: unknown, error: unknown) {
    const operationalJobId = jobIdSchema.parse(jobIdInput)
    const sourceCommit = sourceCommitSchema.parse(sourceCommitInput)
    const errorSummary =
      error instanceof Error ? redactTelemetryText(error.message) : 'Unknown ingestion failure'
    await this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      await transaction
        .insert(ingestionRuns)
        .values({
          errorSummary,
          finishedAt: new Date(),
          operationalJobId,
          sourceCommit,
          status: 'failed',
        })
        .onConflictDoUpdate({
          target: ingestionRuns.operationalJobId,
          set: { errorSummary, finishedAt: new Date(), status: 'failed' },
        })
    })
  }

  async ingest(jobIdInput: unknown, snapshotInput: unknown): Promise<IngestionResult> {
    const operationalJobId = jobIdSchema.parse(jobIdInput)
    let snapshot: z.infer<typeof contentSnapshotSchema>
    try {
      snapshot = contentSnapshotSchema.parse(snapshotInput)
    } catch (error: unknown) {
      if (error instanceof ContentRouteCollisionError) throw error
      throw new ContentSnapshotValidationError('Canonical content snapshot validation failed', {
        cause: error,
      })
    }
    const result = await this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      await transaction.execute(
        sql`SELECT pg_advisory_xact_lock(hashtext('canonical-content-sync'))`,
      )
      const state = (
        await transaction
          .select()
          .from(contentSyncState)
          .where(eq(contentSyncState.key, 'canonical'))
      )[0]
      if (
        snapshot.ancestorCommit !== undefined &&
        state &&
        snapshot.ancestorCommit !== state.sourceCommit
      )
        throw new Error(
          'Content sync lineage changed while fetching; retry from the current applied commit',
        )
      const sourceCache = await transaction
        .select()
        .from(contentSourceFiles)
        .where(eq(contentSourceFiles.cacheVersion, sourceCacheVersion))
      const cached = new Map(sourceCache.map((file) => [file.path, file]))
      const existingDocuments = await transaction.select().from(documents)
      const reusable = new Map(
        existingDocuments
          .filter(
            (document) =>
              cached.get(document.sourcePath)?.contents === document.rawMarkdown &&
              document.sourceHash === sha256(document.rawMarkdown),
          )
          .map((document) => [document.sourcePath, preparedContentDocumentSchema.parse(document)]),
      )
      let prepared: ReturnType<typeof prepareContentSnapshot>
      try {
        prepared = prepareContentSnapshot(snapshot, reusable)
      } catch (error: unknown) {
        if (error instanceof ContentRouteCollisionError) throw error
        throw new ContentSnapshotValidationError('Canonical content snapshot validation failed', {
          cause: error,
        })
      }
      let memoryPlan: ReturnType<typeof planGitMemoryImport> | undefined
      let memoryError: string | null = null
      try {
        memoryPlan = planGitMemoryImport(
          snapshot.memoryFiles,
          sourceCache.filter((file) => file.path.startsWith('translations/')),
          state?.memoryEnabled ?? false,
        )
      } catch {
        memoryError =
          'Git translation memory validation failed; retained last valid memory and published canonical content'
      }
      const imported = memoryPlan
        ? await applyGitMemoryImport(transaction, memoryPlan, state?.memoryEnabled ?? false)
        : { documentIds: new Set<string>(), entriesChanged: 0, shardsChanged: 0 }
      const existingTranslations = await transaction
        .select()
        .from(documentTranslations)
        .where(inArray(documentTranslations.locale, deterministicContentLocales))
      const existingTranslationsByKey = new Map(
        existingTranslations.map((translation) => [
          `${translation.documentId}:${translation.locale}`,
          translation,
        ]),
      )
      const { plan, usedIds } = planIdentity(existingDocuments, prepared.documents)
      const startedAt = new Date()

      await transaction
        .insert(ingestionRuns)
        .values({ operationalJobId, sourceCommit: prepared.sourceCommit, status: 'running' })
        .onConflictDoUpdate({
          target: ingestionRuns.operationalJobId,
          set: {
            errorSummary: null,
            filesChanged: 0,
            filesDeleted: 0,
            filesSeen: 0,
            finishedAt: null,
            sourceCommit: prepared.sourceCommit,
            startedAt,
            status: 'running',
          },
        })

      for (const item of plan) {
        if (
          item.existing &&
          (item.existing.sourcePath !== item.incoming.sourcePath ||
            item.existing.routePath !== item.incoming.routePath)
        ) {
          await transaction
            .update(documents)
            .set({
              routePath: `/__ingestion_staging__/${item.existing.id}`,
              sourcePath: `__ingestion_staging__/${item.existing.id}`,
            })
            .where(eq(documents.id, item.existing.id))
        }
      }

      const changes: ContentChange[] = []
      const translation = {
        fallbackSegments: 0,
        memoryHits: 0,
        pendingSegments: 0,
        translatedSegments: 0,
      }
      const documentIdsByRoute = new Map<string, string>()
      const englishOnlyDocumentIds: string[] = []
      let documentsMaterialized = 0
      for (const item of plan) {
        const changed = item.existing
          ? documentContentChanged(item.existing, item.incoming) ||
            item.existing.sourcePath !== item.incoming.sourcePath
          : true
        let documentId: string
        if (item.existing) {
          documentId = item.existing.id
          if (changed || item.existing.sourceCommit !== item.incoming.sourceCommit) {
            await transaction
              .update(documents)
              .set({
                ...item.incoming,
                deletedAt: null,
                ingestedAt: startedAt,
                isDeleted: false,
              })
              .where(eq(documents.id, documentId))
          }
        } else {
          const inserted = (
            await transaction
              .insert(documents)
              .values({ ...item.incoming, ingestedAt: startedAt })
              .returning({ id: documents.id })
          )[0]
          if (!inserted) throw new Error(`Failed to insert ${item.incoming.sourcePath}`)
          documentId = inserted.id
        }
        documentIdsByRoute.set(item.incoming.routePath, documentId)
        let materializationChanged = false
        const regionalNeedsMaterialization =
          changed ||
          deterministicContentLocales.some((locale) => {
            const previous = existingTranslationsByKey.get(`${documentId}:${locale}`)
            return !previous || previous.translationVersion !== contentGlossary.revision
          })
        for (const locale of deterministicContentLocales) {
          if (!regionalNeedsMaterialization) continue
          const translatedMarkdown = localizeContentMarkdown(item.incoming.rawMarkdown, locale)
          const translationHash = sha256(translatedMarkdown)
          const existingTranslation = existingTranslationsByKey.get(`${documentId}:${locale}`)
          if (
            existingTranslation?.translatedMarkdown === translatedMarkdown &&
            existingTranslation.translationHash === translationHash &&
            existingTranslation.translationVersion === contentGlossary.revision
          ) {
            continue
          }
          materializationChanged = true
          await transaction
            .insert(documentTranslations)
            .values({
              documentId,
              generatedAt: startedAt,
              locale,
              translatedMarkdown,
              translationHash,
              translationVersion: contentGlossary.revision,
            })
            .onConflictDoUpdate({
              target: [documentTranslations.documentId, documentTranslations.locale],
              set: {
                generatedAt: startedAt,
                translatedMarkdown,
                translationHash,
                translationVersion: contentGlossary.revision,
              },
            })
        }
        const previousEnglish = (
          await transaction
            .select()
            .from(documentTranslations)
            .where(
              and(
                eq(documentTranslations.documentId, documentId),
                eq(documentTranslations.locale, 'en-us'),
              ),
            )
        )[0]
        if (
          changed ||
          !cached.has(item.incoming.sourcePath) ||
          (memoryPlan?.enabled === true && state?.memoryEnabled !== true) ||
          !(memoryPlan?.enabled ?? state?.memoryEnabled ?? false) ||
          imported.documentIds.has(documentId) ||
          !previousEnglish ||
          previousEnglish.sourceHash !== item.incoming.sourceHash
        ) {
          const english = await reconcileEnglishTranslation(transaction, {
            documentId,
            rawMarkdown: item.incoming.rawMarkdown,
            sourceHash: item.incoming.sourceHash,
            timestamp: startedAt,
          })
          documentsMaterialized += 1
          materializationChanged ||= english.changed
          translation.fallbackSegments += english.metrics.fallbackSegmentCount
          translation.memoryHits += english.metrics.translationMemoryHits
          translation.pendingSegments += english.metrics.pendingSegmentCount
          translation.translatedSegments += english.metrics.translatedSegmentCount
        } else {
          translation.fallbackSegments += previousEnglish.fallbackSegmentCount
          translation.memoryHits += previousEnglish.translationMemoryHits
          translation.pendingSegments += previousEnglish.pendingSegmentCount
          translation.translatedSegments += previousEnglish.translatedSegmentCount
        }
        if (changed) {
          changes.push({
            documentId,
            ...(item.existing?.routePath !== undefined &&
            item.existing.routePath !== item.incoming.routePath
              ? { previousRoutePath: item.existing.routePath }
              : {}),
            routePath: item.incoming.routePath,
            sourceHash: item.incoming.sourceHash,
            type: changeType(item.existing, item.incoming),
          })
        } else if (materializationChanged) {
          if (!regionalNeedsMaterialization) englishOnlyDocumentIds.push(documentId)
          changes.push({
            documentId,
            routePath: item.incoming.routePath,
            sourceHash: item.incoming.sourceHash,
            type: 'modified',
          })
        }
      }

      const deleted = existingDocuments.filter(
        (document) => !document.isDeleted && !usedIds.has(document.id),
      )
      if (deleted.length > 0) {
        await transaction
          .update(documents)
          .set({ deletedAt: startedAt, isDeleted: true })
          .where(
            inArray(
              documents.id,
              deleted.map((document) => document.id),
            ),
          )
        changes.push(
          ...deleted.map((document) => ({
            documentId: document.id,
            previousRoutePath: document.routePath,
            routePath: document.routePath,
            sourceHash: document.sourceHash,
            type: 'deleted' as const,
          })),
        )
        await retireEnglishTranslations(
          transaction,
          deleted.map((document) => document.id),
        )
      }

      const existingAliases = await transaction
        .select()
        .from(contentAliases)
        .where(
          inArray(
            contentAliases.aliasPath,
            legacyContentAliases.map((alias) => alias.aliasPath),
          ),
        )
      const existingAliasesByPath = new Map(
        existingAliases.map((alias) => [alias.aliasPath, alias]),
      )
      const desiredAliasPaths = new Set<string>()
      for (const alias of legacyContentAliases) {
        const planned = plan.find((item) => item.incoming.routePath === alias.canonicalRoute)
        if (!planned) continue
        desiredAliasPaths.add(alias.aliasPath)
        const documentId = documentIdsByRoute.get(alias.canonicalRoute)
        if (!documentId) {
          const inserted = (
            await transaction
              .select({ id: documents.id })
              .from(documents)
              .where(
                and(eq(documents.routePath, alias.canonicalRoute), eq(documents.isDeleted, false)),
              )
              .limit(1)
          )[0]
          if (!inserted)
            throw new Error(`Approved alias target is missing: ${alias.canonicalRoute}`)
          const existingAlias = existingAliasesByPath.get(alias.aliasPath)
          if (
            existingAlias?.documentId !== inserted.id ||
            existingAlias.approvalReference !== legacyAliasApprovalReference
          ) {
            await transaction
              .insert(contentAliases)
              .values({
                aliasPath: alias.aliasPath,
                approvalReference: legacyAliasApprovalReference,
                documentId: inserted.id,
              })
              .onConflictDoUpdate({
                target: contentAliases.aliasPath,
                set: {
                  approvalReference: legacyAliasApprovalReference,
                  documentId: inserted.id,
                },
              })
          }
        } else {
          const existingAlias = existingAliasesByPath.get(alias.aliasPath)
          if (
            existingAlias?.documentId !== documentId ||
            existingAlias.approvalReference !== legacyAliasApprovalReference
          ) {
            await transaction
              .insert(contentAliases)
              .values({
                aliasPath: alias.aliasPath,
                approvalReference: legacyAliasApprovalReference,
                documentId,
              })
              .onConflictDoUpdate({
                target: contentAliases.aliasPath,
                set: { approvalReference: legacyAliasApprovalReference, documentId },
              })
          }
        }
      }
      const staleAliasPaths = existingAliases
        .map((alias) => alias.aliasPath)
        .filter((aliasPath) => !desiredAliasPaths.has(aliasPath))
      if (staleAliasPaths.length > 0) {
        await transaction
          .delete(contentAliases)
          .where(inArray(contentAliases.aliasPath, staleAliasPaths))
      }

      const filesChanged = plan.filter((item) =>
        item.existing
          ? documentContentChanged(item.existing, item.incoming) ||
            item.existing.sourcePath !== item.incoming.sourcePath
          : true,
      ).length
      const filesDeleted = deleted.length
      const canonicalPaths = snapshot.files.map((file) => file.path)
      const deletedFiles = sourceCache
        .filter((file) => file.path.startsWith('content/') && !canonicalPaths.includes(file.path))
        .map((file) => file.path)
      if (deletedFiles.length)
        await transaction
          .delete(contentSourceFiles)
          .where(inArray(contentSourceFiles.path, deletedFiles))
      for (const file of snapshot.files) {
        const blobSha = gitBlobSha(file.contents)
        if (cached.get(file.path)?.blobSha === blobSha) continue
        await transaction
          .insert(contentSourceFiles)
          .values({ ...file, blobSha, cacheVersion: sourceCacheVersion })
          .onConflictDoUpdate({
            target: contentSourceFiles.path,
            set: { ...file, blobSha, cacheVersion: sourceCacheVersion },
          })
      }
      await transaction
        .insert(contentSyncState)
        .values({
          key: 'canonical',
          sourceCommit: prepared.sourceCommit,
          memoryCommit: memoryPlan?.enabled ? prepared.sourceCommit : (state?.memoryCommit ?? null),
          memoryEnabled: memoryPlan?.enabled ?? state?.memoryEnabled ?? false,
        })
        .onConflictDoUpdate({
          target: contentSyncState.key,
          set: {
            sourceCommit: prepared.sourceCommit,
            memoryCommit: memoryPlan?.enabled
              ? prepared.sourceCommit
              : (state?.memoryCommit ?? null),
            memoryEnabled: memoryPlan?.enabled ?? state?.memoryEnabled ?? false,
          },
        })
      await transaction
        .update(ingestionRuns)
        .set({
          errorSummary: null,
          filesChanged,
          filesDeleted,
          filesSeen: prepared.documents.length,
          finishedAt: new Date(),
          status: 'completed',
        })
        .where(eq(ingestionRuns.operationalJobId, operationalJobId))

      return Object.freeze({
        changes,
        filesChanged,
        filesDeleted,
        filesSeen: prepared.documents.length,
        sourceCommit: prepared.sourceCommit,
        englishOnlyDocumentIds,
        memory: {
          entriesChanged: imported.entriesChanged,
          shardsChanged: imported.shardsChanged,
          documentsMaterialized,
          filesFetched:
            snapshot.filesFetched ?? snapshot.files.length + snapshot.memoryFiles.length,
          error: memoryError,
        },
        translation: Object.freeze(translation),
      })
    })

    if (result.changes.length > 0) {
      try {
        await this.deliverResultHooks(result)
      } catch (error: unknown) {
        throw new ContentHookDeliveryError(result, error)
      }
    }
    console.log(
      JSON.stringify({
        event: 'git_memory_content_sync',
        sourceCommit: result.sourceCommit,
        ...result.memory,
      }),
    )
    if (result.memory?.error) throw new ContentMemoryValidationError(result)
    return result
  }
}
