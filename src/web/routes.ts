import { z } from 'zod'

import { type AppLocale, defaultLocale, parseAppLocale } from '@/i18n/locales'

export const specialPageSlugs = [
  'about',
  'cv',
  'friend',
  'more',
  'music',
  'mylogo',
  'start',
  'stats',
  'tech-footprint',
  'weight-loss',
] as const

export const specialPageSlugSchema = z.enum(specialPageSlugs)
export type SpecialPageSlug = z.infer<typeof specialPageSlugSchema>

export function publicPath(segments: readonly string[]) {
  return segments.length === 0 ? '/' : `/${segments.join('/')}`
}

export type PublicRouteContext = Readonly<{
  locale: AppLocale
  prefixed: boolean
}>

export function withLocalePrefix(path: string, context: PublicRouteContext) {
  const { locale, prefixed } = context
  if (!prefixed) return path
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function localeSwitchPath(path: string, locale: AppLocale) {
  return path === '/' ? `/${locale}` : `/${locale}${path}`
}

export function parsePublicRoute(segments: readonly string[]): Readonly<{
  context: PublicRouteContext
  segments: readonly string[]
}> {
  if (segments.length === 0) {
    return { context: { locale: defaultLocale, prefixed: false }, segments }
  }
  try {
    const locale = parseAppLocale(segments[0])
    return { context: { locale, prefixed: true }, segments: segments.slice(1) }
  } catch {
    return { context: { locale: defaultLocale, prefixed: false }, segments }
  }
}
