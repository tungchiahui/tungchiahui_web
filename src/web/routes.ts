import { z } from 'zod'

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

export function withZhCnPrefix(path: string, prefixed: boolean) {
  if (!prefixed) return path
  return path === '/' ? '/zh-cn' : `/zh-cn${path}`
}
