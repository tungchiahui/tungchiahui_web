import { Client } from 'pg'
import { z } from 'zod'
import { CompositeContentHooks } from '../../src/content/hooks'
import { ContentIngestionRepository } from '../../src/content/ingestion'
import { PublicContentHooks } from '../../src/content/revalidation'
import { ApplicationJobRepository } from '../../src/control-plane/application-jobs'
import { locales } from '../../src/i18n/locales'
import { SearchRefreshContentHook } from '../../src/search/hooks'
import { SearchIndexRepository } from '../../src/search/repository'

export async function verifyProjectPortfolio(connectionString: string, siteBaseUrl: URL) {
  const client = new Client({ connectionString })
  await client.connect()
  const creator = new ApplicationJobRepository(connectionString)
  const index = new SearchIndexRepository(connectionString)
  const searchHook = new SearchRefreshContentHook(connectionString)
  const ingestion = new ContentIngestionRepository(
    connectionString,
    new CompositeContentHooks([
      searchHook,
      new PublicContentHooks(
        new URL('/api/internal/revalidate', siteBaseUrl).toString(),
        'local-only-phase6-revalidation-secret',
      ),
    ]),
  )
  const route = '/projects/portfolio-lifecycle'
  async function read(path: string, expectedStatus = 200) {
    const response = await fetch(new URL(path, siteBaseUrl), {
      signal: AbortSignal.timeout(30_000),
    })
    if (response.status !== expectedStatus)
      throw new Error(`Project ${path} returned ${response.status}, expected ${expectedStatus}`)
    return response.text()
  }
  try {
    const rows = await client.query(
      'SELECT source_path, raw_markdown FROM app.documents WHERE NOT is_deleted ORDER BY source_path',
    )
    const files = z
      .array(z.object({ source_path: z.string(), raw_markdown: z.string() }))
      .parse(rows.rows)
      .map((row) => ({ path: row.source_path, contents: row.raw_markdown }))
    const metadata =
      '---\ntitle: Portfolio lifecycle contract\nproject:\n  featured: true\n  order: 0\n  tags: [PortfolioContractTag]\n---\n\n'
    const sourcePath = 'content/projects/portfolio-lifecycle.md'
    const actor = {
      capabilities: ['application-job:create' as const],
      id: 'project-portfolio-test',
      kind: 'service' as const,
    }
    const apply = async (phase: number, contents?: string) => {
      const sourceCommit = `${String(phase)}${'d'.repeat(39)}`
      const created = await creator.createJob(
        { jobType: 'content_sync', payload: { sourceCommit } },
        actor,
        `portfolio:lifecycle:${phase}`,
      )
      return ingestion.ingest(created.job.id, {
        sourceCommit,
        files: [...files, ...(contents ? [{ path: sourcePath, contents }] : [])],
      })
    }
    // Prime all shared lists before creating the project.
    for (const locale of locales) {
      await read(`/${locale}/cv`)
      await read(`/${locale}/projects`)
    }
    await read('/sitemap.xml')
    const created = await apply(
      1,
      `${metadata}PortfolioOriginalMarker.\n\n## Contribution\n\nROS2_Control stays protected.`,
    )
    const projectId = created.changes.find((change) => change.routePath === route)?.documentId
    if (!projectId) throw new Error('Project create emitted no change')
    for (const locale of locales) {
      for (const path of ['/cv', '/projects', route]) {
        if (!(await read(`/${locale}${path}`)).includes('PortfolioOriginalMarker'))
          throw new Error(`Project create did not refresh ${locale}${path}`)
      }
      const results = await index.search({
        locale,
        contentType: 'project',
        limit: 10,
        query: 'PortfolioContractTag',
      })
      if (
        results[0]?.route !== `/${locale}${route}` ||
        results.some((result) => result.locale !== locale || result.contentType !== 'project')
      )
        throw new Error(`Project relevance/locale filter failed for ${locale}`)
    }
    if (!(await read('/sitemap.xml')).includes(route))
      throw new Error('Project missing from sitemap')
    const replay = await apply(
      1,
      `${metadata}PortfolioOriginalMarker.\n\n## Contribution\n\nROS2_Control stays protected.`,
    )
    if (replay.changes.length) throw new Error('Project same-commit replay was not idempotent')
    await apply(
      2,
      `${metadata}PortfolioUpdatedMarker.\n\n## Contribution\n\nROS2_Control stays protected.`,
    )
    for (const locale of locales) {
      for (const path of ['/cv', '/projects', route]) {
        const html = await read(`/${locale}${path}`)
        if (!html.includes('PortfolioUpdatedMarker') || html.includes('PortfolioOriginalMarker'))
          throw new Error(`Project update left stale ${locale}${path}`)
      }
    }
    await apply(3)
    for (const locale of locales) {
      for (const path of ['/cv', '/projects'])
        if ((await read(`/${locale}${path}`)).includes('PortfolioUpdatedMarker'))
          throw new Error('Deleted project remained in shared list')
      await read(`/${locale}${route}`, 404)
      if (
        (
          await index.search({
            locale,
            contentType: 'project',
            limit: 10,
            query: 'PortfolioContractTag',
          })
        ).length
      )
        throw new Error('Deleted project remained searchable')
    }
    if ((await read('/sitemap.xml')).includes(route))
      throw new Error('Deleted project remained in sitemap')
    const restored = await apply(4, `${metadata}PortfolioRestoredMarker.`)
    if (restored.changes.find((change) => change.routePath === route)?.documentId !== projectId)
      throw new Error('Restored project changed identity')
    await apply(5)
    console.log(
      'Project portfolio lifecycle: PASS (all locales; create/replay/update/delete/restore; search and sitemap)',
    )
  } finally {
    await ingestion.close()
    await index.close()
    await searchHook.close()
    await creator.close()
    await client.end()
  }
}
