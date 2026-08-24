import type { ContentSnapshot, ReadonlyContentSource } from '../../src/content/contracts'
import type { ContentHookInput, ContentIngestionHooks } from '../../src/content/hooks'
import { ContentIngestionRepository } from '../../src/content/ingestion'
import { ContentJobRepository } from '../../src/content/jobs'
import { Phase6ContentHooks } from '../../src/content/revalidation'
import { ContentWorker } from '../../src/content/worker'
import { ApplicationJobRepository } from '../../src/control-plane/application-jobs'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import { phase5FinalSnapshot } from '../content/test-ingestion'

const sourceCommit = 'f'.repeat(40)
const revalidationSecret = 'local-only-phase6-revalidation-secret'
const actor: ActorIdentity = {
  capabilities: ['application-job:create'],
  id: 'phase6-revalidation-test',
  kind: 'service',
}

class SingleSnapshotSource implements ReadonlyContentSource {
  fetchCount = 0

  async fetchSnapshot(commit: string): Promise<ContentSnapshot> {
    this.fetchCount += 1
    if (commit !== sourceCommit) throw new Error('Unexpected Phase 6 source commit')
    return {
      files: phase5FinalSnapshot.files.map((file) =>
        file.path === 'content/posts/2026-01-06-新博客启用.md'
          ? {
              ...file,
              contents: file.contents.replace(
                'Modified at commit B.',
                'Revalidated without rebuilding.',
              ),
            }
          : file,
      ),
      sourceCommit,
    }
  }
}

class FailOnceRevalidationHooks implements ContentIngestionHooks {
  #failed = false
  readonly #delegate: ContentIngestionHooks

  constructor(delegate: ContentIngestionHooks) {
    this.#delegate = delegate
  }

  async diffTranslations(input: ContentHookInput) {
    await this.#delegate.diffTranslations(input)
  }

  async refreshSearch(input: ContentHookInput) {
    await this.#delegate.refreshSearch(input)
  }

  async revalidateZhCn(input: ContentHookInput) {
    if (!this.#failed) {
      this.#failed = true
      throw new Error('Injected transient Phase 6 revalidation delivery failure')
    }
    await this.#delegate.revalidateZhCn(input)
  }
}

async function readArticle(siteBaseUrl: URL) {
  const response = await fetch(new URL('/blog/newblogenable!', siteBaseUrl), {
    signal: AbortSignal.timeout(10_000),
  })
  if (!response.ok) throw new Error(`Revalidation fixture page returned HTTP ${response.status}`)
  return response.text()
}

export async function verifyPhase6Revalidation(connectionString: string, siteBaseUrl: URL) {
  const before = await readArticle(siteBaseUrl)
  if (!before.includes('Modified at commit B.')) {
    throw new Error('Phase 6 revalidation precondition did not read the cached commit-B article')
  }

  const jobs = new ContentJobRepository(connectionString)
  const creator = new ApplicationJobRepository(connectionString)
  const source = new SingleSnapshotSource()
  const ingestion = new ContentIngestionRepository(
    connectionString,
    new FailOnceRevalidationHooks(
      new Phase6ContentHooks(
        new URL('/api/internal/revalidate', siteBaseUrl).toString(),
        revalidationSecret,
      ),
    ),
  )
  try {
    const created = await creator.createJob(
      { jobType: 'content_sync', payload: { sourceCommit } },
      actor,
      'phase6:revalidation:content-sync',
    )
    const worker = new ContentWorker({
      contentSource: source,
      ingestion,
      jobs,
      retryDelayMilliseconds: 0,
      workerId: 'phase6-revalidation-worker',
    })
    const failedDelivery = await worker.runOnce()
    if (
      !created.created ||
      !failedDelivery.claimed ||
      failedDelivery.completed ||
      !failedDelivery.retryScheduled
    ) {
      throw new Error(
        `Phase 6 transient revalidation failure was not durably retried: ${JSON.stringify(failedDelivery)}`,
      )
    }
    const result = await worker.runOnce()
    if (!result.claimed || !result.completed || source.fetchCount !== 1) {
      throw new Error(`Phase 6 side-effect retry did not complete: ${JSON.stringify(result)}`)
    }
    const after = await readArticle(siteBaseUrl)
    if (
      !after.includes('Revalidated without rebuilding.') ||
      after.includes('Modified at commit B.')
    ) {
      throw new Error(
        'Affected article did not update after content sync without an application rebuild',
      )
    }
  } finally {
    await Promise.all([creator.close(), ingestion.close(), jobs.close()])
  }
}
