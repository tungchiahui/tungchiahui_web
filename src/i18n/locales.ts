import { type Locale, localeSchema, localeValues } from '@/domain/persistence'

export const locales = localeValues

export type AppLocale = Locale

export const defaultLocale: AppLocale = 'zh-cn'
export const appLocaleHeader = 'x-tungchiahui-locale'
export const appLocalePrefixedHeader = 'x-tungchiahui-locale-prefixed'

export function parseAppLocale(value: unknown): AppLocale {
  return localeSchema.parse(value)
}

export function localeFromPathname(pathname: string): AppLocale {
  const firstSegment = pathname.split('/')[1]
  const parsed = localeSchema.safeParse(firstSegment)
  return parsed.success ? parsed.data : defaultLocale
}
