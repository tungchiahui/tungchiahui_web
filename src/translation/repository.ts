import { z } from 'zod'

import { createDatabaseClient } from '../database/client'
import { createTargetedPatchContext, targetedPatchContextSchema } from './segmentation'

const patchRowSchema = z.object({
  document_id: z.uuid(),
  new_source: z.string().min(1),
  old_source: z.string().min(1),
  old_translation: z.string().min(1),
  ordinal: z.number().int().nonnegative(),
})

const metricRowSchema = z.object({
  fallback_segments: z.coerce.number().int().nonnegative(),
  memory_hits: z.coerce.number().int().nonnegative(),
  pending_segments: z.coerce.number().int().nonnegative(),
  translated_segments: z.coerce.number().int().nonnegative(),
})

export class TranslationMemoryRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'content-worker-translation-memory',
      connectionString,
      maxConnections: 4,
      queryTimeoutMilliseconds: 10_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async listTargetedPatchContexts(documentIdInput: unknown) {
    const documentId = z.uuid().parse(documentIdInput)
    const connection = await this.#client.pool.connect()
    try {
      await connection.query('BEGIN')
      await connection.query('SET LOCAL ROLE site_content_worker')
      const result = await connection.query(
        `SELECT mapping.document_id,
                mapping.ordinal,
                current_segment.source_text AS new_source,
                previous_segment.source_text AS old_source,
                previous_segment.translated_text AS old_translation
           FROM app.document_translation_segments mapping
           JOIN app.documents document
             ON document.id = mapping.document_id
            AND NOT document.is_deleted
           JOIN app.translation_segments current_segment
             ON current_segment.id = mapping.segment_id
           JOIN app.translation_segments previous_segment
             ON previous_segment.id = mapping.previous_segment_id
          WHERE mapping.document_id = $1
            AND mapping.locale = 'en-us'
            AND current_segment.status = 'pending'
            AND previous_segment.status IN ('translated', 'reviewed')
            AND previous_segment.translated_text IS NOT NULL
          ORDER BY mapping.ordinal`,
        [documentId],
      )
      await connection.query('COMMIT')
      return Object.freeze(
        result.rows.map((row: unknown) => {
          const parsed = patchRowSchema.parse(row)
          return Object.freeze({
            documentId: parsed.document_id,
            ordinal: parsed.ordinal,
            patch: targetedPatchContextSchema.parse(
              createTargetedPatchContext({
                newSource: parsed.new_source,
                oldSource: parsed.old_source,
                oldTranslation: parsed.old_translation,
              }),
            ),
          })
        }),
      )
    } catch (error: unknown) {
      await connection.query('ROLLBACK')
      throw error
    } finally {
      connection.release()
    }
  }

  async readMetrics() {
    const connection = await this.#client.pool.connect()
    try {
      await connection.query('BEGIN')
      await connection.query('SET LOCAL ROLE site_content_worker')
      const result = await connection.query(
        `SELECT coalesce(sum(translation.pending_segment_count), 0) AS pending_segments,
                coalesce(sum(translation.fallback_segment_count), 0) AS fallback_segments,
                coalesce(sum(translation.translated_segment_count), 0) AS translated_segments,
                coalesce(sum(translation.translation_memory_hits), 0) AS memory_hits
           FROM app.document_translations translation
           JOIN app.documents document
             ON document.id = translation.document_id
            AND NOT document.is_deleted
          WHERE translation.locale = 'en-us'
            AND translation.source_hash = document.source_hash`,
      )
      await connection.query('COMMIT')
      return Object.freeze(metricRowSchema.parse(result.rows[0]))
    } catch (error: unknown) {
      await connection.query('ROLLBACK')
      throw error
    } finally {
      connection.release()
    }
  }
}
