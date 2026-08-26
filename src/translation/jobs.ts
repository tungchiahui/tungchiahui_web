import { createHash } from 'node:crypto'

import { and, asc, eq, inArray, sql } from 'drizzle-orm'
import { z } from 'zod'
import {
  type ContentHookInput,
  type ContentIngestionHooks,
  contentHookInputSchema,
} from '../content/hooks'
import { createDatabaseClient } from '../database/client'
import {
  documents,
  documentTranslationSegments,
  documentTranslations,
  operationalJobs,
  translationJobs,
  translationSegments,
} from '../database/schema'
import { redactTelemetryText } from '../observability/telemetry'
import { type TranslationJobProgress, translationJobProgressSchema } from './contracts'
import { reconcileEnglishTranslation } from './memory'
import type {
  TranslationProvider,
  TranslationProviderRequest,
  TranslationProviderResponse,
} from './provider'
import {
  createTargetedPatchContext,
  isSafeTranslationCandidate,
  segmentMarkdownForTranslation,
} from './segmentation'

type DatabaseClient = ReturnType<typeof createDatabaseClient>

const claimedTranslationJobSchema = z.object({
  attempt_count: z.number().int().positive(),
  budget_usd: z.string(),
  claim_expires_at: z.date(),
  claimed_by: z.string().min(1),
  document_id: z.uuid().nullable(),
  execution_mode: z.enum(['dry-run', 'execute']),
  force: z.boolean(),
  id: z.uuid(),
  max_attempts: z.number().int().positive(),
  progress: z.unknown(),
  scope: z.enum(['pending', 'changed', 'article', 'all']),
})

const candidateRowSchema = z.object({
  context_fingerprint: z.string().min(1),
  old_source: z.string().min(1).nullable(),
  old_translation: z.string().min(1).nullable(),
  segment_id: z.uuid(),
  source_hash: z.string().regex(/^[a-f0-9]{64}$/),
  source_text: z.string().min(1),
})

export type ClaimedTranslationJob = Readonly<{
  attemptCount: number
  budgetUsd: number
  claimExpiresAt: Date
  claimedBy: string
  documentId: string | null
  executionMode: 'dry-run' | 'execute'
  force: boolean
  id: string
  maxAttempts: number
  progress: TranslationJobProgress | null
  scope: 'pending' | 'changed' | 'article' | 'all'
}>

type Candidate = Readonly<{
  contextFingerprint: string
  oldSource: string | null
  oldTranslation: string | null
  segmentId: string
  sourceHash: string
  sourceText: string
}>

function emptyProgress(): TranslationJobProgress {
  return Object.freeze({
    completedSegmentIds: [],
    documentsAffected: 0,
    estimatedCostUsd: 0,
    estimatedInputTokens: 0,
    estimatedOutputTokens: 0,
    phase: 'planned',
    plannedSegmentIds: [],
    providerCalls: 0,
    revalidationDocumentIds: [],
  })
}

function requestId(jobId: string, segmentId: string) {
  const hex = createHash('sha256').update(`${jobId}:${segmentId}`).digest('hex').slice(0, 32)
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(13, 16)}-8${hex.slice(17, 20)}-${hex.slice(20)}`
}

function candidateRequest(jobId: string, candidate: Candidate): TranslationProviderRequest {
  const bytes = Buffer.byteLength(candidate.sourceText, 'utf8')
  return Object.freeze({
    context:
      candidate.oldSource !== null && candidate.oldTranslation !== null
        ? createTargetedPatchContext({
            newSource: candidate.sourceText,
            oldSource: candidate.oldSource,
            oldTranslation: candidate.oldTranslation,
          })
        : null,
    maxOutputTokens: Math.max(64, Math.min(100_000, bytes * 2)),
    requestId: requestId(jobId, candidate.segmentId),
    sourceLocale: 'zh-cn',
    sourceText: candidate.sourceText,
    targetLocale: 'en-us',
  })
}

function parseCandidate(row: unknown): Candidate {
  const parsed = candidateRowSchema.parse(row)
  return Object.freeze({
    contextFingerprint: parsed.context_fingerprint,
    oldSource: parsed.old_source,
    oldTranslation: parsed.old_translation,
    segmentId: parsed.segment_id,
    sourceHash: parsed.source_hash,
    sourceText: parsed.source_text,
  })
}

function roundUsd(value: number) {
  return Math.round((value + Number.EPSILON) * 1_000_000) / 1_000_000
}

export class TranslationJobRepository {
  readonly #client: DatabaseClient

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'content-worker-translations',
      connectionString,
      maxConnections: 4,
      queryTimeoutMilliseconds: 15_000,
    })
  }

  async close() {
    await this.#client.close()
  }

  async #poolTransaction<T>(work: (client: import('pg').PoolClient) => Promise<T>) {
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
    const workerId = z.string().min(1).max(200).parse(workerIdInput)
    const leaseMilliseconds = z
      .number()
      .int()
      .min(1_000)
      .max(3_600_000)
      .parse(leaseMillisecondsInput)
    return this.#poolTransaction(async (client) => {
      await client.query(
        `UPDATE app.operational_jobs
            SET status = CASE WHEN attempt_count >= max_attempts THEN 'failed'::app.application_job_status ELSE 'retry_wait'::app.application_job_status END,
                available_at = clock_timestamp(), claimed_at = NULL, claimed_by = NULL,
                claim_expires_at = NULL,
                finished_at = CASE WHEN attempt_count >= max_attempts THEN clock_timestamp() ELSE NULL END,
                error_summary = 'translation-worker claim expired before completion'
          WHERE job_type = 'translation' AND status = 'running'
            AND claim_expires_at <= clock_timestamp()`,
      )
      const result = await client.query(
        `WITH candidate AS (
           SELECT id FROM app.operational_jobs
            WHERE job_type = 'translation' AND status IN ('queued', 'retry_wait')
              AND available_at <= clock_timestamp() AND attempt_count < max_attempts
            ORDER BY created_at, id FOR UPDATE SKIP LOCKED LIMIT 1
         )
         UPDATE app.operational_jobs AS jobs
            SET status = 'running', attempt_count = jobs.attempt_count + 1,
                claimed_at = clock_timestamp(), claimed_by = $1,
                claim_expires_at = clock_timestamp() + ($2 * interval '1 millisecond'),
                started_at = COALESCE(jobs.started_at, clock_timestamp()),
                finished_at = NULL, error_summary = NULL
           FROM candidate
          WHERE jobs.id = candidate.id
      RETURNING jobs.id, jobs.progress, jobs.attempt_count, jobs.max_attempts,
                jobs.claimed_by, jobs.claim_expires_at`,
        [workerId, leaseMilliseconds],
      )
      const operation = result.rows[0]
      if (operation === undefined) return null
      const detail = await client.query(
        `UPDATE app.translation_jobs
            SET status = 'running', started_at = COALESCE(started_at, clock_timestamp()),
                finished_at = NULL, error_summary = NULL
          WHERE id = $1
      RETURNING execution_mode, scope, document_id, force, budget_usd`,
        [operation.id],
      )
      const parsed = claimedTranslationJobSchema.parse({ ...operation, ...detail.rows[0] })
      const progressResult = translationJobProgressSchema.safeParse(parsed.progress)
      return Object.freeze({
        attemptCount: parsed.attempt_count,
        budgetUsd: Number(parsed.budget_usd),
        claimExpiresAt: parsed.claim_expires_at,
        claimedBy: parsed.claimed_by,
        documentId: parsed.document_id,
        executionMode: parsed.execution_mode,
        force: parsed.force,
        id: parsed.id,
        maxAttempts: parsed.max_attempts,
        progress: progressResult.success ? progressResult.data : null,
        scope: parsed.scope,
      })
    })
  }

  async #candidateIds(job: ClaimedTranslationJob) {
    const connection = await this.#client.pool.connect()
    try {
      await connection.query('BEGIN')
      await connection.query('SET LOCAL ROLE site_content_worker')
      const result = await connection.query(
        `SELECT DISTINCT segment.id
           FROM app.document_translation_segments mapping
           JOIN app.documents document ON document.id = mapping.document_id AND NOT document.is_deleted
           JOIN app.translation_segments segment ON segment.id = mapping.segment_id
          WHERE mapping.locale = 'en-us' AND segment.is_translatable
            AND ($1::boolean OR segment.status = 'pending')
            AND ($2::app.translation_scope <> 'changed' OR mapping.previous_segment_id IS NOT NULL)
            AND ($2::app.translation_scope <> 'article' OR document.id = $3::uuid)
          ORDER BY segment.id`,
        [job.force, job.scope, job.documentId],
      )
      await connection.query('COMMIT')
      return result.rows.map((row: unknown) => z.object({ id: z.uuid() }).parse(row).id)
    } catch (error: unknown) {
      await connection.query('ROLLBACK')
      throw error
    } finally {
      connection.release()
    }
  }

  async readCandidate(segmentIdInput: unknown) {
    const segmentId = z.uuid().parse(segmentIdInput)
    return this.#poolTransaction(async (client) => {
      const result = await client.query(
        `SELECT segment.id AS segment_id, segment.source_hash, segment.source_text,
                segment.context_fingerprint,
                previous.source_text AS old_source,
                previous.translated_text AS old_translation
           FROM app.translation_segments segment
           LEFT JOIN LATERAL (
             SELECT predecessor.source_text, predecessor.translated_text
               FROM app.document_translation_segments mapping
               JOIN app.translation_segments predecessor ON predecessor.id = mapping.previous_segment_id
              WHERE mapping.segment_id = segment.id
                AND predecessor.status IN ('translated', 'reviewed')
                AND predecessor.translated_text IS NOT NULL
              ORDER BY mapping.ordinal LIMIT 1
           ) previous ON true
          WHERE segment.id = $1 AND segment.is_translatable`,
        [segmentId],
      )
      const row = result.rows[0]
      if (!row) throw new Error(`Translation segment ${segmentId} is not available`)
      return parseCandidate(row)
    })
  }

  async plan(job: ClaimedTranslationJob, provider: TranslationProvider) {
    if (job.progress) return job.progress
    const plannedSegmentIds = await this.#candidateIds(job)
    let estimatedInputTokens = 0
    let estimatedOutputTokens = 0
    let estimatedCostUsd = 0
    const documents = new Set<string>()
    for (const segmentId of plannedSegmentIds) {
      const candidate = await this.readCandidate(segmentId)
      const estimate = provider.estimate(candidateRequest(job.id, candidate))
      estimatedInputTokens += estimate.estimatedInputTokens
      estimatedOutputTokens += estimate.estimatedOutputTokens
      estimatedCostUsd = roundUsd(estimatedCostUsd + estimate.maximumCostUsd)
      const referenced = await this.#poolTransaction((client) =>
        client.query<{ document_id: string }>(
          'SELECT DISTINCT document_id FROM app.document_translation_segments WHERE segment_id = $1',
          [segmentId],
        ),
      )
      for (const row of referenced.rows) documents.add(z.uuid().parse(row.document_id))
    }
    const progress = translationJobProgressSchema.parse({
      ...emptyProgress(),
      documentsAffected: documents.size,
      estimatedCostUsd,
      estimatedInputTokens,
      estimatedOutputTokens,
      plannedSegmentIds,
    })
    await this.#poolTransaction(async (client) => {
      await client.query(
        `UPDATE app.translation_jobs
            SET estimated_input_tokens = $2, estimated_output_tokens = $3,
                estimated_cost_usd = $4, remaining_segment_count = $5
          WHERE id = $1`,
        [
          job.id,
          estimatedInputTokens,
          estimatedOutputTokens,
          estimatedCostUsd,
          plannedSegmentIds.length,
        ],
      )
      await client.query(
        `UPDATE app.operational_jobs SET progress = $3::jsonb
          WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
        [job.id, job.claimedBy, JSON.stringify(progress)],
      )
    })
    return progress
  }

  async cancellationRequested(job: ClaimedTranslationJob) {
    return this.#poolTransaction(async (client) => {
      const result = await client.query<{ cancel_requested: boolean }>(
        'SELECT cancel_requested_at IS NOT NULL AS cancel_requested FROM app.translation_jobs WHERE id = $1',
        [job.id],
      )
      return result.rows[0]?.cancel_requested ?? true
    })
  }

  async readStatus(idInput: unknown) {
    const id = z.uuid().parse(idInput)
    return this.#poolTransaction(async (client) => {
      const result = await client.query<{ actual_cost_usd: string }>(
        'SELECT actual_cost_usd FROM app.translation_jobs WHERE id = $1',
        [id],
      )
      return Object.freeze({ actualCostUsd: Number(result.rows[0]?.actual_cost_usd ?? 0) })
    })
  }

  async recordTranslation(
    job: ClaimedTranslationJob,
    progress: TranslationJobProgress,
    candidate: Candidate,
    response: TranslationProviderResponse,
  ) {
    const blocks = segmentMarkdownForTranslation(candidate.sourceText)
    const block = blocks.length === 1 ? blocks[0] : undefined
    if (
      !block ||
      block.sourceHash !== candidate.sourceHash ||
      block.contextFingerprint !== candidate.contextFingerprint ||
      !isSafeTranslationCandidate(block, response.translatedText)
    ) {
      throw new Error('Provider response did not preserve the validated Markdown block contract')
    }
    return this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      const updated = (
        await transaction
          .update(translationSegments)
          .set({
            costUsd: String(response.usage.costUsd),
            inputTokens: response.usage.inputTokens,
            model: response.model,
            outputTokens: response.usage.outputTokens,
            provider: response.provider,
            status: 'translated',
            translatedText: response.translatedText,
            updatedAt: new Date(),
          })
          .where(eq(translationSegments.id, candidate.segmentId))
          .returning({ id: translationSegments.id })
      )[0]
      if (!updated) throw new Error('Translation segment disappeared before persistence')

      const affectedDocuments = await transaction
        .select({ document: documents })
        .from(documentTranslationSegments)
        .innerJoin(documents, eq(documents.id, documentTranslationSegments.documentId))
        .where(
          and(
            eq(documentTranslationSegments.segmentId, candidate.segmentId),
            eq(documents.isDeleted, false),
          ),
        )
        .orderBy(asc(documents.id))
      const hookInputs: ContentHookInput[] = []
      const uniqueDocuments = new Map(
        affectedDocuments.map((row) => [row.document.id, row.document] as const),
      )
      for (const document of uniqueDocuments.values()) {
        const materialized = await reconcileEnglishTranslation(transaction, {
          documentId: document.id,
          rawMarkdown: document.rawMarkdown,
          sourceHash: document.sourceHash,
          timestamp: new Date(),
        })
        hookInputs.push({
          changes: [
            {
              documentId: document.id,
              routePath: document.routePath,
              sourceHash: document.sourceHash,
              type: 'modified',
            },
          ],
          searchLocales: ['en-us'],
          sourceCommit: document.sourceCommit,
          translation: {
            fallbackSegments: materialized.metrics.fallbackSegmentCount,
            memoryHits: materialized.metrics.translationMemoryHits,
            pendingSegments: materialized.metrics.pendingSegmentCount,
            translatedSegments: materialized.metrics.translatedSegmentCount,
          },
        })
      }
      const completedSegmentIds = [
        ...new Set([...progress.completedSegmentIds, candidate.segmentId]),
      ]
      const revalidationDocumentIds = hookInputs.map((input) => input.changes[0]?.documentId ?? '')
      const nextProgress = translationJobProgressSchema.parse({
        ...progress,
        completedSegmentIds,
        phase: 'revalidating',
        providerCalls: progress.providerCalls + 1,
        revalidationDocumentIds,
      })
      await transaction
        .update(translationJobs)
        .set({
          actualCostUsd: sql`${translationJobs.actualCostUsd} + ${String(response.usage.costUsd)}::numeric`,
          actualInputTokens: sql`${translationJobs.actualInputTokens} + ${response.usage.inputTokens}`,
          actualOutputTokens: sql`${translationJobs.actualOutputTokens} + ${response.usage.outputTokens}`,
          completedSegmentCount: completedSegmentIds.length,
          providerRequestCount: nextProgress.providerCalls,
          remainingSegmentCount: Math.max(
            0,
            progress.plannedSegmentIds.length - completedSegmentIds.length,
          ),
        })
        .where(eq(translationJobs.id, job.id))
      await transaction
        .update(operationalJobs)
        .set({ progress: nextProgress })
        .where(
          and(
            eq(operationalJobs.id, job.id),
            eq(operationalJobs.status, 'running'),
            eq(operationalJobs.claimedBy, job.claimedBy),
          ),
        )
      return Object.freeze({ hookInputs, progress: nextProgress })
    })
  }

  async clearRevalidation(job: ClaimedTranslationJob, progress: TranslationJobProgress) {
    const next = translationJobProgressSchema.parse({
      ...progress,
      phase: 'translating',
      revalidationDocumentIds: [],
    })
    await this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      await transaction
        .update(operationalJobs)
        .set({ progress: next })
        .where(
          and(
            eq(operationalJobs.id, job.id),
            eq(operationalJobs.status, 'running'),
            eq(operationalJobs.claimedBy, job.claimedBy),
          ),
        )
    })
    return next
  }

  async readRevalidationInputs(documentIdsInput: readonly string[]) {
    const documentIds = documentIdsInput.map((id) => z.uuid().parse(id))
    if (documentIds.length === 0) return []
    const rows = await this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      return transaction
        .select({ document: documents, translation: documentTranslations })
        .from(documents)
        .innerJoin(
          documentTranslations,
          and(
            eq(documentTranslations.documentId, documents.id),
            eq(documentTranslations.locale, 'en-us'),
          ),
        )
        .where(inArray(documents.id, documentIds))
    })
    return rows.map(({ document, translation }) =>
      contentHookInputSchema.parse({
        changes: [
          {
            documentId: document.id,
            routePath: document.routePath,
            sourceHash: document.sourceHash,
            type: 'modified',
          },
        ],
        searchLocales: ['en-us'],
        sourceCommit: document.sourceCommit,
        translation: {
          fallbackSegments: translation.fallbackSegmentCount,
          memoryHits: translation.translationMemoryHits,
          pendingSegments: translation.pendingSegmentCount,
          translatedSegments: translation.translatedSegmentCount,
        },
      }),
    )
  }

  async finish(
    job: ClaimedTranslationJob,
    progress: TranslationJobProgress,
    status: 'completed' | 'partial' | 'cancelled',
  ) {
    const now = new Date()
    const completedProgress = translationJobProgressSchema.parse({
      ...progress,
      phase: 'completed',
      revalidationDocumentIds: [],
    })
    await this.#client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      await transaction
        .update(translationJobs)
        .set({ finishedAt: now, status })
        .where(eq(translationJobs.id, job.id))
      await transaction
        .update(operationalJobs)
        .set({
          claimExpiresAt: null,
          claimedAt: null,
          claimedBy: null,
          finishedAt: now,
          progress: completedProgress,
          status: status === 'cancelled' ? 'cancelled' : 'completed',
        })
        .where(
          and(
            eq(operationalJobs.id, job.id),
            eq(operationalJobs.status, 'running'),
            eq(operationalJobs.claimedBy, job.claimedBy),
          ),
        )
    })
    return completedProgress
  }

  async fail(
    job: ClaimedTranslationJob,
    progress: TranslationJobProgress,
    error: unknown,
    retryable: boolean,
  ) {
    const message =
      error instanceof Error ? redactTelemetryText(error.message) : 'Unknown translation failure'
    const retry = retryable && job.attemptCount < job.maxAttempts
    const terminalStatus = progress.completedSegmentIds.length > 0 ? 'partial' : 'failed'
    await this.#poolTransaction(async (client) => {
      await client.query(
        `UPDATE app.operational_jobs
            SET status = $3::app.application_job_status,
                available_at = CASE WHEN $3 = 'retry_wait' THEN clock_timestamp() ELSE available_at END,
                finished_at = CASE WHEN $3 = 'failed' THEN clock_timestamp() ELSE NULL END,
                claimed_at = NULL, claimed_by = NULL, claim_expires_at = NULL,
                error_summary = $4, progress = $5::jsonb
          WHERE id = $1 AND status = 'running' AND claimed_by = $2`,
        [job.id, job.claimedBy, retry ? 'retry_wait' : 'failed', message, JSON.stringify(progress)],
      )
      await client.query(
        `UPDATE app.translation_jobs
            SET status = $2::app.translation_job_status,
                finished_at = CASE WHEN $2 IN ('failed', 'partial') THEN clock_timestamp() ELSE NULL END,
                error_summary = $3
          WHERE id = $1`,
        [job.id, retry ? 'queued' : terminalStatus, message],
      )
    })
    return Object.freeze({ retryScheduled: retry })
  }
}

export class TranslationWorker {
  readonly #hooks: Pick<ContentIngestionHooks, 'refreshSearch' | 'revalidatePublicContent'>
  readonly #jobs: TranslationJobRepository
  readonly #provider: TranslationProvider
  readonly #workerId: string

  constructor(
    options: Readonly<{
      hooks: Pick<ContentIngestionHooks, 'refreshSearch' | 'revalidatePublicContent'>
      jobs: TranslationJobRepository
      provider: TranslationProvider
      workerId: string
    }>,
  ) {
    this.#hooks = options.hooks
    this.#jobs = options.jobs
    this.#provider = options.provider
    this.#workerId = options.workerId
  }

  async #deliverHooks(input: ContentHookInput) {
    await this.#hooks.refreshSearch(input)
    await this.#hooks.revalidatePublicContent(input)
  }

  async runOnce() {
    const job = await this.#jobs.claimNext(this.#workerId)
    if (!job) return Object.freeze({ claimed: false as const })
    let progress = job.progress ?? emptyProgress()
    try {
      progress = await this.#jobs.plan(job, this.#provider)
      if (job.executionMode === 'dry-run') {
        progress = await this.#jobs.finish(job, progress, 'completed')
        return Object.freeze({
          claimed: true as const,
          jobId: job.id,
          progress,
          status: 'completed' as const,
        })
      }

      if (progress.revalidationDocumentIds.length > 0) {
        const inputs = await this.#jobs.readRevalidationInputs(progress.revalidationDocumentIds)
        for (const input of inputs) await this.#deliverHooks(input)
        progress = await this.#jobs.clearRevalidation(job, progress)
      }

      for (const segmentId of progress.plannedSegmentIds) {
        if (progress.completedSegmentIds.includes(segmentId)) continue
        if (await this.#jobs.cancellationRequested(job)) {
          progress = await this.#jobs.finish(job, progress, 'cancelled')
          return Object.freeze({
            claimed: true as const,
            jobId: job.id,
            progress,
            status: 'cancelled' as const,
          })
        }
        const candidate = await this.#jobs.readCandidate(segmentId)
        const request = candidateRequest(job.id, candidate)
        const estimate = this.#provider.estimate(request)
        const status = await this.#jobs.readStatus(job.id)
        if (roundUsd(status.actualCostUsd + estimate.maximumCostUsd) > job.budgetUsd) {
          progress = await this.#jobs.finish(job, progress, 'partial')
          return Object.freeze({
            claimed: true as const,
            jobId: job.id,
            progress,
            status: 'partial' as const,
          })
        }
        const response = await this.#provider.translate(request)
        if (response.usage.costUsd > estimate.maximumCostUsd) {
          throw new Error('Provider actual cost exceeded the server-side reserved maximum')
        }
        const recorded = await this.#jobs.recordTranslation(job, progress, candidate, response)
        progress = recorded.progress
        for (const input of recorded.hookInputs) await this.#deliverHooks(input)
        progress = await this.#jobs.clearRevalidation(job, progress)
        console.log(
          JSON.stringify({
            costUsd: response.usage.costUsd,
            event: 'translation_segment_completed',
            inputTokens: response.usage.inputTokens,
            jobId: job.id,
            model: response.model,
            outputTokens: response.usage.outputTokens,
            provider: response.provider,
            segmentId,
          }),
        )
      }
      progress = await this.#jobs.finish(job, progress, 'completed')
      return Object.freeze({
        claimed: true as const,
        jobId: job.id,
        progress,
        status: 'completed' as const,
      })
    } catch (error: unknown) {
      const retryable =
        progress.revalidationDocumentIds.length > 0 ||
        (error instanceof Error && 'retryable' in error && error.retryable === true)
      const failure = await this.#jobs.fail(job, progress, error, retryable)
      return Object.freeze({
        claimed: true as const,
        jobId: job.id,
        progress,
        retryScheduled: failure.retryScheduled,
        status: 'failed' as const,
      })
    }
  }
}
