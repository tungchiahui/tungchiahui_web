import { Client } from 'pg'

import { RecordingContentHooks } from '../../src/content/hooks'
import { ApplicationJobRepository } from '../../src/control-plane/application-jobs'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import { type SearchRequest, searchResponseSchema } from '../../src/search/contracts'
import { SearchJobRepository, SearchWorker } from '../../src/search/jobs'
import { SearchIndexRepository } from '../../src/search/repository'

const actor: ActorIdentity = {
  capabilities: ['application-job:create'],
  id: 'phase10-search-integration',
  kind: 'service',
}

async function fetchSearch(siteBaseUrl: URL, request: SearchRequest) {
  const url = new URL('/api/search', siteBaseUrl)
  url.searchParams.set('q', request.query)
  url.searchParams.set('locale', request.locale)
  url.searchParams.set('limit', String(request.limit))
  const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
  const body = await response.text()
  if (!response.ok) throw new Error(`Search API returned HTTP ${response.status}: ${body}`)
  if (response.headers.get('cache-control') !== 'no-store') {
    throw new Error('Search API must keep Edge/OpenResty response caching disabled')
  }
  return searchResponseSchema.parse(JSON.parse(body) as unknown)
}

export async function verifyPhase10Search(connectionString: string, siteBaseUrl: URL) {
  const creator = new ApplicationJobRepository(connectionString)
  const jobsA = new SearchJobRepository(connectionString)
  const jobsB = new SearchJobRepository(connectionString)
  const index = new SearchIndexRepository(connectionString)
  const hooks = new RecordingContentHooks()
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const created = await creator.createJob(
      { jobType: 'search_reindex', payload: { locales: ['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] } },
      actor,
      'phase10:search:initial-reindex',
    )
    const workers = [
      new SearchWorker({ hooks, indexer: index, jobs: jobsA, workerId: 'phase10-search-a' }),
      new SearchWorker({ hooks, indexer: index, jobs: jobsB, workerId: 'phase10-search-b' }),
    ]
    const concurrent = await Promise.all(workers.map((worker) => worker.runOnce()))
    const claimed = concurrent.filter((result) => result.claimed)
    if (!created.created || claimed.length !== 1 || claimed[0]?.jobId !== created.job.id) {
      throw new Error(`Concurrent search claim was not exclusive: ${JSON.stringify(concurrent)}`)
    }

    const counts = await client.query<{ active: string; indexed: string }>(
      `SELECT
         (SELECT count(*) * 4 FROM app.documents WHERE NOT is_deleted)::text AS active,
         (SELECT count(*) FROM app.search_documents)::text AS indexed`,
    )
    if (counts.rows[0]?.active !== counts.rows[0]?.indexed) {
      throw new Error(`Search projection count mismatch: ${JSON.stringify(counts.rows[0])}`)
    }

    const titleRanking = await index.search({ limit: 10, locale: 'zh-cn', query: '新博客启用' })
    if (
      titleRanking[0]?.route !== '/zh-cn/blog/newblogenable!' ||
      titleRanking[0]?.matchedContext !== 'title'
    ) {
      throw new Error(`Exact title ranking fixture failed: ${JSON.stringify(titleRanking)}`)
    }
    const fixtures = [
      {
        context: 'title',
        locale: 'zh-cn',
        query: 'Docker 教程',
        route: '/zh-cn/wiki/2024-10-03-docker-jiao-cheng',
      },
      {
        context: 'heading',
        locale: 'zh-cn',
        query: 'C++ 与 Unicode 渲染',
        route:
          '/zh-cn/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
      },
      {
        context: 'body',
        locale: 'zh-cn',
        query: '正文保护',
        route:
          '/zh-cn/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
      },
      {
        context: 'heading',
        locale: 'en-us',
        query: 'New blog enabled',
        route: '/en-us/blog/newblogenable!',
      },
      {
        context: 'body',
        locale: 'en-us',
        query: 'ROS2_Control',
        route:
          '/en-us/wiki/2023-10-05-cplusplus-jiao-xue/0200-c-kai-fa-huan-jing-da-jian-yu-ce-shi',
      },
    ] as const
    for (const fixture of fixtures) {
      const results = await index.search({
        limit: 10,
        locale: fixture.locale,
        query: fixture.query,
      })
      const expected = results.find((result) => result.route === fixture.route)
      if (
        expected?.matchedContext !== fixture.context ||
        results.some((result) => result.locale !== fixture.locale)
      ) {
        throw new Error(
          `Search relevance/locale fixture failed: ${JSON.stringify({ fixture, results })}`,
        )
      }
    }

    const api = await fetchSearch(siteBaseUrl, {
      limit: 10,
      locale: 'zh-cn',
      query: 'Modified at commit B.',
    })
    if (api.results[0]?.route !== '/zh-cn/blog/newblogenable!') {
      throw new Error(`Search API/cache priming fixture failed: ${JSON.stringify(api)}`)
    }
    const serialized = JSON.stringify(api)
    for (const forbidden of ['rawMarkdown', 'sourceHash', 'sourcePath', 'projectionHash']) {
      if (serialized.includes(forbidden)) throw new Error(`Search API leaked ${forbidden}`)
    }

    await client.query('SET enable_seqscan = off')
    await client.query('SET search_path TO app, public')
    const plan = await client.query<{ 'QUERY PLAN': string }>(
      `EXPLAIN SELECT document_id FROM app.search_documents
        WHERE locale = 'zh-cn'
          AND ARRAY[title, headings, body, metadata] &@
              ('ROS2', ARRAY[16, 8, 2, 4], 'search_documents_full_text_idx')::pgroonga_full_text_search_condition`,
    )
    await client.query('RESET enable_seqscan')
    await client.query('RESET search_path')
    if (!plan.rows.some((row) => row['QUERY PLAN'].includes('search_documents_full_text_idx'))) {
      throw new Error(`PostgreSQL did not select the PGroonga index: ${JSON.stringify(plan.rows)}`)
    }
    await client.query('REINDEX INDEX app.search_documents_full_text_idx')

    const retryJob = await creator.createJob(
      { jobType: 'search_reindex', payload: { locales: ['en-us'] } },
      actor,
      'phase10:search:retry-reindex',
    )
    let failOnce = true
    const failingWorker = new SearchWorker({
      hooks,
      indexer: {
        async reindexLocales() {
          if (failOnce) {
            failOnce = false
            throw new Error('Injected transactional reindex failure')
          }
          return index.reindexLocales(['en-us'])
        },
      },
      jobs: jobsA,
      workerId: 'phase10-search-retry',
    })
    const failed = await failingWorker.runOnce()
    const retried = await failingWorker.runOnce()
    const state = await creator.getJob(retryJob.job.id)
    if (
      !failed.claimed ||
      !('retryScheduled' in failed) ||
      !failed.retryScheduled ||
      !retried.claimed ||
      state?.status !== 'completed' ||
      state.attemptCount !== 2
    ) {
      throw new Error(
        `Search reindex retry was not durable: ${JSON.stringify({ failed, retried, state })}`,
      )
    }
  } finally {
    await client.end()
    await Promise.all([creator.close(), jobsA.close(), jobsB.close(), index.close()])
  }
}

export async function verifyPhase10CacheInvalidation(siteBaseUrl: URL) {
  const oldResult = await fetchSearch(siteBaseUrl, {
    limit: 10,
    locale: 'zh-cn',
    query: 'Modified at commit B.',
  })
  const current = await fetchSearch(siteBaseUrl, {
    limit: 10,
    locale: 'zh-cn',
    query: 'Revalidated without rebuilding.',
  })
  if (
    oldResult.results.length !== 0 ||
    current.results[0]?.route !== '/zh-cn/blog/newblogenable!'
  ) {
    throw new Error(
      `Search projection/cache invalidation was not exact: ${JSON.stringify({ current, oldResult })}`,
    )
  }

  const invalid = await fetch(new URL('/api/search?q=&locale=zh-cn', siteBaseUrl), {
    signal: AbortSignal.timeout(5_000),
  })
  if (invalid.status !== 400) throw new Error(`Invalid Search API input returned ${invalid.status}`)
}
