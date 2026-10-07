import type { ContentSnapshot, ReadonlyContentSource } from '../../src/content/contracts'
import {
  CompositeContentHooks,
  type ContentHookInput,
  type ContentIngestionHooks,
} from '../../src/content/hooks'
import { ContentIngestionRepository } from '../../src/content/ingestion'
import { ContentJobRepository } from '../../src/content/jobs'
import { PublicContentHooks } from '../../src/content/revalidation'
import { ContentWorker } from '../../src/content/worker'
import { ApplicationJobRepository } from '../../src/control-plane/application-jobs'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import { SearchRefreshContentHook } from '../../src/search/hooks'
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

  async revalidatePublicContent(input: ContentHookInput) {
    if (!this.#failed) {
      this.#failed = true
      throw new Error('Injected transient Phase 6 revalidation delivery failure')
    }
    await this.#delegate.revalidatePublicContent(input)
  }
}

async function readArticle(siteBaseUrl: URL) {
  const response = await fetch(new URL('/blog/2026-01-06-xin-bo-ke-qi-yong', siteBaseUrl), {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Revalidation fixture page returned HTTP ${response.status}`)
  return response.text()
}

async function readSitemap(siteBaseUrl: URL) {
  const response = await fetch(new URL('/sitemap.xml', siteBaseUrl), {
    signal: AbortSignal.timeout(30_000),
  })
  if (!response.ok) throw new Error(`Sitemap returned HTTP ${response.status}`)
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
  const search = new SearchRefreshContentHook(connectionString)
  const ingestion = new ContentIngestionRepository(
    connectionString,
    new CompositeContentHooks([
      search,
      new FailOnceRevalidationHooks(
        new PublicContentHooks(
          new URL('/api/internal/revalidate', siteBaseUrl).toString(),
          revalidationSecret,
        ),
      ),
    ]),
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
    const originalFiles = (await source.fetchSnapshot(sourceCommit)).files
    const temporarySourcePath = 'content/posts/2026-08-01-Sitemap生命周期.md'
    const oldRoute = '/blog/sitemap-lifecycle-fixture'
    const movedRoute = '/blog/sitemap-moved-fixture'
    const phases = [
      {
        commit: '7'.repeat(40),
        route: oldRoute,
        files: [
          ...originalFiles,
          {
            path: temporarySourcePath,
            contents: `---\ntitle: Sitemap lifecycle\npath: ${oldRoute}\n---\n\nA temporary integration fixture.`,
          },
        ],
      },
      {
        commit: '8'.repeat(40),
        route: movedRoute,
        files: [
          ...originalFiles,
          {
            path: temporarySourcePath,
            contents: `---\ntitle: Sitemap lifecycle\npath: ${movedRoute}\n---\n\nA temporary integration fixture.`,
          },
        ],
      },
      { commit: '9'.repeat(40), route: undefined, files: originalFiles },
    ] as const
    const sitemapSource: ReadonlyContentSource = {
      async fetchSnapshot(commit) {
        const phase = phases.find((candidate) => candidate.commit === commit)
        if (!phase) throw new Error('Unexpected sitemap fixture commit')
        return { sourceCommit: commit, files: [...phase.files] }
      },
    }
    const sitemapWorker = new ContentWorker({
      contentSource: sitemapSource,
      ingestion,
      jobs,
      retryDelayMilliseconds: 0,
      workerId: 'seo-sitemap-worker',
    })
    await readSitemap(siteBaseUrl)
    for (const phase of phases) {
      await creator.createJob(
        { jobType: 'content_sync', payload: { sourceCommit: phase.commit } },
        actor,
        `seo:sitemap:${phase.commit}`,
      )
      const synced = await sitemapWorker.runOnce()
      if (!synced.claimed || !synced.completed)
        throw new Error('Sitemap lifecycle ingestion did not complete')
      const xml = await readSitemap(siteBaseUrl)
      for (const route of [oldRoute, movedRoute]) {
        if (xml.includes(`${route}</loc>`) !== (route === phase.route)) {
          throw new Error(
            'Sitemap did not reflect content addition, move or deletion without rebuilding',
          )
        }
      }
    }
    console.log('Sitemap content addition/move/deletion and revalidation: PASS')
  } finally {
    await Promise.all([creator.close(), ingestion.close(), jobs.close(), search.close()])
  }
}
