import { and, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createDatabaseClient } from '../database/client'
import { operationalJobs, ownerManagedDatasets } from '../database/schema'
import { applicationJobRequestSchema } from '../domain/persistence'
import { type ActorIdentity, ownerDatasetUpdateSchema } from './contracts'

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)

export class ApplicationJobStoreUnavailableError extends Error {
  override readonly name = 'ApplicationJobStoreUnavailableError'
}

export class ApplicationJobIdempotencyConflictError extends Error {
  override readonly name = 'ApplicationJobIdempotencyConflictError'
}

export class OwnerDatasetRevisionConflictError extends Error {
  override readonly name = 'OwnerDatasetRevisionConflictError'
  readonly currentRevision: number | null

  constructor(currentRevision: number | null) {
    super('Owner-managed dataset revision does not match')
    this.currentRevision = currentRevision
  }
}

function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(canonicalJson).join(',')}]`
  }
  if (value !== null && typeof value === 'object') {
    const record = z.record(z.string(), z.unknown()).parse(value)
    return `{${Object.keys(record)
      .sort()
      .map((key) => `${JSON.stringify(key)}:${canonicalJson(record[key])}`)
      .join(',')}}`
  }
  return JSON.stringify(value)
}

export class ApplicationJobRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'control-api',
      connectionString,
      connectionTimeoutMilliseconds: 1_000,
      maxConnections: 4,
      queryTimeoutMilliseconds: 1_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async availability() {
    try {
      await this.#client.pool.query('SELECT 1')
      return Object.freeze({ available: true as const })
    } catch {
      return Object.freeze({
        available: false as const,
        error: 'postgresql_application_job_store_unavailable',
      })
    }
  }

  async observabilitySnapshot(now = new Date()) {
    try {
      const result = await this.#client.pool.query(
        `SELECT
           count(*) FILTER (WHERE operational.status IN ('queued', 'retry_wait'))::int AS backlog_count,
           count(*) FILTER (WHERE operational.status = 'running')::int AS running_count,
           count(*) FILTER (WHERE operational.status = 'failed' AND operational.finished_at >= $1::timestamptz - interval '24 hours')::int AS failed_24h_count,
           count(*) FILTER (WHERE operational.status = 'running' AND operational.claim_expires_at <= $1::timestamptz)::int AS expired_lease_count,
           COALESCE(EXTRACT(EPOCH FROM ($1::timestamptz - min(operational.created_at) FILTER (WHERE operational.status IN ('queued', 'retry_wait', 'running')))), 0)::double precision AS oldest_incomplete_age_seconds,
           count(*) FILTER (WHERE translation.status = 'partial')::int AS budget_stop_count
         FROM app.operational_jobs AS operational
         LEFT JOIN app.translation_jobs AS translation ON translation.id = operational.id`,
        [now.toISOString()],
      )
      return Object.freeze(
        z
          .object({
            backlog_count: z.number().int().nonnegative(),
            budget_stop_count: z.number().int().nonnegative(),
            expired_lease_count: z.number().int().nonnegative(),
            failed_24h_count: z.number().int().nonnegative(),
            oldest_incomplete_age_seconds: z.number().nonnegative(),
            running_count: z.number().int().nonnegative(),
          })
          .parse(result.rows[0]),
      )
    } catch {
      throw new ApplicationJobStoreUnavailableError(
        'PostgreSQL application job observability is unavailable',
      )
    }
  }

  async createJob(requestInput: unknown, actor: ActorIdentity, idempotencyKeyInput: unknown) {
    const request = applicationJobRequestSchema.parse(requestInput)
    const idempotencyKey = idempotencyKeySchema.parse(idempotencyKeyInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        const inserted = await transaction
          .insert(operationalJobs)
          .values({
            idempotencyKey,
            jobType: request.jobType,
            payload: request.payload,
            requestedBy: actor.id,
          })
          .onConflictDoNothing({ target: operationalJobs.idempotencyKey })
          .returning()
        const created = inserted[0]
        if (created) {
          return Object.freeze({ created: true, job: created })
        }

        const existing = (
          await transaction
            .select()
            .from(operationalJobs)
            .where(eq(operationalJobs.idempotencyKey, idempotencyKey))
            .limit(1)
        )[0]
        if (
          !existing ||
          existing.requestedBy !== actor.id ||
          existing.jobType !== request.jobType ||
          canonicalJson(existing.payload) !== canonicalJson(request.payload)
        ) {
          throw new ApplicationJobIdempotencyConflictError(
            'Idempotency key was already used for a different application job',
          )
        }
        return Object.freeze({ created: false, job: existing })
      })
    } catch (error: unknown) {
      if (error instanceof ApplicationJobIdempotencyConflictError) {
        throw error
      }
      throw new ApplicationJobStoreUnavailableError(
        'PostgreSQL application job store is unavailable',
        { cause: error },
      )
    }
  }

  async getJob(idInput: unknown) {
    const id = z.uuid().parse(idInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        return (
          await transaction
            .select()
            .from(operationalJobs)
            .where(eq(operationalJobs.id, id))
            .limit(1)
        )[0]
      })
    } catch (error: unknown) {
      throw new ApplicationJobStoreUnavailableError(
        'PostgreSQL application job store is unavailable',
        { cause: error },
      )
    }
  }

  async updateOwnerDataset(updateInput: unknown, actor: ActorIdentity) {
    const update = ownerDatasetUpdateSchema.parse(updateInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        const updated = (
          await transaction
            .update(ownerManagedDatasets)
            .set({
              payload: update.payload,
              revision: update.expectedRevision + 1,
              updatedAt: new Date(),
              updatedBy: actor.id,
            })
            .where(
              and(
                eq(ownerManagedDatasets.datasetKey, update.datasetKey),
                eq(ownerManagedDatasets.revision, update.expectedRevision),
              ),
            )
            .returning()
        )[0]
        if (updated) {
          return updated
        }

        const current = (
          await transaction
            .select({ revision: ownerManagedDatasets.revision })
            .from(ownerManagedDatasets)
            .where(eq(ownerManagedDatasets.datasetKey, update.datasetKey))
            .limit(1)
        )[0]
        throw new OwnerDatasetRevisionConflictError(current?.revision ?? null)
      })
    } catch (error: unknown) {
      if (error instanceof OwnerDatasetRevisionConflictError) {
        throw error
      }
      throw new ApplicationJobStoreUnavailableError(
        'PostgreSQL owner-managed dataset store is unavailable',
        { cause: error },
      )
    }
  }
}
