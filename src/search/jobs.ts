import { z } from 'zod'

import type { ContentIngestionHooks } from '../content/hooks'
import { createDatabaseClient } from '../database/client'
import { applicationJobRequestSchema, type Locale, localeSchema } from '../domain/persistence'

const claimedSearchJobSchema = z.object({
  attempt_count: z.number().int().positive(),
  claim_expires_at: z.date(),
  claimed_by: z.string().min(1),
  id: z.uuid(),
  job_type: z.literal('search_reindex'),
  max_attempts: z.number().int().positive(),
  payload: z.unknown(),
})

const searchJobProgressSchema = z
  .object({
    locales: z.array(localeSchema).min(1),
    phase: z.enum(['reindexing', 'completed']),
    refreshedDocuments: z.number().int().nonnegative(),
  })
  .strict()

type ClaimedSearchJob = Readonly<{
  attemptCount: number
  claimedBy: string
  id: string
  locales: readonly Locale[]
  maxAttempts: number
}>

export type SearchIndexer = Readonly<{
  reindexLocales(locales: readonly Locale[]): Promise<number>
}>

export class SearchJobRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'content-worker-search-jobs',
      connectionString,
      maxConnections: 4,
      queryTimeoutMilliseconds: 10_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async #transaction<T>(work: (client: import('pg').PoolClient) => Promise<T>) {
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

  async claimNext(workerIdInput: unknown, leaseMillisecondsInput = 300_000) {
    const claimedBy = z.string().min(1).max(200).parse(workerIdInput)
    const leaseMilliseconds = z
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .parse(leaseMillisecondsInput)
    return this.#transaction(async (client): Promise<ClaimedSearchJob | null> => {
      await client.query(
        `UPDATE app.operational_jobs
            SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed'::app.application_job_status ELSE 'retry_wait'::app.application_job_status END,
                available_at = clock_timestamp(), claimed_at = NULL, claimed_by = NULL,
                claim_expires_at = NULL,
                finished_at = CASE WHEN attempt_count >= max_attempts THEN clock_timestamp() ELSE NULL END,
                error_summary = 'search-worker claim expired before completion'
          WHERE job_type = 'search_reindex' AND status = 'running'
            AND claim_expires_at <= clock_timestamp()`,
      )
      const result = await client.query(
        `WITH candidate AS (
           SELECT id FROM app.operational_jobs
            WHERE job_type = 'search_reindex'
              AND status IN ('queued', 'retry_wait')
              AND available_at <= clock_timestamp()
              AND attempt_count < max_attempts
            ORDER BY created_at, id
            FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE app.operational_jobs AS jobs
            SET status = 'running', attempt_count = jobs.attempt_count + 1,
                claimed_at = clock_timestamp(), claimed_by = $1,
                claim_expires_at = clock_timestamp() + ($2 * interval '1 millisecond'),
                started_at = COALESCE(jobs.started_at, clock_timestamp()),
                finished_at = NULL, error_summary = NULL,
                progress = jsonb_build_object('phase', 'reindexing', 'locales', jobs.payload->'locales', 'refreshedDocuments', 0)
           FROM candidate
          WHERE jobs.id = candidate.id
        RETURNING jobs.id, jobs.job_type, jobs.payload, jobs.attempt_count, jobs.max_attempts,
                  jobs.claimed_by, jobs.claim_expires_at`,
        [claimedBy, leaseMilliseconds],
      )
      const row = result.rows[0]
      if (row === undefined) return null
      const claimed = claimedSearchJobSchema.parse(row)
      const request = applicationJobRequestSchema.parse({
        jobType: claimed.job_type,
        payload: claimed.payload,
      })
      if (request.jobType !== 'search_reindex') throw new Error('Claimed a non-search job')
      return Object.freeze({
        attemptCount: claimed.attempt_count,
        claimedBy: claimed.claimed_by,
        id: claimed.id,
        locales: request.payload.locales,
        maxAttempts: claimed.max_attempts,
      })
    })
  }

  async complete(job: ClaimedSearchJob, refreshedDocuments: number) {
    const progress = searchJobProgressSchema.parse({
      locales: job.locales,
      phase: 'completed',
      refreshedDocuments,
    })
    const result = await this.#transaction((client) =>
      client.query(
        `UPDATE app.operational_jobs
            SET status = 'completed', progress = $3::jsonb, finished_at = clock_timestamp(),
                claimed_at = NULL, claimed_by = NULL, claim_expires_at = NULL,
                error_summary = NULL
          WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
        [job.id, job.claimedBy, JSON.stringify(progress)],
      ),
    )
    if (result.rowCount !== 1) throw new Error('Search job claim was lost before completion')
    return progress
  }

  async fail(job: ClaimedSearchJob, error: unknown) {
    const message =
      error instanceof Error ? error.message.slice(0, 2_000) : 'Unknown search failure'
    const retry = job.attemptCount < job.maxAttempts
    const result = await this.#transaction((client) =>
      client.query(
        `UPDATE app.operational_jobs
            SET status = $3::app.application_job_status,
                available_at = CASE WHEN $3 = 'retry_wait' THEN clock_timestamp() ELSE available_at END,
                finished_at = CASE WHEN $3 = 'failed' THEN clock_timestamp() ELSE NULL END,
                claimed_at = NULL, claimed_by = NULL, claim_expires_at = NULL,
                error_summary = $4
          WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
        [job.id, job.claimedBy, retry ? 'retry_wait' : 'failed', message],
      ),
    )
    if (result.rowCount !== 1) throw new Error('Search job claim was lost while recording failure')
    return Object.freeze({ retryScheduled: retry })
  }
}

export class SearchWorker {
  readonly #hooks: Pick<ContentIngestionHooks, 'revalidatePublicContent'>
  readonly #indexer: SearchIndexer
  readonly #jobs: SearchJobRepository
  readonly #workerId: string

  constructor(
    options: Readonly<{
      hooks: Pick<ContentIngestionHooks, 'revalidatePublicContent'>
      indexer: SearchIndexer
      jobs: SearchJobRepository
      workerId: string
    }>,
  ) {
    this.#hooks = options.hooks
    this.#indexer = options.indexer
    this.#jobs = options.jobs
    this.#workerId = options.workerId
  }

  async runOnce() {
    const job = await this.#jobs.claimNext(this.#workerId)
    if (!job) return Object.freeze({ claimed: false as const })
    try {
      const refreshedDocuments = await this.#indexer.reindexLocales(job.locales)
      await this.#hooks.revalidatePublicContent({
        changes: [],
        searchLocales: [...job.locales],
        sourceCommit: '0'.repeat(40),
        translation: {
          fallbackSegments: 0,
          memoryHits: 0,
          pendingSegments: 0,
          translatedSegments: 0,
        },
      })
      const progress = await this.#jobs.complete(job, refreshedDocuments)
      console.log(
        JSON.stringify({
          event: 'search_reindex_completed',
          jobId: job.id,
          locales: job.locales,
          refreshedDocuments,
        }),
      )
      return Object.freeze({ claimed: true as const, jobId: job.id, progress })
    } catch (error: unknown) {
      const failure = await this.#jobs.fail(job, error)
      return Object.freeze({
        claimed: true as const,
        jobId: job.id,
        retryScheduled: failure.retryScheduled,
      })
    }
  }
}
