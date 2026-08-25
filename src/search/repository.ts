import type { PoolClient } from 'pg'
import { z } from 'zod'

import { createDatabaseClient } from '../database/client'
import { type Locale, localeSchema } from '../domain/persistence'
import { locales } from '../i18n/locales'
import { searchRequestSchema, searchResultSchema } from './contracts'
import {
  materializeSearchProjection,
  type SearchProjection,
  type SearchSourceDocument,
} from './materialization'

const sourceRowSchema = z.object({
  content_type: z.enum(['blog', 'wiki']),
  document_id: z.uuid(),
  is_deleted: z.boolean(),
  raw_frontmatter: z.record(z.string(), z.json()),
  raw_markdown: z.string(),
  route_path: z.string().startsWith('/'),
  source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  source_path: z.string().min(1),
  source_updated_at: z.date().nullable(),
  title: z.string().min(1),
  translated_markdown: z.string().nullable(),
  translation_locale: z.enum(['zh-hk', 'zh-tw', 'en-us']).nullable(),
  translation_source_hash: z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .nullable(),
})

const searchRowSchema = z.object({
  body: z.string(),
  content_type: z.enum(['blog', 'wiki']),
  headings: z.string(),
  matched_context: z.enum(['title', 'heading', 'body', 'metadata']),
  metadata: z.string(),
  route_path: z.string().startsWith('/'),
  score: z.number().finite().nonnegative(),
  title: z.string().min(1),
})

function localeRoute(locale: Locale, routePath: string) {
  return `/${locale}${routePath}`
}

function compactText(value: string) {
  return value.replaceAll(/\s+/gu, ' ').trim()
}

export function createSearchSnippet(valueInput: unknown, queryInput: unknown, width = 180) {
  const value = compactText(z.string().parse(valueInput))
  const query = compactText(z.string().min(1).parse(queryInput))
  const safeWidth = z.number().int().min(80).max(400).parse(width)
  if (value.length <= safeWidth) return value
  const index = value.toLocaleLowerCase().indexOf(query.toLocaleLowerCase())
  const start = index < 0 ? 0 : Math.max(0, index - Math.floor((safeWidth - query.length) / 2))
  const end = Math.min(value.length, start + safeWidth)
  return `${start > 0 ? '…' : ''}${value.slice(start, end).trim()}${end < value.length ? '…' : ''}`
}

function groupSourceDocuments(rowsInput: readonly unknown[]): readonly SearchSourceDocument[] {
  const documents = new Map<string, SearchSourceDocument>()
  for (const rowInput of rowsInput) {
    const row = sourceRowSchema.parse(rowInput)
    if (row.is_deleted) continue
    const existing = documents.get(row.document_id)
    const translations = existing ? { ...existing.translations } : {}
    if (row.translation_locale !== null && row.translated_markdown !== null) {
      translations[row.translation_locale] = {
        markdown: row.translated_markdown,
        sourceHash: row.translation_source_hash,
      }
    }
    documents.set(row.document_id, {
      contentType: row.content_type,
      id: row.document_id,
      rawFrontmatter: row.raw_frontmatter,
      rawMarkdown: row.raw_markdown,
      routePath: row.route_path,
      sourceHash: row.source_hash,
      sourcePath: row.source_path,
      sourceUpdatedAt: row.source_updated_at,
      title: row.title,
      translations,
    })
  }
  return [...documents.values()]
}

async function readSourceDocuments(client: PoolClient, documentIds?: readonly string[]) {
  const parameters: unknown[] = []
  const documentFilter =
    documentIds === undefined
      ? ''
      : (() => {
          parameters.push(documentIds)
          return `WHERE document.id = ANY($${parameters.length}::uuid[])`
        })()
  const result = await client.query(
    `SELECT document.id AS document_id,
            document.content_type,
            document.source_path,
            document.title,
            document.raw_frontmatter,
            document.raw_markdown,
            document.source_hash,
            document.route_path,
            document.source_updated_at,
            document.is_deleted,
            translation.locale AS translation_locale,
            translation.translated_markdown,
            translation.source_hash AS translation_source_hash
       FROM app.documents AS document
       LEFT JOIN app.document_translations AS translation
         ON translation.document_id = document.id
        AND translation.locale IN ('zh-hk', 'zh-tw', 'en-us')
       ${documentFilter}
      ORDER BY document.id, translation.locale`,
    parameters,
  )
  return groupSourceDocuments(result.rows)
}

async function writeProjection(client: PoolClient, projection: SearchProjection) {
  await client.query(
    `INSERT INTO app.search_documents
      (document_id, locale, content_type, route_path, title, headings, body, metadata,
       source_hash, projection_hash, source_updated_at, updated_at)
     VALUES
      ($1, $2::app.locale, $3::app.content_type, $4, $5, $6, $7, $8, $9, $10, $11,
       clock_timestamp())
     ON CONFLICT (document_id, locale) DO UPDATE
       SET content_type = EXCLUDED.content_type,
           route_path = EXCLUDED.route_path,
           title = EXCLUDED.title,
           headings = EXCLUDED.headings,
           body = EXCLUDED.body,
           metadata = EXCLUDED.metadata,
           source_hash = EXCLUDED.source_hash,
           projection_hash = EXCLUDED.projection_hash,
           source_updated_at = EXCLUDED.source_updated_at,
           updated_at = clock_timestamp()
     WHERE app.search_documents.projection_hash IS DISTINCT FROM EXCLUDED.projection_hash`,
    [
      projection.documentId,
      projection.locale,
      projection.contentType,
      projection.routePath,
      projection.title,
      projection.headings,
      projection.body,
      projection.metadata,
      projection.sourceHash,
      projection.projectionHash,
      projection.sourceUpdatedAt,
    ],
  )
}

export class SearchIndexRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'postgresql-pgroonga-search',
      connectionString,
      maxConnections: 6,
      queryTimeoutMilliseconds: 30_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async #workerTransaction<T>(work: (client: PoolClient) => Promise<T>) {
    const client = await this.#client.pool.connect()
    try {
      await client.query('BEGIN')
      await client.query('SET LOCAL ROLE site_content_worker')
      const result = await work(client)
      await client.query('COMMIT')
      return result
    } catch (error: unknown) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
  }

  async refreshDocuments(
    documentIdsInput: readonly string[],
    localeInputs: readonly Locale[] = locales,
  ) {
    const documentIds = [...new Set(documentIdsInput.map((id) => z.uuid().parse(id)))].toSorted()
    const requestedLocales = [
      ...new Set(localeInputs.map((locale) => localeSchema.parse(locale))),
    ].toSorted()
    if (documentIds.length === 0 || requestedLocales.length === 0) return 0
    return this.#workerTransaction(async (client) => {
      for (const locale of requestedLocales) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `search-projection:${locale}`,
        ])
      }
      const documents = await readSourceDocuments(client, documentIds)
      await client.query(
        `DELETE FROM app.search_documents AS search
          USING app.documents AS document
          WHERE search.document_id = document.id
            AND document.is_deleted
            AND search.document_id = ANY($1::uuid[])
            AND search.locale = ANY($2::app.locale[])`,
        [documentIds, requestedLocales],
      )
      let count = 0
      for (const document of documents) {
        for (const locale of requestedLocales) {
          await writeProjection(client, materializeSearchProjection(document, locale))
          count += 1
        }
      }
      return count
    })
  }

  async reindexLocales(localeInputs: readonly Locale[]) {
    const requestedLocales = [
      ...new Set(localeInputs.map((locale) => localeSchema.parse(locale))),
    ].toSorted()
    return this.#workerTransaction(async (client) => {
      for (const locale of requestedLocales) {
        await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [
          `search-projection:${locale}`,
        ])
      }
      const documents = await readSourceDocuments(client)
      await client.query(`DELETE FROM app.search_documents WHERE locale = ANY($1::app.locale[])`, [
        requestedLocales,
      ])
      let count = 0
      for (const document of documents) {
        for (const locale of requestedLocales) {
          await writeProjection(client, materializeSearchProjection(document, locale))
          count += 1
        }
      }
      return count
    })
  }

  async search(input: unknown) {
    const request = searchRequestSchema.parse(input)
    const startedAt = performance.now()
    const client = await this.#client.pool.connect()
    let rowInputs: unknown[] = []
    try {
      await client.query('BEGIN READ ONLY')
      await client.query('SET LOCAL ROLE site_app')
      await client.query('SET LOCAL search_path TO app, public')
      const result = await client.query(
        `SELECT title,
                route_path,
                content_type,
                headings,
                body,
                metadata,
                CASE
                  WHEN lower(title) = lower($1::text) OR title &@ $1::text THEN 'title'
                  WHEN headings &@ $1::text THEN 'heading'
                  WHEN body &@ $1::text THEN 'body'
                  ELSE 'metadata'
                END AS matched_context,
                (CASE WHEN lower(title) = lower($1::text) THEN 1000.0 ELSE 0.0 END +
                 pgroonga_score(tableoid, ctid))::double precision AS score
           FROM app.search_documents
          WHERE locale = $2::app.locale
            AND ARRAY[title, headings, body, metadata] &@
                ($1::text, ARRAY[16, 8, 2, 4], 'search_documents_full_text_idx')::pgroonga_full_text_search_condition
          ORDER BY (lower(title) = lower($1::text)) DESC,
                   score DESC,
                   source_updated_at DESC NULLS LAST,
                   route_path ASC
          LIMIT $3`,
        [request.query, request.locale, request.limit],
      )
      rowInputs = result.rows
      await client.query('COMMIT')
    } catch (error: unknown) {
      await client.query('ROLLBACK')
      throw error
    } finally {
      client.release()
    }
    const results = rowInputs.map((rowInput) => {
      const row = searchRowSchema.parse(rowInput)
      const snippetSource =
        row.matched_context === 'title'
          ? row.title
          : row.matched_context === 'heading'
            ? row.headings
            : row.matched_context === 'body'
              ? row.body
              : row.metadata
      return Object.freeze(
        searchResultSchema.parse({
          contentType: row.content_type,
          locale: request.locale,
          matchedContext: row.matched_context,
          route: localeRoute(request.locale, row.route_path),
          score: row.score,
          snippet: createSearchSnippet(snippetSource, request.query),
          title: row.title,
        }),
      )
    })
    console.log(
      JSON.stringify({
        durationMilliseconds: Math.round(performance.now() - startedAt),
        event: 'search_query_executed',
        locale: request.locale,
        resultCount: results.length,
      }),
    )
    return Object.freeze(results)
  }
}
