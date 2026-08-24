import type { AppLocale } from '@/i18n/locales'
import type zhCnMessages from '../../messages/zh-cn.json'

declare module 'next-intl' {
  interface AppConfig {
    Locale: AppLocale
    Messages: typeof zhCnMessages
  }
}
