import { and, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createDatabaseClient } from '../database/client'
import { contentAliases, documents, ingestionRuns } from '../database/schema'
import { sourceCommitSchema } from '../domain/persistence'
import type { PreparedContentDocument } from './contracts'
import {
  type ContentChange,
  type ContentHookInput,
  type ContentIngestionHooks,
  contentHookInputSchema,
} from './hooks'
import { legacyAliasApprovalReference, legacyWikiAliases } from './legacy-aliases'
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
}>

export class ContentHookDeliveryError extends Error {
  override readonly name = 'ContentHookDeliveryError'
  readonly result: IngestionResult

  constructor(result: IngestionResult, cause: unknown) {
    super('Content materialization completed but downstream hooks were not delivered', { cause })
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
    await this.#hooks.revalidateZhCn(validated)
  }

  async recordFailure(jobIdInput: unknown, sourceCommitInput: unknown, error: unknown) {
    const operationalJobId = jobIdSchema.parse(jobIdInput)
    const sourceCommit = sourceCommitSchema.parse(sourceCommitInput)
    const errorSummary =
      error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown ingestion failure'
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
    let prepared: ReturnType<typeof prepareContentSnapshot>
    try {
      prepared = prepareContentSnapshot(snapshotInput)
    } catch (error: unknown) {
      if (error instanceof ContentRouteCollisionError) throw error
      throw new ContentSnapshotValidationError('Canonical content snapshot validation failed', {
        cause: error,
      })
    }
    const result = await this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      const existingDocuments = await transaction.select().from(documents)
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
      const documentIdsByRoute = new Map<string, string>()
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
      }

      const existingAliases = await transaction
        .select()
        .from(contentAliases)
        .where(
          inArray(
            contentAliases.aliasPath,
            legacyWikiAliases.map((alias) => alias.aliasPath),
          ),
        )
      const existingAliasesByPath = new Map(
        existingAliases.map((alias) => [alias.aliasPath, alias]),
      )
      const desiredAliasPaths = new Set<string>()
      for (const alias of legacyWikiAliases) {
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

      const filesChanged = changes.filter((change) => change.type !== 'deleted').length
      const filesDeleted = deleted.length
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
      })
    })

    if (result.changes.length > 0) {
      try {
        await this.deliverHooks({ changes: [...result.changes], sourceCommit: result.sourceCommit })
      } catch (error: unknown) {
        throw new ContentHookDeliveryError(result, error)
      }
    }
    return result
  }
}
