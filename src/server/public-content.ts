import 'server-only'

import { and, asc, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { techFootprintPayloadSchema, weightLossPayloadSchema } from '../control-plane/contracts'
import { createDatabaseClient } from '../database/client'
import {
  contentAliases,
  documents,
  documentTranslations,
  ownerManagedDatasets,
} from '../database/schema'
import type { AppLocale } from '../i18n/locales'

const publicDocumentSchema = z.object({
  contentLocaleState: z.enum(['converted', 'fallback', 'mixed', 'source', 'translated']),
  contentType: z.enum(['blog', 'wiki']),
  fallbackSegmentCount: z.number().int().nonnegative(),
  id: z.uuid(),
  localizedMarkdown: z.string().min(1).nullable(),
  pendingSegmentCount: z.number().int().nonnegative(),
  rawFrontmatter: z.record(z.string(), z.json()),
  rawMarkdown: z.string(),
  routePath: z.string().startsWith('/'),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePath: z.string(),
  sourceUpdatedAt: z.coerce.date().nullable(),
  title: z.string().min(1),
  translatedSegmentCount: z.number().int().nonnegative(),
  translationMemoryHits: z.number().int().nonnegative(),
})

const publicDocumentRowSchema = publicDocumentSchema
  .omit({
    contentLocaleState: true,
    fallbackSegmentCount: true,
    pendingSegmentCount: true,
    translatedSegmentCount: true,
    translationMemoryHits: true,
  })
  .extend({
    fallbackSegmentCount: z.number().int().nonnegative().nullable(),
    localizedLocale: z.enum(['zh-cn', 'zh-hk', 'zh-tw', 'en-us']).nullable(),
    localizedSourceHash: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    pendingSegmentCount: z.number().int().nonnegative().nullable(),
    translatedSegmentCount: z.number().int().nonnegative().nullable(),
    translationMemoryHits: z.number().int().nonnegative().nullable(),
  })

export type PublicDocument = Readonly<z.infer<typeof publicDocumentSchema>>

export function parsePublicDocument(row: unknown) {
  return Object.freeze(publicDocumentSchema.parse(row))
}

export function parsePublicDocuments(rows: readonly unknown[]) {
  return Object.freeze(rows.map(parsePublicDocument))
}

function requestedTranslationLocale(locale: AppLocale) {
  return locale === 'zh-cn' ? 'zh-cn' : locale
}

function materializePublicDocument(rowInput: unknown, locale: AppLocale): PublicDocument {
  const row = publicDocumentRowSchema.parse(rowInput)
  const isCurrentEnglish =
    locale === 'en-us' &&
    row.localizedLocale === 'en-us' &&
    row.localizedSourceHash === row.sourceHash
  const hasRegionalMaterialization =
    (locale === 'zh-hk' || locale === 'zh-tw') && row.localizedLocale === locale
  const localizedMarkdown =
    isCurrentEnglish || hasRegionalMaterialization ? row.localizedMarkdown : null
  const fallbackSegmentCount = isCurrentEnglish ? (row.fallbackSegmentCount ?? 0) : 0
  const pendingSegmentCount = isCurrentEnglish ? (row.pendingSegmentCount ?? 0) : 0
  const translatedSegmentCount = isCurrentEnglish ? (row.translatedSegmentCount ?? 0) : 0
  const translationMemoryHits = isCurrentEnglish ? (row.translationMemoryHits ?? 0) : 0
  const contentLocaleState =
    locale === 'zh-cn'
      ? 'source'
      : locale === 'zh-hk' || locale === 'zh-tw'
        ? 'converted'
        : !isCurrentEnglish || fallbackSegmentCount > 0
          ? translatedSegmentCount > 0
            ? 'mixed'
            : 'fallback'
          : 'translated'
  return Object.freeze(
    publicDocumentSchema.parse({
      ...row,
      contentLocaleState,
      fallbackSegmentCount,
      localizedMarkdown,
      pendingSegmentCount,
      translatedSegmentCount,
      translationMemoryHits,
    }),
  )
}

export class PublicContentRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'nextjs-public-content',
      connectionString,
      maxConnections: 10,
      queryTimeoutMilliseconds: 5_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async list(contentType: 'blog' | 'wiki', locale: AppLocale) {
    return this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_app`)
      const rows = await transaction
        .select({
          contentType: documents.contentType,
          id: documents.id,
          localizedMarkdown: documentTranslations.translatedMarkdown,
          localizedLocale: documentTranslations.locale,
          localizedSourceHash: documentTranslations.sourceHash,
          fallbackSegmentCount: documentTranslations.fallbackSegmentCount,
          pendingSegmentCount: documentTranslations.pendingSegmentCount,
          translatedSegmentCount: documentTranslations.translatedSegmentCount,
          translationMemoryHits: documentTranslations.translationMemoryHits,
          rawFrontmatter: documents.rawFrontmatter,
          rawMarkdown: documents.rawMarkdown,
          routePath: documents.routePath,
          sourceHash: documents.sourceHash,
          sourcePath: documents.sourcePath,
          sourceUpdatedAt: documents.sourceUpdatedAt,
          title: documents.title,
        })
        .from(documents)
        .leftJoin(
          documentTranslations,
          and(
            eq(documentTranslations.documentId, documents.id),
            eq(documentTranslations.locale, requestedTranslationLocale(locale)),
          ),
        )
        .where(and(eq(documents.contentType, contentType), eq(documents.isDeleted, false)))
        .orderBy(desc(documents.sourceUpdatedAt), asc(documents.sourcePath))
      return Object.freeze(rows.map((row) => materializePublicDocument(row, locale)))
    })
  }

  async findByRoute(routePath: string, locale: AppLocale) {
    const validatedRoute = z.string().startsWith('/').min(2).parse(routePath)
    return this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_app`)
      const selection = {
        contentType: documents.contentType,
        id: documents.id,
        localizedMarkdown: documentTranslations.translatedMarkdown,
        localizedLocale: documentTranslations.locale,
        localizedSourceHash: documentTranslations.sourceHash,
        fallbackSegmentCount: documentTranslations.fallbackSegmentCount,
        pendingSegmentCount: documentTranslations.pendingSegmentCount,
        translatedSegmentCount: documentTranslations.translatedSegmentCount,
        translationMemoryHits: documentTranslations.translationMemoryHits,
        rawFrontmatter: documents.rawFrontmatter,
        rawMarkdown: documents.rawMarkdown,
        routePath: documents.routePath,
        sourceHash: documents.sourceHash,
        sourcePath: documents.sourcePath,
        sourceUpdatedAt: documents.sourceUpdatedAt,
        title: documents.title,
      }
      const canonical = await transaction
        .select(selection)
        .from(documents)
        .leftJoin(
          documentTranslations,
          and(
            eq(documentTranslations.documentId, documents.id),
            eq(documentTranslations.locale, requestedTranslationLocale(locale)),
          ),
        )
        .where(and(eq(documents.routePath, validatedRoute), eq(documents.isDeleted, false)))
        .limit(1)
      const direct = canonical[0]
      if (direct) return materializePublicDocument(direct, locale)

      const alias = await transaction
        .select(selection)
        .from(contentAliases)
        .innerJoin(documents, eq(contentAliases.documentId, documents.id))
        .leftJoin(
          documentTranslations,
          and(
            eq(documentTranslations.documentId, documents.id),
            eq(documentTranslations.locale, requestedTranslationLocale(locale)),
          ),
        )
        .where(and(eq(contentAliases.aliasPath, validatedRoute), eq(documents.isDeleted, false)))
        .limit(1)
      const resolved = alias[0]
      return resolved ? materializePublicDocument(resolved, locale) : undefined
    })
  }

  async readOwnerDataset(datasetKey: 'tech_footprint' | 'weight_loss') {
    return this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_app`)
      const row = (
        await transaction
          .select({
            payload: ownerManagedDatasets.payload,
            revision: ownerManagedDatasets.revision,
          })
          .from(ownerManagedDatasets)
          .where(eq(ownerManagedDatasets.datasetKey, datasetKey))
          .limit(1)
      )[0]
      if (!row) return undefined
      const payload =
        datasetKey === 'tech_footprint'
          ? techFootprintPayloadSchema.parse(row.payload)
          : weightLossPayloadSchema.parse(row.payload)
      return Object.freeze({
        payload,
        revision: z.number().int().nonnegative().parse(row.revision),
      })
    })
  }

  async isReady() {
    try {
      await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_app`)
        await transaction.execute(sql`SELECT 1`)
      })
      return true
    } catch {
      return false
    }
  }
}

let repository: PublicContentRepository | undefined

export function getPublicContentRepository() {
  repository ??= new PublicContentRepository(z.url().parse(process.env.DATABASE_URL))
  return repository
}
