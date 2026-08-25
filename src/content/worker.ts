import { ZodError, z } from 'zod'

import type { ReadonlyContentSource } from './contracts'
import { contentHookInputSchema } from './hooks'
import {
  AmbiguousContentIdentityError,
  ContentHookDeliveryError,
  type ContentIngestionRepository,
  ContentSnapshotValidationError,
} from './ingestion'
import type { ClaimedContentJob, ContentJobRepository } from './jobs'
import { ContentRouteCollisionError } from './markdown'

const sideEffectsProgressSchema = z
  .object({
    hookInput: z
      .object({
        ...contentHookInputSchema.shape,
      })
      .strict(),
    phase: z.literal('side_effects'),
    result: z.object({
      filesChanged: z.number().int().nonnegative(),
      filesDeleted: z.number().int().nonnegative(),
      filesSeen: z.number().int().nonnegative(),
    }),
  })
  .strict()

export type ContentWorkerOptions = Readonly<{
  contentSource: ReadonlyContentSource
  ingestion: ContentIngestionRepository
  jobs: ContentJobRepository
  retryDelayMilliseconds: number
  workerId: string
}>

function isPermanentContentError(error: unknown) {
  return (
    error instanceof ZodError ||
    error instanceof AmbiguousContentIdentityError ||
    error instanceof ContentRouteCollisionError ||
    error instanceof ContentSnapshotValidationError
  )
}

export class ContentWorker {
  readonly #contentSource: ReadonlyContentSource
  readonly #ingestion: ContentIngestionRepository
  readonly #jobs: ContentJobRepository
  readonly #retryDelayMilliseconds: number
  readonly #workerId: string

  constructor(options: ContentWorkerOptions) {
    this.#contentSource = options.contentSource
    this.#ingestion = options.ingestion
    this.#jobs = options.jobs
    this.#retryDelayMilliseconds = options.retryDelayMilliseconds
    this.#workerId = options.workerId
  }

  async runOnce(leaseMilliseconds = 300_000) {
    const job = await this.#jobs.claimNext(this.#workerId, leaseMilliseconds)
    if (!job) return Object.freeze({ claimed: false as const })
    return this.#execute(job)
  }

  async #execute(job: ClaimedContentJob) {
    const sourceCommit = job.request.payload.sourceCommit
    let replayingSideEffects = false
    try {
      const pendingSideEffects = sideEffectsProgressSchema.safeParse(job.progress)
      if (pendingSideEffects.success) {
        replayingSideEffects = true
        await this.#ingestion.deliverHooks(pendingSideEffects.data.hookInput)
        const result = Object.freeze({
          changes: pendingSideEffects.data.hookInput.changes,
          ...pendingSideEffects.data.result,
          sourceCommit,
          translation: pendingSideEffects.data.hookInput.translation,
        })
        await this.#jobs.complete(job, {
          ...pendingSideEffects.data.result,
          phase: 'completed',
          sourceCommit,
        })
        return Object.freeze({
          claimed: true as const,
          completed: true as const,
          jobId: job.id,
          result,
        })
      }
      await this.#jobs.updateProgress(job, { phase: 'fetching', sourceCommit })
      const snapshot = await this.#contentSource.fetchSnapshot(sourceCommit)
      await this.#jobs.updateProgress(job, {
        filesFetched: snapshot.files.length,
        phase: 'materializing',
        sourceCommit,
      })
      const result = await this.#ingestion.ingest(job.id, snapshot)
      const progress = {
        filesChanged: result.filesChanged,
        filesDeleted: result.filesDeleted,
        filesSeen: result.filesSeen,
        phase: 'completed',
        sourceCommit,
      }
      await this.#jobs.complete(job, progress)
      return Object.freeze({
        claimed: true as const,
        completed: true as const,
        jobId: job.id,
        result,
      })
    } catch (error: unknown) {
      if (!(error instanceof ContentHookDeliveryError) && !replayingSideEffects) {
        try {
          await this.#ingestion.recordFailure(job.id, sourceCommit, error)
        } catch (auditError: unknown) {
          console.error(
            JSON.stringify({
              event: 'content_ingestion_failure_audit_failed',
              jobId: job.id,
              message: auditError instanceof Error ? auditError.message : 'unknown error',
            }),
          )
        }
      }
      const failure = await this.#jobs.fail(job, error, {
        ...(error instanceof ContentHookDeliveryError
          ? {
              progress: {
                hookInput: {
                  changes: [...error.result.changes],
                  sourceCommit: error.result.sourceCommit,
                  translation: error.result.translation,
                },
                phase: 'side_effects',
                result: {
                  filesChanged: error.result.filesChanged,
                  filesDeleted: error.result.filesDeleted,
                  filesSeen: error.result.filesSeen,
                },
              },
            }
          : {}),
        retryable: !isPermanentContentError(error),
        retryDelayMilliseconds: this.#retryDelayMilliseconds,
      })
      return Object.freeze({
        claimed: true as const,
        completed: false as const,
        jobId: job.id,
        retryScheduled: failure.retryScheduled,
      })
    }
  }
}
