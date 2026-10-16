import { createTranslator } from 'next-intl'
import type { AppLocale } from '../i18n/locales'
import { messagesForLocale } from '../i18n/messages'
import { buildDefaultStartPayload } from './default-payload'

export function createDefaultStartPayload(locale: AppLocale) {
  return buildDefaultStartPayload(
    createTranslator({
      locale,
      messages: messagesForLocale(locale),
      namespace: 'Web.startDefaults',
    }),
  )
}

export const defaultStartPayload = createDefaultStartPayload('zh-cn')
