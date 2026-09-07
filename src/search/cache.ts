import 'server-only'

import { unstable_cache } from 'next/cache'
import { z } from 'zod'

import { searchLocaleCacheTag } from '../web/cache-policy'
import { searchRequestSchema, searchResultSchema } from './contracts'
import { SearchIndexRepository } from './repository'

let repository: SearchIndexRepository | undefined

function getSearchRepository() {
  repository ??= new SearchIndexRepository(z.url().parse(process.env.DATABASE_URL))
  return repository
}

export async function readCachedSearch(input: unknown) {
  const request = searchRequestSchema.parse(input)
  const cached = await unstable_cache(
    () => getSearchRepository().search(request),
    [
      'public-search',
      request.locale,
      request.contentType ?? 'all',
      request.query,
      String(request.limit),
    ],
    { revalidate: false, tags: [searchLocaleCacheTag(request.locale)] },
  )()
  return Object.freeze(cached.map((result) => Object.freeze(searchResultSchema.parse(result))))
}
