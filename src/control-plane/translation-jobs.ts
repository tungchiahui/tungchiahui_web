import { randomUUID } from 'node:crypto'

import { and, desc, eq, sql } from 'drizzle-orm'
import { z } from 'zod'

import { createDatabaseClient } from '../database/client'
import { documents, operationalJobs, translationJobs } from '../database/schema'
import {
  type TranslationOperationRequest,
  translationOperationRequestSchema,
} from '../translation/contracts'
import {
  ApplicationJobIdempotencyConflictError,
  ApplicationJobStoreUnavailableError,
} from './application-jobs'
import type { ActorIdentity } from './contracts'

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)

export class TranslationArticleNotFoundError extends Error {
  override readonly name = 'TranslationArticleNotFoundError'
}

export class TranslationJobNotFoundError extends Error {
  override readonly name = 'TranslationJobNotFoundError'
}

function sameRequest(
  request: TranslationOperationRequest,
  documentId: string | null,
  existing: typeof translationJobs.$inferSelect,
) {
  return (
    existing.executionMode === request.mode &&
    existing.scope === request.scope &&
    existing.documentId === documentId &&
    existing.force === request.force &&
    Number(existing.budgetUsd) === (request.budgetUsd ?? 0)
  )
}

export class TranslationControlRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'control-api-translations',
      connectionString,
      connectionTimeoutMilliseconds: 1_000,
      maxConnections: 4,
      queryTimeoutMilliseconds: 2_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async create(requestInput: unknown, actor: ActorIdentity, idempotencyKeyInput: unknown) {
    const request = translationOperationRequestSchema.parse(requestInput)
    const idempotencyKey = idempotencyKeySchema.parse(idempotencyKeyInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        const documentId =
          request.scope === 'article'
            ? (
                await transaction
                  .select({ id: documents.id })
                  .from(documents)
                  .where(
                    and(
                      eq(documents.sourcePath, request.articleSourcePath ?? ''),
                      eq(documents.isDeleted, false),
                    ),
                  )
                  .limit(1)
              )[0]?.id
            : null
        if (request.scope === 'article' && documentId === undefined) {
          throw new TranslationArticleNotFoundError('Article source path was not found')
        }

        const id = randomUUID()
        const inserted = await transaction
          .insert(operationalJobs)
          .values({
            id,
            idempotencyKey,
            jobType: 'translation',
            payload: { translationJobId: id },
            requestedBy: actor.id,
          })
          .onConflictDoNothing({ target: operationalJobs.idempotencyKey })
          .returning({ id: operationalJobs.id })

        if (inserted[0]) {
          const job = (
            await transaction
              .insert(translationJobs)
              .values({
                budgetUsd: String(request.budgetUsd ?? 0),
                documentId: documentId ?? null,
                executionMode: request.mode,
                force: request.force,
                id,
                requestedBy: actor.id,
                scope: request.scope,
              })
              .returning()
          )[0]
          if (!job) throw new Error('Translation job detail was not created')
          return Object.freeze({ created: true, job })
        }

        const existingOperation = (
          await transaction
            .select()
            .from(operationalJobs)
            .where(eq(operationalJobs.idempotencyKey, idempotencyKey))
            .limit(1)
        )[0]
        const existing = existingOperation
          ? (
              await transaction
                .select()
                .from(translationJobs)
                .where(eq(translationJobs.id, existingOperation.id))
                .limit(1)
            )[0]
          : undefined
        if (
          !existingOperation ||
          !existing ||
          existingOperation.jobType !== 'translation' ||
          existingOperation.requestedBy !== actor.id ||
          !sameRequest(request, documentId ?? null, existing)
        ) {
          throw new ApplicationJobIdempotencyConflictError(
            'Idempotency key was already used for a different translation job',
          )
        }
        return Object.freeze({ created: false, job: existing })
      })
    } catch (error: unknown) {
      if (
        error instanceof ApplicationJobIdempotencyConflictError ||
        error instanceof TranslationArticleNotFoundError
      ) {
        throw error
      }
      throw new ApplicationJobStoreUnavailableError('Translation job store is unavailable', {
        cause: error,
      })
    }
  }

  async get(idInput: unknown) {
    const id = z.uuid().parse(idInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        return (
          await transaction
            .select({ operation: operationalJobs, translation: translationJobs })
            .from(operationalJobs)
            .innerJoin(translationJobs, eq(translationJobs.id, operationalJobs.id))
            .where(eq(translationJobs.id, id))
            .limit(1)
        )[0]
      })
    } catch (error: unknown) {
      throw new ApplicationJobStoreUnavailableError('Translation job store is unavailable', {
        cause: error,
      })
    }
  }

  async list(limitInput: unknown = 10) {
    const limit = z.coerce.number().int().min(1).max(50).parse(limitInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        return transaction
          .select({ operation: operationalJobs, translation: translationJobs })
          .from(operationalJobs)
          .innerJoin(translationJobs, eq(translationJobs.id, operationalJobs.id))
          .orderBy(desc(translationJobs.createdAt))
          .limit(limit)
      })
    } catch (error: unknown) {
      throw new ApplicationJobStoreUnavailableError('Translation job store is unavailable', {
        cause: error,
      })
    }
  }

  async cancel(idInput: unknown, actor: ActorIdentity) {
    const id = z.uuid().parse(idInput)
    try {
      return await this.#client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_control_api`)
        const existing = (
          await transaction
            .select({ operation: operationalJobs, translation: translationJobs })
            .from(operationalJobs)
            .innerJoin(translationJobs, eq(translationJobs.id, operationalJobs.id))
            .where(eq(translationJobs.id, id))
            .limit(1)
        )[0]
        if (!existing) throw new TranslationJobNotFoundError('Translation job was not found')
        if (['completed', 'failed', 'cancelled'].includes(existing.operation.status)) {
          return existing
        }
        const now = new Date()
        await transaction
          .update(translationJobs)
          .set({ cancelRequestedAt: now })
          .where(eq(translationJobs.id, id))
        if (existing.operation.status !== 'running') {
          await transaction
            .update(operationalJobs)
            .set({
              errorSummary: `cancelled by ${actor.id}`,
              finishedAt: now,
              status: 'cancelled',
            })
            .where(eq(operationalJobs.id, id))
          await transaction
            .update(translationJobs)
            .set({ finishedAt: now, status: 'cancelled' })
            .where(eq(translationJobs.id, id))
        }
        return (
          await transaction
            .select({ operation: operationalJobs, translation: translationJobs })
            .from(operationalJobs)
            .innerJoin(translationJobs, eq(translationJobs.id, operationalJobs.id))
            .where(eq(translationJobs.id, id))
            .limit(1)
        )[0]
      })
    } catch (error: unknown) {
      if (error instanceof TranslationJobNotFoundError) throw error
      throw new ApplicationJobStoreUnavailableError('Translation job store is unavailable', {
        cause: error,
      })
    }
  }
}
