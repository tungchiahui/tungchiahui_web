import type { AppLocale } from '@/i18n/locales'
import type { PublicDocument } from '@/server/public-content'

import { renderMarkdown } from './markdown'

/** Older regional materializations may have lost TeX escapes before math was protected. */
export function renderArticleMarkdown(
  document: Pick<PublicDocument, 'localizedMarkdown' | 'rawMarkdown'>,
  locale: AppLocale,
) {
  switch (locale) {
    case 'zh-hk':
    case 'zh-tw':
      // Reuse the established deterministic renderer on the authoritative PostgreSQL source.
      return renderMarkdown(document.rawMarkdown, locale)
    case 'zh-cn':
    case 'en-us':
      return renderMarkdown(document.localizedMarkdown ?? document.rawMarkdown, locale)
    default: {
      const unreachable: never = locale
      throw new Error(`Unsupported article locale: ${String(unreachable)}`)
    }
  }
}
