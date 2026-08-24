import { z } from 'zod'

import type { ContentChange } from '../content/hooks'

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

function prefixed(routePath: string) {
  return routePath === '/' ? '/zh-cn' : `/zh-cn${routePath}`
}

export function affectedPublicPaths(changes: readonly ContentChange[]) {
  const paths = new Set<string>(['/', '/zh-cn'])
  for (const change of changes) {
    const routePaths = [change.routePath, change.previousRoutePath].filter(
      (value): value is string => value !== undefined,
    )
    for (const routePath of routePaths) {
      const validated = routeSchema.parse(routePath)
      paths.add(validated)
      paths.add(prefixed(validated))
      const section = validated.startsWith('/blog/') ? '/blog' : '/wiki'
      paths.add(section)
      paths.add(prefixed(section))
    }
  }
  return [...paths].toSorted()
}
