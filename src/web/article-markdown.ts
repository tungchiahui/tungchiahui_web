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
    case 'en-us':
      // Translation changes visible headings, while authored links and existing hashes stay canonical.
      return renderMarkdown(document.localizedMarkdown ?? document.rawMarkdown, locale, {
        anchorSource: document.rawMarkdown,
      })
    case 'zh-cn':
      return renderMarkdown(document.localizedMarkdown ?? document.rawMarkdown, locale)
    default: {
      const unreachable: never = locale
      throw new Error(`Unsupported article locale: ${String(unreachable)}`)
    }
  }
}
