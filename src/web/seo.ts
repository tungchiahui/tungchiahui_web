import type { Metadata, MetadataRoute } from 'next'

import { type AppLocale, locales } from '@/i18n/locales'
import type { PublicDocument } from '@/server/public-content'
import { documentDate, documentSummary } from './content-compatibility'
import { localeSwitchPath, specialPageSlugs } from './routes'

const languageTags: Record<AppLocale, string> = {
  'zh-cn': 'zh-CN',
  'zh-hk': 'zh-HK',
  'zh-tw': 'zh-TW',
  'en-us': 'en-US',
}

export function canonicalUrl(base: URL, path: string, locale: AppLocale) {
  return new URL(locale === 'zh-cn' ? path : localeSwitchPath(path, locale), base).toString()
}

export function languageAlternates(base: URL, path: string) {
  return Object.fromEntries([
    ...locales.map((locale) => [languageTags[locale], canonicalUrl(base, path, locale)]),
    ['x-default', canonicalUrl(base, path, 'zh-cn')],
  ])
}

export function pageMetadata(
  input: Readonly<{
    base: URL
    path: string
    locale: AppLocale
    title: string
    description: string
    siteName: string
    noIndex?: boolean
    document?: PublicDocument
  }>,
): Metadata {
  const { base, path, locale, title, description, siteName, document } = input
  const url = canonicalUrl(base, path, locale)
  const images = [
    { url: new URL('/opengraph-image', base).toString(), width: 1200, height: 630, alt: siteName },
  ]
  const published = document ? documentDate(document) : undefined
  const publishedTime = published && !Number.isNaN(Date.parse(published)) ? published : undefined
  return {
    title,
    description,
    alternates: { canonical: url, languages: languageAlternates(base, path) },
    robots: { index: !input.noIndex, follow: true },
    openGraph: {
      title,
      description,
      siteName,
      url,
      locale: languageTags[locale].replace('-', '_'),
      alternateLocale: locales
        .filter((candidate) => candidate !== locale)
        .map((candidate) => languageTags[candidate].replace('-', '_')),
      images,
      ...(document
        ? {
            type: 'article',
            authors: [new URL('/about', base).toString()],
            ...(publishedTime ? { publishedTime } : {}),
          }
        : { type: 'website' }),
    },
    twitter: { card: 'summary_large_image', title, description, images },
  }
}

export function publicSitemap(
  base: URL,
  documents: readonly PublicDocument[],
): MetadataRoute.Sitemap {
  const paths = new Set([
    '/',
    '/blog',
    '/wiki',
    ...specialPageSlugs.map((slug) => `/${slug}`),
    ...documents.map((document) => document.routePath),
  ])
  // sourceUpdatedAt is the authored/frontmatter date, not a Git modification
  // timestamp. Omit lastmod until a reliable content-modification fact exists.
  return [...paths]
    .sort((left, right) => left.localeCompare(right))
    .flatMap((path) =>
      locales.map((locale) => ({
        url: canonicalUrl(base, path, locale),
        alternates: { languages: languageAlternates(base, path) },
      })),
    )
}

export function articleStructuredData(
  base: URL,
  document: PublicDocument,
  locale: AppLocale,
  title: string,
  description: string,
) {
  const url = canonicalUrl(base, document.routePath, locale)
  const published = documentDate(document)
  return {
    '@context': 'https://schema.org',
    '@type': document.contentType === 'blog' ? 'BlogPosting' : 'TechArticle',
    '@id': `${url}#article`,
    headline: title,
    description: description || documentSummary(document),
    url,
    mainEntityOfPage: { '@type': 'WebPage', '@id': url },
    inLanguage: document.contentLocaleState === 'fallback' ? 'zh-CN' : languageTags[locale],
    author: { '@type': 'Person', name: 'TungChiaHui', url: new URL('/about', base).toString() },
    image: new URL('/opengraph-image', base).toString(),
    ...(published && !Number.isNaN(Date.parse(published)) ? { datePublished: published } : {}),
  }
}

export function serializeStructuredData(value: unknown) {
  return JSON.stringify(value).replaceAll('<', '\\u003c')
}
