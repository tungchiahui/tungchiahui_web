import { ExternalLink } from 'lucide-react'
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { BookmarkWorkspace } from '@/components/bookmark-workspace'
import { PrintButton } from '@/components/print-button'
import { SiteShell } from '@/components/site-shell'
import { techFootprintPayloadSchema, weightLossPayloadSchema } from '@/control-plane/contracts'
import { localizeContentText } from '@/i18n/content'
import type { AppLocale } from '@/i18n/locales'
import {
  listCachedDocuments,
  readCachedDocument,
  readCachedOwnerDataset,
} from '@/server/cached-content'
import type { PublicDocument } from '@/server/public-content'

import { renderMarkdown } from './markdown'
import {
  type PublicRouteContext,
  publicPath,
  type SpecialPageSlug,
  specialPageSlugSchema,
  withLocalePrefix,
} from './routes'

function formatDate(date: Date | null) {
  return date?.toISOString().slice(0, 10)
}

function CardLink({
  context,
  document,
}: Readonly<{ context: PublicRouteContext; document: PublicDocument }>) {
  return (
    <li>
      <Link
        className="block rounded-xl border bg-card p-5 shadow-sm transition hover:-translate-y-0.5 hover:border-primary"
        href={withLocalePrefix(document.routePath, context)}
      >
        <h3 className="font-semibold text-lg">
          {localizeContentText(document.title, context.locale)}
        </h3>
        {document.sourceUpdatedAt ? (
          <time className="mt-2 block text-muted-foreground text-sm">
            {formatDate(document.sourceUpdatedAt)}
          </time>
        ) : null}
      </Link>
    </li>
  )
}

async function HomePage({ context }: Readonly<{ context: PublicRouteContext }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const [blogs, wikis] = await Promise.all([
    listCachedDocuments('blog', context.locale),
    listCachedDocuments('wiki', context.locale),
  ])
  return (
    <>
      <section className="grid min-h-[24rem] content-center rounded-3xl border bg-card p-8 shadow-sm sm:p-14">
        <p className="font-medium text-primary text-sm tracking-[0.2em] uppercase">
          {t('homepageEyebrow')}
        </p>
        <h1 className="mt-5 max-w-3xl font-bold text-4xl tracking-tight sm:text-6xl">
          {t('homepageTitle')}
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground">{t('homepageDescription')}</p>
      </section>
      <div className="mt-12 grid gap-10 lg:grid-cols-2">
        {[
          { documents: blogs.slice(0, 3), href: '/blog', title: t('latestBlog') },
          { documents: wikis.slice(0, 3), href: '/wiki', title: t('latestWiki') },
        ].map((section) => (
          <section key={section.href}>
            <div className="mb-4 flex items-end justify-between gap-4">
              <h2 className="font-semibold text-2xl">{section.title}</h2>
              <Link
                className="text-primary text-sm hover:underline"
                href={withLocalePrefix(section.href, context)}
              >
                {t('viewAll')}
              </Link>
            </div>
            {section.documents.length ? (
              <ul className="grid gap-3">
                {section.documents.map((document) => (
                  <CardLink context={context} document={document} key={document.id} />
                ))}
              </ul>
            ) : (
              <p className="rounded-xl border p-5 text-muted-foreground">{t('emptyContent')}</p>
            )}
          </section>
        ))}
      </div>
    </>
  )
}

function wikiGroup(document: PublicDocument) {
  return document.sourcePath.split('/')[2] ?? document.sourcePath
}

async function ContentList({
  context,
  contentType,
}: Readonly<{ contentType: 'blog' | 'wiki'; context: PublicRouteContext }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const documents = await listCachedDocuments(contentType, context.locale)
  const title = contentType === 'blog' ? t('blogTitle') : t('wikiTitle')
  const description = contentType === 'blog' ? t('blogDescription') : t('wikiDescription')

  if (contentType === 'wiki') {
    const groups = Map.groupBy(documents, wikiGroup)
    return (
      <section>
        <h1 className="font-bold text-4xl">{title}</h1>
        <p className="mt-3 text-muted-foreground">{description}</p>
        <div className="mt-9 grid gap-8">
          {[...groups].map(([group, entries]) => (
            <section className="rounded-2xl border p-5" key={group}>
              <h2 className="mb-4 font-semibold text-xl">
                {entries[0]
                  ? localizeContentText(entries[0].title, context.locale)
                  : localizeContentText(group, context.locale)}
              </h2>
              <ol className="grid gap-2">
                {entries.map((document) => (
                  <CardLink context={context} document={document} key={document.id} />
                ))}
              </ol>
            </section>
          ))}
        </div>
      </section>
    )
  }

  return (
    <section>
      <h1 className="font-bold text-4xl">{title}</h1>
      <p className="mt-3 text-muted-foreground">{description}</p>
      <ul className="mt-9 grid gap-4 sm:grid-cols-2">
        {documents.map((document) => (
          <CardLink context={context} document={document} key={document.id} />
        ))}
      </ul>
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
  const navigation =
    document.contentType === 'wiki'
      ? all.filter((candidate) => wikiGroup(candidate) === wikiGroup(document))
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

  return (
    <article className="mx-auto max-w-4xl">
      <header className="border-b pb-8">
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
      </header>
      {rendered.headings.length > 1 ? (
        <nav aria-label={t('tableOfContents')} className="my-8 rounded-xl border bg-card p-5">
          <h2 className="font-semibold">{t('tableOfContents')}</h2>
          <ol className="mt-3 grid gap-1 text-sm">
            {rendered.headings.map((heading) => (
              <li className={heading.depth > 2 ? 'pl-4' : undefined} key={heading.id}>
                <a className="hover:text-primary" href={`#${heading.id}`}>
                  {heading.text}
                </a>
              </li>
            ))}
          </ol>
        </nav>
      ) : null}
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: unified drops raw HTML, rehype-sanitize validates the tree, and Shiki only adds generated markup. */}
      <div className="prose-site mt-9" dangerouslySetInnerHTML={{ __html: rendered.html }} />
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

function SpecialHeader({ description, title }: Readonly<{ description: string; title: string }>) {
  return (
    <header>
      <h1 className="font-bold text-4xl">{title}</h1>
      <p className="mt-4 max-w-3xl text-lg text-muted-foreground">{description}</p>
    </header>
  )
}

async function SpecialPage({
  context,
  slug,
}: Readonly<{ context: PublicRouteContext; slug: SpecialPageSlug }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  type SpecialMessageKey =
    | 'aboutDescription'
    | 'aboutTitle'
    | 'addBookmark'
    | 'blogCount'
    | 'bookmarkName'
    | 'bookmarkStorageNote'
    | 'bookmarkUrl'
    | 'contact'
    | 'cvDescription'
    | 'cvTitle'
    | 'exportBookmarks'
    | 'friendDescription'
    | 'friendTitle'
    | 'github'
    | 'importBookmarks'
    | 'moreDescription'
    | 'moreTitle'
    | 'musicDescription'
    | 'musicTitle'
    | 'mylogoDescription'
    | 'mylogoTitle'
    | 'noRecords'
    | 'printCv'
    | 'progress'
    | 'qqMusic'
    | 'removeBookmark'
    | 'resourceBoundary'
    | 'revision'
    | 'searchAction'
    | 'searchPlaceholder'
    | 'startDescription'
    | 'startTitle'
    | 'statsDescription'
    | 'statsTitle'
    | 'techDescription'
    | 'techTitle'
    | 'weight'
    | 'weightDescription'
    | 'weightTitle'
    | 'waist'
    | 'wikiCount'
  const s = (key: SpecialMessageKey, values?: Record<string, string | number>) =>
    t(`special.${key}`, values)
  const routes = [
    'about',
    'cv',
    'friend',
    'mylogo',
    'music',
    'start',
    'stats',
    'tech-footprint',
    'weight-loss',
  ] as const
  const titleKeys: Record<(typeof routes)[number], SpecialMessageKey> = {
    about: 'aboutTitle',
    cv: 'cvTitle',
    friend: 'friendTitle',
    music: 'musicTitle',
    mylogo: 'mylogoTitle',
    start: 'startTitle',
    stats: 'statsTitle',
    'tech-footprint': 'techTitle',
    'weight-loss': 'weightTitle',
  }

  switch (slug) {
    case 'about':
      return (
        <>
          <SpecialHeader description={s('aboutDescription')} title={s('aboutTitle')} />
          <p className="mt-8 rounded-xl border bg-card p-5">{s('contact')}</p>
        </>
      )
    case 'cv':
      return (
        <>
          <SpecialHeader description={s('cvDescription')} title={s('cvTitle')} />
          <PrintButton label={s('printCv')} />
        </>
      )
    case 'friend':
      return (
        <>
          <SpecialHeader description={s('friendDescription')} title={s('friendTitle')} />
          <div className="mt-8 flex gap-3">
            <a
              className="rounded-xl border p-4 text-primary"
              href="https://github.com/tungchiahui"
              rel="noreferrer"
              target="_blank"
            >
              {s('github')} <ExternalLink className="inline" size={14} />
            </a>
          </div>
        </>
      )
    case 'more':
      return (
        <>
          <SpecialHeader description={s('moreDescription')} title={s('moreTitle')} />
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {routes
              .filter((route) => route !== 'about')
              .map((route) => (
                <li key={route}>
                  <Link
                    className="block rounded-xl border bg-card p-5 hover:border-primary"
                    href={withLocalePrefix(`/${route}`, context)}
                  >
                    {s(titleKeys[route])}
                  </Link>
                </li>
              ))}
          </ul>
        </>
      )
    case 'mylogo':
      return (
        <>
          <SpecialHeader description={s('mylogoDescription')} title={s('mylogoTitle')} />
          <div className="mt-10 grid size-40 place-items-center rounded-[2.5rem] bg-primary font-black text-2xl text-primary-foreground">
            {t('siteName')}
          </div>
        </>
      )
    case 'music':
      return (
        <>
          <SpecialHeader description={s('musicDescription')} title={s('musicTitle')} />
          <a
            className="mt-8 inline-flex items-center gap-2 rounded-xl border p-4 text-primary"
            href="https://y.qq.com/"
            rel="noreferrer"
            target="_blank"
          >
            {s('qqMusic')} <ExternalLink size={15} />
          </a>
          <p className="mt-4 text-muted-foreground text-sm">{s('resourceBoundary')}</p>
        </>
      )
    case 'start':
      return (
        <>
          <SpecialHeader description={s('startDescription')} title={s('startTitle')} />
          <BookmarkWorkspace
            labels={{
              add: s('addBookmark'),
              export: s('exportBookmarks'),
              import: s('importBookmarks'),
              name: s('bookmarkName'),
              remove: s('removeBookmark'),
              search: s('searchAction'),
              searchPlaceholder: s('searchPlaceholder'),
              storageNote: s('bookmarkStorageNote'),
              url: s('bookmarkUrl'),
            }}
          />
        </>
      )
    case 'stats': {
      const [blogs, wikis] = await Promise.all([
        listCachedDocuments('blog', context.locale),
        listCachedDocuments('wiki', context.locale),
      ])
      return (
        <>
          <SpecialHeader description={s('statsDescription')} title={s('statsTitle')} />
          <dl className="mt-8 grid gap-4 sm:grid-cols-2">
            <div className="rounded-xl border bg-card p-6">
              <dt>{t('blog')}</dt>
              <dd className="mt-2 font-bold text-3xl">{s('blogCount', { count: blogs.length })}</dd>
            </div>
            <div className="rounded-xl border bg-card p-6">
              <dt>{t('wiki')}</dt>
              <dd className="mt-2 font-bold text-3xl">{s('wikiCount', { count: wikis.length })}</dd>
            </div>
          </dl>
        </>
      )
    }
    case 'tech-footprint': {
      const dataset = await readCachedOwnerDataset('tech_footprint')
      const parsed = techFootprintPayloadSchema.safeParse(dataset?.payload)
      const records = parsed.success ? Object.entries(parsed.data.records) : []
      return (
        <>
          <SpecialHeader description={s('techDescription')} title={s('techTitle')} />
          {dataset ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {s('revision', { revision: dataset.revision })}
            </p>
          ) : null}
          <ul className="mt-8 grid gap-3">
            {records.length ? (
              records.map(([name, record]) => (
                <li className="rounded-xl border bg-card p-5" key={name}>
                  <h2 className="font-semibold">{name}</h2>
                  <p className="mt-2">{s('progress', { progress: record.progress })}</p>
                  <p className="mt-2 text-muted-foreground">{record.note}</p>
                </li>
              ))
            ) : (
              <li>{s('noRecords')}</li>
            )}
          </ul>
        </>
      )
    }
    case 'weight-loss': {
      const dataset = await readCachedOwnerDataset('weight_loss')
      const parsed = weightLossPayloadSchema.safeParse(dataset?.payload)
      const records = parsed.success ? parsed.data.records : []
      return (
        <>
          <SpecialHeader description={s('weightDescription')} title={s('weightTitle')} />
          {dataset ? (
            <p className="mt-4 text-sm text-muted-foreground">
              {s('revision', { revision: dataset.revision })}
            </p>
          ) : null}
          <ol className="mt-8 grid gap-3">
            {records.length ? (
              records.map((record) => (
                <li className="rounded-xl border bg-card p-5" key={record.date}>
                  <time className="font-semibold">{record.date}</time>
                  <p className="mt-2">{s('weight', { value: record.weight || '-' })}</p>
                  <p>{s('waist', { value: record.waist || '-' })}</p>
                  <p className="mt-2 text-muted-foreground">{record.note}</p>
                </li>
              ))
            ) : (
              <li>{s('noRecords')}</li>
            )}
          </ol>
        </>
      )
    }
  }
}

export async function renderPublicPage(segments: readonly string[], context: PublicRouteContext) {
  const path = publicPath(segments)
  let page: ReactNode
  if (path === '/') page = <HomePage context={context} />
  else if (path === '/blog') page = <ContentList contentType="blog" context={context} />
  else if (path === '/wiki') page = <ContentList contentType="wiki" context={context} />
  else if (path.startsWith('/blog/') || path.startsWith('/wiki/'))
    page = <ArticlePage context={context} path={path} />
  else {
    const special = specialPageSlugSchema.safeParse(segments.length === 1 ? segments[0] : undefined)
    if (!special.success) notFound()
    page = <SpecialPage context={context} slug={special.data} />
  }
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
