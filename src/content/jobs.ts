import { z } from 'zod'

import { createDatabaseClient } from '../database/client'
import { applicationJobRequestSchema } from '../domain/persistence'
import { redactTelemetryText } from '../observability/telemetry'

const claimedJobSchema = z.object({
  attempt_count: z.number().int().positive(),
  claim_expires_at: z.date(),
  claimed_by: z.string().min(1),
  id: z.uuid(),
  job_type: z.literal('content_sync'),
  max_attempts: z.number().int().positive(),
  payload: z.unknown(),
  progress: z.unknown(),
})

export type ClaimedContentJob = Readonly<{
  attemptCount: number
  claimExpiresAt: Date
  claimedBy: string
  id: string
  maxAttempts: number
  progress: unknown
  request: Extract<z.infer<typeof applicationJobRequestSchema>, { jobType: 'content_sync' }>
}>

export class ContentJobRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'content-worker-jobs',
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

  async claimNext(workerId: string, leaseMilliseconds: number): Promise<ClaimedContentJob | null> {
    const claimedBy = z.string().min(1).max(200).parse(workerId)
    const lease = z.number().int().min(1_000).max(3_600_000).parse(leaseMilliseconds)
    return this.#transaction(async (client) => {
      await client.query(
        `UPDATE app.operational_jobs
         SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed'::app.application_job_status ELSE 'retry_wait'::app.application_job_status END,
             available_at = clock_timestamp(),
             claimed_at = NULL,
             claimed_by = NULL,
             claim_expires_at = NULL,
             finished_at = CASE WHEN attempt_count >= max_attempts THEN clock_timestamp() ELSE NULL END,
             error_summary = 'content-worker claim expired before completion'
         WHERE job_type = 'content_sync'
           AND status = 'running'
           AND claim_expires_at <= clock_timestamp()`,
      )
      const result = await client.query(
        `WITH candidate AS (
           SELECT id
           FROM app.operational_jobs
           WHERE job_type = 'content_sync'
             AND status IN ('queued', 'retry_wait')
             AND available_at <= clock_timestamp()
             AND attempt_count < max_attempts
           ORDER BY created_at, id
           FOR UPDATE SKIP LOCKED
           LIMIT 1
         )
         UPDATE app.operational_jobs AS jobs
         SET status = 'running',
             attempt_count = jobs.attempt_count + 1,
             claimed_at = clock_timestamp(),
             claimed_by = $1,
             claim_expires_at = clock_timestamp() + ($2 * interval '1 millisecond'),
             started_at = COALESCE(jobs.started_at, clock_timestamp()),
             finished_at = NULL,
             error_summary = NULL
         FROM candidate
         WHERE jobs.id = candidate.id
         RETURNING jobs.id, jobs.job_type, jobs.payload, jobs.progress, jobs.attempt_count, jobs.max_attempts,
                   jobs.claimed_by, jobs.claim_expires_at`,
        [claimedBy, lease],
      )
      const row = result.rows[0]
      if (row === undefined) return null
      const claimed = claimedJobSchema.parse(row)
      const request = applicationJobRequestSchema.parse({
        jobType: claimed.job_type,
        payload: claimed.payload,
      })
      if (request.jobType !== 'content_sync') {
        throw new Error('Content worker claimed a non-content job')
      }
      return Object.freeze({
        attemptCount: claimed.attempt_count,
        claimExpiresAt: claimed.claim_expires_at,
        claimedBy: claimed.claimed_by,
        id: claimed.id,
        maxAttempts: claimed.max_attempts,
        progress: claimed.progress,
        request,
      })
    })
  }

  async updateProgress(job: ClaimedContentJob, progress: Readonly<Record<string, unknown>>) {
    const result = await this.#transaction((client) =>
      client.query(
        `UPDATE app.operational_jobs
         SET progress = $3::jsonb
         WHERE id = $1 AND status = 'running' AND claimed_by = $2 AND claim_expires_at > clock_timestamp()`,
        [job.id, job.claimedBy, JSON.stringify(progress)],
      ),
    )
    if (result.rowCount !== 1) throw new Error('Content job claim was lost while updating progress')
  }

  async complete(job: ClaimedContentJob, progress: Readonly<Record<string, unknown>>) {
    const result = await this.#transaction((client) =>
      client.query(
        `UPDATE app.operational_jobs
         SET status = 'completed', progress = $3::jsonb, finished_at = clock_timestamp(),
             claimed_at = NULL, claimed_by = NULL, claim_expires_at = NULL, error_summary = NULL
         WHERE id = $1 AND status = 'running' AND claimed_by = $2 AND claim_expires_at > clock_timestamp()`,
        [job.id, job.claimedBy, JSON.stringify(progress)],
      ),
    )
    if (result.rowCount !== 1) throw new Error('Content job claim was lost before completion')
  }

  async fail(
    job: ClaimedContentJob,
    error: unknown,
    options: Readonly<{
      progress?: Readonly<Record<string, unknown>> | undefined
      retryable: boolean
      retryDelayMilliseconds: number
    }>,
  ) {
    const errorSummary =
      error instanceof Error ? redactTelemetryText(error.message) : 'Unknown content-worker failure'
    const retry = options.retryable && job.attemptCount < job.maxAttempts
    const result = await this.#transaction((client) =>
      client.query(
        `UPDATE app.operational_jobs
         SET status = $3::app.application_job_status,
             available_at = CASE WHEN $3 = 'retry_wait' THEN clock_timestamp() + ($4 * interval '1 millisecond') ELSE available_at END,
             finished_at = CASE WHEN $3 = 'failed' THEN clock_timestamp() ELSE NULL END,
             claimed_at = NULL, claimed_by = NULL, claim_expires_at = NULL, error_summary = $5,
             progress = COALESCE($6::jsonb, progress)
         WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
        [
          job.id,
          job.claimedBy,
          retry ? 'retry_wait' : 'failed',
          options.retryDelayMilliseconds,
          errorSummary,
          options.progress === undefined ? null : JSON.stringify(options.progress),
        ],
      ),
    )
    if (result.rowCount !== 1) throw new Error('Content job claim was lost while recording failure')
    return Object.freeze({ retryScheduled: retry })
  }
}
