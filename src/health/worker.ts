import { randomUUID } from 'node:crypto'
import { sql } from 'drizzle-orm'
import { ContentJobRepository } from '../content/jobs'
import { HealthRepository } from './repository'
import { readSmartscaleFile } from './smartscale'

export class HealthSyncWorker {
  readonly workerId = `health:${randomUUID()}`
  readonly jobs: ContentJobRepository<'health_sync'>
  readonly repository: HealthRepository
  constructor(
    connectionString: string,
    readonly path: string,
    readonly user?: string,
  ) {
    this.jobs = new ContentJobRepository(connectionString, 'health_sync')
    this.repository = new HealthRepository(connectionString, 'site_content_worker')
  }
  async close() {
    await Promise.all([this.jobs.close(), this.repository.close()])
  }
  async runOnce() {
    // Existing durable jobs provide claim fencing, retry scheduling and crash recovery.
    await this.repository.transaction(async (tx) => {
      await tx.execute(sql`INSERT INTO app.operational_jobs (job_type, requested_by, idempotency_key, payload)
        VALUES ('health_sync', 'health-scheduler', 'health-sync:' || floor(extract(epoch FROM clock_timestamp()) / 300)::text, '{}')
        ON CONFLICT (idempotency_key) DO NOTHING`)
    })
    const job = await this.jobs.claimNext(this.workerId, 300000)
    if (!job) return { claimed: false }
    let renewing: Promise<void> | undefined
    let leaseLost = false
    const timer = setInterval(() => {
      if (renewing) return
      renewing = this.jobs
        .renewClaim(job, 300000)
        .catch(() => {
          leaseLost = true
        })
        .finally(() => {
          renewing = undefined
        })
    }, 30000)
    try {
      const file = await readSmartscaleFile(this.path, this.user)
      if (leaseLost) throw new Error('health_lease_lost')
      const result = await this.repository.importSmartscale(file)
      if (leaseLost) throw new Error('health_lease_lost')
      await this.jobs.complete(job, result)
      return { claimed: true, status: 'completed', ...result }
    } catch {
      // Never persist external JSON, paths, measurements or exception text in job logs.
      await this.repository.recordSyncFailure().catch(() => {})
      await this.jobs.fail(job, new Error('health_sync_failed'), {
        retryable: true,
        retryDelayMilliseconds: 30000,
      })
      return { claimed: true, status: 'retry_or_failed' }
    } finally {
      clearInterval(timer)
      await renewing
    }
  }
}
