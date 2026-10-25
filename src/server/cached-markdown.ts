import 'server-only'

import { createHash } from 'node:crypto'
import { gunzipSync, gzipSync } from 'node:zlib'
import { unstable_cache } from 'next/cache'

import type { AppLocale } from '@/i18n/locales'
import { renderArticleMarkdown } from '@/web/article-markdown'
import { routeCacheTag } from '@/web/cache-policy'
import type { PublicDocument } from './public-content'

export async function readCachedArticleMarkdown(document: PublicDocument, locale: AppLocale) {
  // English memory can change without changing the canonical source hash.
  const revision = createHash('sha256')
    .update(JSON.stringify([document.rawMarkdown, document.localizedMarkdown]))
    .digest('hex')
  const cached = await unstable_cache(
    async () => {
      const { html, ...metadata } = await renderArticleMarkdown(document, locale)
      // The production Next cache is a 64 MiB tmpfs. Token-level HTML expands
      // substantially; compress it without changing the browser response or cache owner.
      return { ...metadata, htmlGzip: gzipSync(html).toString('base64') }
    },
    ['rendered-article-gzip-v1', locale, document.routePath, revision],
    { revalidate: false, tags: [routeCacheTag(document.routePath)] },
  )()
  return Object.freeze({
    headings: cached.headings,
    html: gunzipSync(Buffer.from(cached.htmlGzip, 'base64')).toString('utf8'),
    readingMinutes: cached.readingMinutes,
  })
}
