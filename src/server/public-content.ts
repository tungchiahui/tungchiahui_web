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
  contentType: z.enum(['blog', 'wiki']),
  id: z.uuid(),
  localizedMarkdown: z.string().min(1).nullable(),
  rawFrontmatter: z.record(z.string(), z.json()),
  rawMarkdown: z.string(),
  routePath: z.string().startsWith('/'),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sourcePath: z.string(),
  sourceUpdatedAt: z.coerce.date().nullable(),
  title: z.string().min(1),
})

export type PublicDocument = Readonly<z.infer<typeof publicDocumentSchema>>

export function parsePublicDocument(row: unknown) {
  return Object.freeze(publicDocumentSchema.parse(row))
}

export function parsePublicDocuments(rows: readonly unknown[]) {
  return Object.freeze(rows.map(parsePublicDocument))
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
            eq(
              documentTranslations.locale,
              locale === 'zh-hk' || locale === 'zh-tw' ? locale : 'zh-cn',
            ),
          ),
        )
        .where(and(eq(documents.contentType, contentType), eq(documents.isDeleted, false)))
        .orderBy(desc(documents.sourceUpdatedAt), asc(documents.sourcePath))
      return parsePublicDocuments(rows)
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
            eq(
              documentTranslations.locale,
              locale === 'zh-hk' || locale === 'zh-tw' ? locale : 'zh-cn',
            ),
          ),
        )
        .where(and(eq(documents.routePath, validatedRoute), eq(documents.isDeleted, false)))
        .limit(1)
      const direct = canonical[0]
      if (direct) return parsePublicDocument(direct)

      const alias = await transaction
        .select(selection)
        .from(contentAliases)
        .innerJoin(documents, eq(contentAliases.documentId, documents.id))
        .leftJoin(
          documentTranslations,
          and(
            eq(documentTranslations.documentId, documents.id),
            eq(
              documentTranslations.locale,
              locale === 'zh-hk' || locale === 'zh-tw' ? locale : 'zh-cn',
            ),
          ),
        )
        .where(and(eq(contentAliases.aliasPath, validatedRoute), eq(documents.isDeleted, false)))
        .limit(1)
      const resolved = alias[0]
      return resolved ? parsePublicDocument(resolved) : undefined
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
