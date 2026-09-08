import {
  ArrowRight,
  BookOpen,
  Bot,
  CheckCircle2,
  Cpu,
  Globe2,
  Monitor,
  Newspaper,
  NotebookPen,
  Search as SearchIcon,
  Smartphone,
} from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { z } from 'zod'
import { ArticleReader } from '@/components/article-reader'
import { BookmarkWorkspace } from '@/components/bookmark-workspace'
import { MoreDirectory } from '@/components/more-directory'
import { MusicPage } from '@/components/music-page'
import { TechFootprintPage, WeightLossPage } from '@/components/owner-dataset-pages'
import { SiteShell } from '@/components/site-shell'
import { StatsDashboard } from '@/components/stats-dashboard'
import { TrafficMetrics } from '@/components/traffic-metrics'
import { techFootprintPayloadSchema, weightLossPayloadSchema } from '@/control-plane/contracts'
import { localizeContentText } from '@/i18n/content'
import type { AppLocale } from '@/i18n/locales'
import { readCachedSearch } from '@/search/cache'
import { type SearchResult, searchQuerySchema } from '@/search/contracts'
import {
  listCachedDocuments,
  readCachedDocument,
  readCachedOwnerDataset,
} from '@/server/cached-content'
import type { PublicDocument } from '@/server/public-content'
import {
  documentDate,
  documentSummary,
  groupWikiDocuments,
  latestWikiDocumentGroups,
  trafficPaths,
  type WikiDocumentGroup,
  wikiDocumentKey,
} from './content-compatibility'
import { renderMarkdown } from './markdown'
import {
  type PublicRouteContext,
  publicPath,
  type SpecialPageSlug,
  specialPageSlugSchema,
  withLocalePrefix,
} from './routes'
import {
  AboutInformationPage,
  CvInformationPage,
  FriendInformationPage,
  LogoInformationPage,
} from './special-information-pages'

function formatDate(date: Date | null) {
  return date?.toISOString().slice(0, 10)
}

function CardLink({
  context,
  document,
  searchMatch,
  showSummary = false,
  trafficLabels,
}: Readonly<{
  context: PublicRouteContext
  document: PublicDocument
  searchMatch?: Readonly<{ label: string; snippet: string }> | undefined
  showSummary?: boolean
  trafficLabels?: TrafficLabels
}>) {
  const summary = searchMatch?.snippet ?? (showSummary ? documentSummary(document) : undefined)
  return (
    <li>
      <Link
        className="content-card block rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary"
        data-content-card={document.contentType}
        href={withLocalePrefix(document.routePath, context)}
      >
        <h3 className="font-semibold text-lg">
          {localizeContentText(document.title, context.locale)}
        </h3>
        {searchMatch ? (
          <span className="mt-2 block font-medium text-primary text-xs uppercase">
            {searchMatch.label}
          </span>
        ) : null}
        {documentDate(document) ? (
          <time className="mt-2 block text-muted-foreground text-sm">{documentDate(document)}</time>
        ) : null}
        {summary ? (
          <p className="mt-3 line-clamp-3 text-muted-foreground text-sm">
            {localizeContentText(summary, context.locale)}
          </p>
        ) : null}
        {trafficLabels ? (
          <span className="mt-3 block">
            <TrafficMetrics labels={trafficLabels} paths={trafficPaths(document.routePath)} />
          </span>
        ) : null}
      </Link>
    </li>
  )
}

type ContentSearchMatch = Readonly<{ label: string; snippet: string }>

function WikiDocumentCard({
  context,
  defaultOpen = false,
  group,
  labels,
  searchMatch,
  trafficLabels,
  variant = 'index',
}: Readonly<{
  context: PublicRouteContext
  defaultOpen?: boolean
  group: WikiDocumentGroup
  labels: Readonly<{ chapterCount: string; collapse: string; expand: string; overview: string }>
  searchMatch?: ((document: PublicDocument) => ContentSearchMatch | undefined) | undefined
  trafficLabels: TrafficLabels
  variant?: 'home' | 'index'
}>) {
  const documents = [
    ...(group.index ? [group.index] : []),
    ...group.chapters.map((entry) => entry.document),
  ]
  const primary = group.index ?? group.chapters[0]?.document
  const date = primary ? documentDate(primary) : undefined
  return (
    <details className="wiki-document-card" data-wiki-document={variant} open={defaultOpen}>
      <summary>
        <span className="wiki-document-summary">
          <strong>{localizeContentText(group.title, context.locale)}</strong>
          <span className="wiki-document-meta">
            {date ? <time>{date}</time> : null}
            <span>{labels.chapterCount}</span>
            <TrafficMetrics
              labels={trafficLabels}
              paths={documents.flatMap((document) => trafficPaths(document.routePath))}
            />
          </span>
        </span>
        <span className="wiki-document-toggle" aria-hidden="true">
          <span className="wiki-toggle-expand">{labels.expand}</span>
          <span className="wiki-toggle-collapse">{labels.collapse}</span>
        </span>
      </summary>
      <ol className="wiki-document-chapters">
        {group.index ? (
          <li>
            <Link href={withLocalePrefix(group.index.routePath, context)}>
              <span className="wiki-chapter-number">⌂</span>
              <span>{labels.overview}</span>
            </Link>
            {searchMatch?.(group.index) ? (
              <p>
                <strong>{searchMatch(group.index)?.label}</strong> ·{' '}
                {searchMatch(group.index)?.snippet}
              </p>
            ) : null}
          </li>
        ) : null}
        {group.chapters.map((entry) => (
          <li
            key={entry.document.id}
            style={{ paddingInlineStart: `${entry.chapterDepth * 0.9}rem` }}
          >
            <Link href={withLocalePrefix(entry.document.routePath, context)}>
              <span className="wiki-chapter-number">{entry.chapter}</span>
              <span>{localizeContentText(entry.document.title, context.locale)}</span>
            </Link>
            {searchMatch?.(entry.document) ? (
              <p>
                <strong>{searchMatch(entry.document)?.label}</strong> ·{' '}
                {searchMatch(entry.document)?.snippet}
              </p>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  )
}

async function HomePage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const [blogs, wikis] = await Promise.all([
    listCachedDocuments('blog', context.locale),
    listCachedDocuments('wiki', context.locale),
  ])
  const wikiGroups = latestWikiDocumentGroups(wikis)
  const trafficLabels = makeTrafficLabels(t)
  const actions = [
    { href: '/blog', icon: Newspaper, label: t('homepageActionBlog') },
    { href: '/wiki', icon: BookOpen, label: t('homepageActionWiki') },
    { href: '/more', icon: ArrowRight, label: t('homepageActionMore') },
  ] as const
  const tags = [
    t('homepageTagTechnology'),
    t('homepageTagProjects'),
    t('homepageTagLearning'),
    t('homepageTagLife'),
  ]
  const focusAreas = [
    {
      icon: Cpu,
      summary: t('homepageFocusEmbeddedSummary'),
      title: t('homepageFocusEmbeddedTitle'),
    },
    {
      icon: Bot,
      summary: t('homepageFocusRoboticsSummary'),
      title: t('homepageFocusRoboticsTitle'),
    },
    {
      icon: Monitor,
      summary: t('homepageFocusToolsSummary'),
      title: t('homepageFocusToolsTitle'),
    },
    {
      icon: Globe2,
      summary: t('homepageFocusWebSummary'),
      title: t('homepageFocusWebTitle'),
    },
    {
      icon: Smartphone,
      summary: t('homepageFocusMobileSummary'),
      title: t('homepageFocusMobileTitle'),
    },
    {
      icon: NotebookPen,
      summary: t('homepageFocusNotesSummary'),
      title: t('homepageFocusNotesTitle'),
    },
  ] as const
  return (
    <div className="home-page">
      <section className="home-hero">
        <div>
          <p className="home-kicker">{t('homepageEyebrow')}</p>
          <h1>{t('homepageTitle')}</h1>
          <p className="home-summary">{t('homepageDescription')}</p>
          <div className="home-actions">
            {actions.map(({ href, icon: Icon, label }) => (
              <Link href={withLocalePrefix(href, context)} key={href}>
                <Icon aria-hidden size={17} />
                <span>{label}</span>
              </Link>
            ))}
          </div>
          <ul className="home-tags">
            {tags.map((tag) => (
              <li key={tag}>
                <CheckCircle2 aria-hidden size={14} />
                {tag}
              </li>
            ))}
          </ul>
        </div>
        <div aria-hidden className="home-orbit">
          <span>
            <Bot size={18} />
          </span>
          <span>
            <Cpu size={18} />
          </span>
          <span>
            <BookOpen size={18} />
          </span>
          <span>
            <Globe2 size={18} />
          </span>
          <strong>
            <NotebookPen size={32} />
          </strong>
        </div>
      </section>
      <section className="home-focus" aria-labelledby="home-focus-title">
        <header>
          <p>{t('homepageFocusEyebrow')}</p>
          <h2 id="home-focus-title">{t('homepageFocusTitle')}</h2>
          <span>{t('homepageFocusDescription')}</span>
        </header>
        <div>
          {focusAreas.map(({ icon: Icon, summary, title }) => (
            <article key={title}>
              <span aria-hidden>
                <Icon size={21} />
              </span>
              <h3>{title}</h3>
              <p>{summary}</p>
            </article>
          ))}
        </div>
      </section>
      <div className="home-latest-grid">
        <section className="home-latest-panel">
          <div className="home-panel-heading">
            <h2>
              <Newspaper aria-hidden size={20} />
              {t('latestBlog')}
            </h2>
            <Link href={withLocalePrefix('/blog', context)}>
              {t('viewAll')}
              <ArrowRight aria-hidden size={15} />
            </Link>
          </div>
          {blogs.length ? (
            <ul className="grid gap-3">
              {blogs.slice(0, 5).map((document) => (
                <CardLink context={context} document={document} key={document.id} />
              ))}
            </ul>
          ) : (
            <p className="rounded-xl border p-5 text-muted-foreground">{t('emptyContent')}</p>
          )}
        </section>
        <section className="home-latest-panel">
          <div className="home-panel-heading">
            <h2>
              <BookOpen aria-hidden size={20} />
              {t('latestWiki')}
            </h2>
            <Link href={withLocalePrefix('/wiki', context)}>
              {t('viewAll')}
              <ArrowRight aria-hidden size={15} />
            </Link>
          </div>
          {wikiGroups.length ? (
            <div className="grid gap-3">
              {wikiGroups.map((group) => (
                <WikiDocumentCard
                  context={context}
                  group={group}
                  key={group.key}
                  labels={{
                    chapterCount: t('chapterCount', { count: group.chapters.length }),
                    collapse: t('wikiCollapse'),
                    expand: t('wikiExpand'),
                    overview: t('wikiOverview'),
                  }}
                  trafficLabels={trafficLabels}
                  variant="home"
                />
              ))}
            </div>
          ) : (
            <p className="rounded-xl border p-5 text-muted-foreground">{t('emptyContent')}</p>
          )}
        </section>
      </div>
    </div>
  )
}

async function ContentList({
  context,
  contentType,
  queryInput,
}: Readonly<{
  contentType: 'blog' | 'wiki'
  context: PublicRouteContext
  queryInput: string | undefined
}>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const allDocuments = await listCachedDocuments(contentType, context.locale)
  const parsedQuery = z.string().trim().max(200).safeParse(queryInput)
  const query = parsedQuery.success && parsedQuery.data ? parsedQuery.data : undefined
  const searchResults = query
    ? await readCachedSearch({ contentType, limit: 50, locale: context.locale, query })
    : undefined
  const documents = searchResults
    ? searchResults.flatMap((result) => {
        const document = allDocuments.find(
          (candidate) => `/${context.locale}${candidate.routePath}` === result.route,
        )
        return document ? [document] : []
      })
    : allDocuments
  const title = contentType === 'blog' ? t('blogTitle') : t('wikiTitle')
  const description = contentType === 'blog' ? t('blogDescription') : t('wikiDescription')
  const trafficLabels = makeTrafficLabels(t)
  const matchedContextLabels = {
    body: t('searchMatchBody'),
    heading: t('searchMatchHeading'),
    metadata: t('searchMatchMetadata'),
    title: t('searchMatchTitle'),
  } as const
  const searchByRoute = new Map<string, SearchResult>(
    searchResults?.map((result) => [result.route, result]) ?? [],
  )
  const searchMatch = (document: PublicDocument) => {
    const result = searchByRoute.get(`/${context.locale}${document.routePath}`)
    return result
      ? { label: matchedContextLabels[result.matchedContext], snippet: result.snippet }
      : undefined
  }

  if (contentType === 'wiki') {
    const matchedGroupKeys = new Set(documents.map(wikiDocumentKey))
    const groups = groupWikiDocuments(
      query
        ? allDocuments.filter((document) => matchedGroupKeys.has(wikiDocumentKey(document)))
        : documents,
    )
    return (
      <section className="content-index content-index-wiki">
        <header className="content-index-hero">
          <span aria-hidden className="content-index-icon">
            <BookOpen size={26} />
          </span>
          <span className="content-index-hero-copy">
            <p>{t('wiki')}</p>
            <h1>{title}</h1>
            <span>{description}</span>
          </span>
        </header>
        <ContentSearch
          action={withLocalePrefix('/wiki', context)}
          defaultValue={query}
          label={t('filterWiki')}
          submitLabel={t('searchSubmit')}
        />
        <div className="wiki-document-list">
          {groups.map((group) => (
            <WikiDocumentCard
              context={context}
              defaultOpen={Boolean(query)}
              group={group}
              key={group.key}
              labels={{
                chapterCount: t('chapterCount', { count: group.chapters.length }),
                collapse: t('wikiCollapse'),
                expand: t('wikiExpand'),
                overview: t('wikiOverview'),
              }}
              searchMatch={searchMatch}
              trafficLabels={trafficLabels}
            />
          ))}
          {groups.length === 0 ? (
            <p className="rounded-xl border p-5 text-muted-foreground">{t('searchEmpty')}</p>
          ) : null}
        </div>
      </section>
    )
  }

  return (
    <section className="content-index content-index-blog">
      <header className="content-index-hero">
        <span aria-hidden className="content-index-icon">
          <Newspaper size={26} />
        </span>
        <span className="content-index-hero-copy">
          <p>{t('blog')}</p>
          <h1>{title}</h1>
          <span>{description}</span>
        </span>
      </header>
      <ContentSearch
        action={withLocalePrefix('/blog', context)}
        defaultValue={query}
        label={t('filterBlog')}
        submitLabel={t('searchSubmit')}
      />
      <ul className="mt-9 grid gap-4">
        {documents.map((document) => (
          <CardLink
            context={context}
            document={document}
            key={document.id}
            searchMatch={searchMatch(document)}
            showSummary
            trafficLabels={trafficLabels}
          />
        ))}
      </ul>
      {documents.length === 0 ? (
        <p className="mt-9 rounded-xl border p-5 text-muted-foreground">{t('searchEmpty')}</p>
      ) : null}
    </section>
  )
}

type TrafficLabels = Readonly<{
  averageTime: string
  bounceRate: string
  pageviews: string
  unavailable: string
  visits: string
}>

function makeTrafficLabels(
  t: (
    key:
      | 'trafficAverageTime'
      | 'trafficBounceRate'
      | 'trafficPageviews'
      | 'trafficUnavailable'
      | 'trafficVisits',
  ) => string,
) {
  return {
    averageTime: t('trafficAverageTime'),
    bounceRate: t('trafficBounceRate'),
    pageviews: t('trafficPageviews'),
    unavailable: t('trafficUnavailable'),
    visits: t('trafficVisits'),
  } satisfies TrafficLabels
}

function ContentSearch({
  action,
  defaultValue,
  label,
  submitLabel,
}: Readonly<{
  action: string
  defaultValue: string | undefined
  label: string
  submitLabel: string
}>) {
  return (
    <search>
      <form action={action} className="mt-7 flex max-w-xl gap-3" method="get">
        <input
          aria-label={label}
          className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3"
          defaultValue={defaultValue}
          maxLength={200}
          name="q"
          placeholder={label}
          type="search"
        />
        <button
          aria-label={submitLabel}
          className="grid size-12 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground"
          type="submit"
        >
          <SearchIcon aria-hidden size={18} />
        </button>
      </form>
    </search>
  )
}

async function SearchPage({
  context,
  queryInput,
  typeInput,
}: Readonly<{
  context: PublicRouteContext
  queryInput: string | undefined
  typeInput: string | undefined
}>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const parsedQuery = searchQuerySchema.safeParse(queryInput)
  const query = parsedQuery.success ? parsedQuery.data : undefined
  const parsedType = z.enum(['blog', 'wiki']).safeParse(typeInput)
  const contentType = parsedType.success ? parsedType.data : undefined
  const results = query
    ? await readCachedSearch({
        ...(contentType ? { contentType } : {}),
        limit: 20,
        locale: context.locale,
        query,
      })
    : undefined
  const matchedContextLabels = {
    body: t('searchMatchBody'),
    heading: t('searchMatchHeading'),
    metadata: t('searchMatchMetadata'),
    title: t('searchMatchTitle'),
  } as const

  return (
    <section>
      <h1 className="font-bold text-4xl">{t('searchTitle')}</h1>
      <p className="mt-3 max-w-3xl text-muted-foreground">{t('searchDescription')}</p>
      <search>
        <form
          action={withLocalePrefix('/search', context)}
          className="mt-8 flex max-w-3xl flex-wrap gap-3"
          method="get"
        >
          <input
            aria-label={t('searchPlaceholder')}
            className="min-w-0 flex-1 rounded-xl border bg-background px-4 py-3"
            defaultValue={query}
            maxLength={200}
            name="q"
            placeholder={t('searchPlaceholder')}
            required
            type="search"
          />
          <select
            aria-label={t('searchType')}
            className="rounded-xl border bg-background px-4 py-3"
            defaultValue={contentType ?? ''}
            name="type"
          >
            <option value="">{t('searchTypeAll')}</option>
            <option value="blog">{t('blog')}</option>
            <option value="wiki">{t('wiki')}</option>
          </select>
          <button
            className="inline-flex items-center gap-2 rounded-xl bg-primary px-5 py-3 font-medium text-primary-foreground"
            type="submit"
          >
            <SearchIcon aria-hidden="true" size={17} />
            {t('searchSubmit')}
          </button>
        </form>
      </search>
      {results === undefined ? (
        <p className="mt-8 text-muted-foreground">{t('searchPrompt')}</p>
      ) : results.length === 0 ? (
        <p className="mt-8 rounded-xl border p-5 text-muted-foreground">{t('searchEmpty')}</p>
      ) : (
        <div className="mt-9" data-search-results>
          <p className="mb-4 text-muted-foreground text-sm">
            {t('searchResultCount', { count: results.length })}
          </p>
          <ol className="grid gap-4">
            {results.map((result) => (
              <li
                className="rounded-2xl border bg-card p-5"
                key={`${result.locale}:${result.route}`}
              >
                <div className="flex flex-wrap gap-3 text-muted-foreground text-xs uppercase">
                  <span>{t(result.contentType)}</span>
                  <span>{matchedContextLabels[result.matchedContext]}</span>
                </div>
                <h2 className="mt-2 font-semibold text-xl">
                  <Link className="hover:text-primary" href={result.route}>
                    {result.title}
                  </Link>
                </h2>
                <p className="mt-3 text-muted-foreground">{result.snippet}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </section>
  )
}

async function ArticlePage({
  context,
  path,
}: Readonly<{ context: PublicRouteContext; path: string }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const document = await readCachedDocument(path, context.locale)
  if (!document) notFound()
  const all = await listCachedDocuments(document.contentType, context.locale)
  const currentWikiGroup =
    document.contentType === 'wiki'
      ? groupWikiDocuments(all).find((group) => group.key === wikiDocumentKey(document))
      : undefined
  const navigation =
    document.contentType === 'wiki' && currentWikiGroup
      ? [
          ...(currentWikiGroup.index ? [currentWikiGroup.index] : []),
          ...currentWikiGroup.chapters.map((entry) => entry.document),
        ]
      : all
  const index = navigation.findIndex((candidate) => candidate.id === document.id)
  const previous = index > 0 ? navigation[index - 1] : undefined
  const next = index >= 0 ? navigation[index + 1] : undefined
  const rendered = await renderMarkdown(
    document.localizedMarkdown ?? document.rawMarkdown,
    document.localizedMarkdown ? 'zh-cn' : context.locale,
  )
  const localizedTitle = localizeContentText(document.title, context.locale)
  const presentationState = document.contentLocaleState
  const trafficLabels = makeTrafficLabels(t)

  const wikiNavigation =
    document.contentType === 'wiki'
      ? navigation.map((candidate, navigationIndex) => {
          const numbered = currentWikiGroup?.chapters.find(
            (entry) => entry.document.id === candidate.id,
          )
          return {
            ...(numbered?.chapter ? { chapter: numbered.chapter } : {}),
            current: candidate.id === document.id,
            depth: numbered?.chapterDepth ?? 0,
            href: withLocalePrefix(candidate.routePath, context),
            title: localizeContentText(candidate.title, context.locale),
            navigationIndex,
          }
        })
      : []

  return (
    <article className="mx-auto max-w-[100rem]" data-article-type={document.contentType}>
      <header className="article-hero">
        <p className="font-medium text-primary text-sm uppercase">{t(document.contentType)}</p>
        <h1 className="mt-3 font-bold text-4xl tracking-tight sm:text-5xl">{localizedTitle}</h1>
        <div className="mt-4 flex flex-wrap gap-4 text-muted-foreground text-sm">
          {document.sourceUpdatedAt ? (
            <time>{t('updatedAt', { date: formatDate(document.sourceUpdatedAt) ?? '' })}</time>
          ) : null}
          <span>{t('readingTime', { minutes: rendered.readingMinutes })}</span>
        </div>
        {presentationState === 'source' || presentationState === 'translated' ? null : (
          <p
            className="mt-4 rounded-lg border bg-muted/40 px-3 py-2 text-muted-foreground text-sm"
            data-content-locale={context.locale}
            data-content-locale-state={presentationState}
          >
            {presentationState === 'converted'
              ? t('contentStateConverted')
              : presentationState === 'mixed'
                ? t('contentStateMixed', { count: document.fallbackSegmentCount })
                : t('contentStateFallback')}
          </p>
        )}
        <TrafficMetrics
          labels={trafficLabels}
          paths={trafficPaths(document.routePath)}
          variant="detail"
        />
      </header>
      <ArticleReader
        documentNavigation={wikiNavigation}
        headings={rendered.headings}
        html={rendered.html}
        labels={{
          close: t('close'),
          codeCopied: t('codeCopied'),
          copyCode: t('copyCode'),
          documentNavigation: t('documentNavigation'),
          imagePreview: t('imagePreview'),
          tableOfContents: t('tableOfContents'),
        }}
      />
      <nav className="mt-12 grid gap-3 border-t pt-6 sm:grid-cols-2">
        {previous ? (
          <Link
            className="rounded-xl border p-4 hover:border-primary"
            href={withLocalePrefix(previous.routePath, context)}
          >
            <span className="block text-muted-foreground text-sm">{t('previous')}</span>
            {localizeContentText(previous.title, context.locale)}
          </Link>
        ) : (
          <span />
        )}
        {next ? (
          <Link
            className="rounded-xl border p-4 text-right hover:border-primary"
            href={withLocalePrefix(next.routePath, context)}
          >
            <span className="block text-muted-foreground text-sm">{t('next')}</span>
            {localizeContentText(next.title, context.locale)}
          </Link>
        ) : null}
      </nav>
    </article>
  )
}

async function SpecialPage({
  context,
  slug,
}: Readonly<{ context: PublicRouteContext; slug: SpecialPageSlug }>) {
  switch (slug) {
    case 'about':
      return <AboutInformationPage context={context} />
    case 'cv':
      return <CvInformationPage context={context} />
    case 'friend':
      return <FriendInformationPage locale={context.locale} />
    case 'more':
      return <MoreDirectory />
    case 'mylogo':
      return <LogoInformationPage context={context} />
    case 'music':
      return <MusicPage />
    case 'start':
      return <BookmarkWorkspace homeHref={withLocalePrefix('/', context)} />
    case 'stats': {
      return <StatsDashboard />
    }
    case 'tech-footprint': {
      const dataset = await readCachedOwnerDataset('tech_footprint')
      const parsed = techFootprintPayloadSchema.safeParse(dataset?.payload)
      return (
        <TechFootprintPage
          records={parsed.success ? parsed.data.records : {}}
          revision={dataset?.revision ?? null}
        />
      )
    }
    case 'weight-loss': {
      const dataset = await readCachedOwnerDataset('weight_loss')
      const parsed = weightLossPayloadSchema.safeParse(dataset?.payload)
      const records = parsed.success ? parsed.data.records : []
      return <WeightLossPage records={records} revision={dataset?.revision ?? null} />
    }
  }
}

export async function renderPublicPage(
  segments: readonly string[],
  context: PublicRouteContext,
  searchParameters: Readonly<Record<string, string | string[] | undefined>> = {},
) {
  const path = publicPath(segments)
  const query = typeof searchParameters.q === 'string' ? searchParameters.q : undefined
  const type = typeof searchParameters.type === 'string' ? searchParameters.type : undefined
  let page: ReactNode
  if (path === '/') page = <HomePage context={context} />
  else if (path === '/blog')
    page = <ContentList contentType="blog" context={context} queryInput={query} />
  else if (path === '/wiki')
    page = <ContentList contentType="wiki" context={context} queryInput={query} />
  else if (path === '/search')
    page = <SearchPage context={context} queryInput={query} typeInput={type} />
  else if (path.startsWith('/blog/') || path.startsWith('/wiki/'))
    page = <ArticlePage context={context} path={path} />
  else {
    const special = specialPageSlugSchema.safeParse(segments.length === 1 ? segments[0] : undefined)
    if (!special.success) notFound()
    page = <SpecialPage context={context} slug={special.data} />
  }
  if (path === '/start') return page
  return (
    <SiteShell context={context} logicalPath={path}>
      {page}
    </SiteShell>
  )
}

export async function publicPageMetadata(
  segments: readonly string[],
  locale: AppLocale,
): Promise<Metadata> {
  const t = await getTranslations({ locale, namespace: 'Web' })
  const path = publicPath(segments)
  if (path.startsWith('/blog/') || path.startsWith('/wiki/')) {
    const document = await readCachedDocument(path, locale)
    if (!document) return { title: t('notFoundTitle') }
    const sourceDescription =
      typeof document.rawFrontmatter.description === 'string'
        ? document.rawFrontmatter.description
        : document.title
    const description = localizeContentText(sourceDescription, locale)
    const title = localizeContentText(document.title, locale)
    return { description, openGraph: { description, title }, title }
  }
  if (path === '/blog') return { description: t('blogDescription'), title: t('blogTitle') }
  if (path === '/wiki') return { description: t('wikiDescription'), title: t('wikiTitle') }
  if (path === '/search') return { description: t('searchDescription'), title: t('searchTitle') }
  const special = specialPageSlugSchema.safeParse(segments.length === 1 ? segments[0] : undefined)
  if (special.success) {
    switch (special.data) {
      case 'about':
        return { description: t('special.aboutDescription'), title: t('special.aboutTitle') }
      case 'cv':
        return { description: t('special.cvDescription'), title: t('special.cvTitle') }
      case 'friend':
        return { description: t('special.friendDescription'), title: t('special.friendTitle') }
      case 'more':
        return { description: t('special.moreDescription'), title: t('special.moreTitle') }
      case 'music':
        return { description: t('special.musicDescription'), title: t('special.musicTitle') }
      case 'mylogo':
        return { description: t('special.mylogoDescription'), title: t('special.mylogoTitle') }
      case 'start':
        return { description: t('special.startDescription'), title: t('special.startTitle') }
      case 'stats':
        return { description: t('special.statsDescription'), title: t('special.statsTitle') }
      case 'tech-footprint':
        return { description: t('special.techDescription'), title: t('special.techTitle') }
      case 'weight-loss':
        return { description: t('special.weightDescription'), title: t('special.weightTitle') }
    }
  }
  return { description: t('metadataDescription'), title: t('metadataTitle') }
}
