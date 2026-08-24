import { z } from 'zod'

import type { ContentChange } from '../content/hooks'
import { locales } from '../i18n/locales'
import { localeSwitchPath } from './routes'

export const publicContentCachePolicy = Object.freeze({
  invalidation: 'exact-path-and-shared-index-tags',
  key: 'content type, canonical route path, source hash',
  owner: 'Next.js web application',
  ttl: null,
})

const routeSchema = z.string().startsWith('/').min(2)

export function routeCacheTag(routePath: string) {
  return `content:route:${routeSchema.parse(routePath)}`
}

export function contentTypeCacheTag(contentType: 'blog' | 'wiki') {
  return `content:list:${contentType}`
}

export function affectedPublicPaths(changes: readonly ContentChange[]) {
  const paths = new Set<string>(['/', ...locales.map((locale) => localeSwitchPath('/', locale))])
  for (const change of changes) {
    const routePaths = [change.routePath, change.previousRoutePath].filter(
      (value): value is string => value !== undefined,
    )
    for (const routePath of routePaths) {
      const validated = routeSchema.parse(routePath)
      paths.add(validated)
      for (const locale of locales) paths.add(localeSwitchPath(validated, locale))
      const section = validated.startsWith('/blog/') ? '/blog' : '/wiki'
      paths.add(section)
      for (const locale of locales) paths.add(localeSwitchPath(section, locale))
    }
  }
  return [...paths].toSorted()
}
