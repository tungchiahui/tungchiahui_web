import { ZodError } from 'zod'

import type { ReadonlyContentSource } from './contracts'
import {
  AmbiguousContentIdentityError,
  type ContentIngestionRepository,
  ContentSnapshotValidationError,
} from './ingestion'
import type { ClaimedContentJob, ContentJobRepository } from './jobs'
import { ContentRouteCollisionError } from './markdown'

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
    try {
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
      const failure = await this.#jobs.fail(job, error, {
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
