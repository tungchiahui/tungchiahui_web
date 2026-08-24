import { headers } from 'next/headers'
import { getRequestConfig } from 'next-intl/server'

import { appLocaleHeader, defaultLocale, parseAppLocale } from './locales'
import { messagesForLocale } from './messages'

export default getRequestConfig(async () => {
  const requestHeaders = await headers()
  const parsed = (() => {
    try {
      return parseAppLocale(requestHeaders.get(appLocaleHeader))
    } catch {
      return defaultLocale
    }
  })()

  return {
    locale: parsed,
    messages: messagesForLocale(parsed),
  }
})
