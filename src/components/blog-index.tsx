import { ArrowRight, ArrowUpRight, NotebookPen, Search } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ComponentProps } from 'react'

import { localizeContentText } from '@/i18n/content'
import type { SearchResult } from '@/search/contracts'
import type { PublicDocument } from '@/server/public-content'
import { documentDate, documentSummary, trafficPaths } from '@/web/content-compatibility'
import { type PublicRouteContext, withLocalePrefix } from '@/web/routes'
import { TrafficMetrics } from './traffic-metrics'

export async function BlogIndex({
  context,
  documents,
  query,
  total,
  searchResults,
  trafficLabels,
}: Readonly<{
  context: PublicRouteContext
  documents: readonly PublicDocument[]
  query: string | undefined
  total: number
  searchResults: readonly SearchResult[] | undefined
  trafficLabels: ComponentProps<typeof TrafficMetrics>['labels']
}>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const matches = new Map(searchResults?.map((result) => [result.route, result]))
  const matchLabels = {
    body: t('searchMatchBody'),
    heading: t('searchMatchHeading'),
    metadata: t('searchMatchMetadata'),
    title: t('searchMatchTitle'),
  }
  return (
    <section className="blog-journal">
      <header className="blog-journal-header">
        <div>
          <div className="blog-journal-heading">
            <h1>{t('blogTitle')}</h1>
            <span className="blog-journal-count">
              <strong>{total}</strong> {t('blogIndex.entries')}
            </span>
          </div>
          <p className="blog-journal-description">{t('blogIndex.description')}</p>
        </div>
        <search className="blog-journal-search">
          <form action={withLocalePrefix('/blog', context)} method="get">
            <Search aria-hidden size={18} />
            <input
              aria-label={t('filterBlog')}
              defaultValue={query}
              maxLength={200}
              name="q"
              placeholder={t('filterBlog')}
              type="search"
            />
            <button aria-label={t('searchSubmit')} type="submit">
              <ArrowRight aria-hidden size={19} />
            </button>
          </form>
        </search>
      </header>
      {query ? (
        <div className="blog-query">
          <p>
            {t('blogIndex.query', { query })}
            <span>{t('blogIndex.results', { count: documents.length })}</span>
          </p>
          <Link href={withLocalePrefix('/blog', context)}>{t('blogIndex.clear')}</Link>
        </div>
      ) : null}
      <ol className="blog-journal-grid">
        {documents.map((document, index) => {
          const latest = !query && index === 0
          const match = matches.get(`/${context.locale}${document.routePath}`)
          const summary = match?.snippet ?? documentSummary(document)
          const date = documentDate(document)
          return (
            <li className={latest ? 'blog-entry is-latest' : 'blog-entry'} key={document.id}>
              <Link
                className="blog-entry-link"
                data-content-card="blog"
                href={withLocalePrefix(document.routePath, context)}
              >
                <div className="blog-entry-date">
                  {date ? <time dateTime={date}>{date}</time> : null}
                  {latest ? <span>{t('blogIndex.latest')}</span> : null}
                </div>
                <div className="blog-entry-body">
                  <h2>
                    {localizeContentText(document.title, context.locale)}
                    <ArrowUpRight aria-hidden size={16} />
                  </h2>
                  {match ? (
                    <span className="blog-entry-match">{matchLabels[match.matchedContext]}</span>
                  ) : null}
                  {summary ? <p>{localizeContentText(summary, context.locale)}</p> : null}
                  <div className="blog-entry-traffic">
                    <TrafficMetrics
                      labels={trafficLabels}
                      paths={trafficPaths(document.routePath)}
                    />
                  </div>
                </div>
              </Link>
            </li>
          )
        })}
      </ol>
      {documents.length === 0 ? (
        <div className="blog-journal-empty">
          <NotebookPen aria-hidden size={32} />
          <p>{query ? t('searchEmpty') : t('emptyContent')}</p>
        </div>
      ) : null}
    </section>
  )
}
