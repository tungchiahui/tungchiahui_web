import enUsMessages from '../../messages/en-us.json'
import zhCnMessages from '../../messages/zh-cn.json'
import zhHkMessages from '../../messages/zh-hk.json'
import zhTwMessages from '../../messages/zh-tw.json'
import type { AppLocale } from './locales'

const messagesByLocale = {
  'en-us': enUsMessages,
  'zh-cn': zhCnMessages,
  'zh-hk': zhHkMessages,
  'zh-tw': zhTwMessages,
} as const satisfies Record<AppLocale, typeof zhCnMessages>

export function messagesForLocale(locale: AppLocale) {
  return messagesByLocale[locale]
}
