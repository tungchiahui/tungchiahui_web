import 'server-only'

import { unstable_cache } from 'next/cache'
import type { AppLocale } from '../i18n/locales'
import { contentTypeCacheTag, routeCacheTag } from '../web/cache-policy'
import {
  getPublicContentRepository,
  parsePublicDocument,
  parsePublicDocuments,
} from './public-content'

export async function readCachedDocument(routePath: string, locale: AppLocale) {
  const cached = await unstable_cache(
    () => getPublicContentRepository().findByRoute(routePath, locale),
    ['public-document', locale, routePath],
    { revalidate: false, tags: [routeCacheTag(routePath)] },
  )()
  return cached === undefined ? undefined : parsePublicDocument(cached)
}

export async function listCachedDocuments(contentType: 'blog' | 'wiki', locale: AppLocale) {
  const cached = await unstable_cache(
    () => getPublicContentRepository().list(contentType, locale),
    ['public-document-list', locale, contentType],
    { revalidate: false, tags: [contentTypeCacheTag(contentType)] },
  )()
  return parsePublicDocuments(cached)
}

export function readCachedOwnerDataset(datasetKey: 'tech_footprint' | 'weight_loss') {
  // Personal trackers are small, mutable datasets. Request-time reads across both
  // slots avoid a write committing while a stale indefinite cache remains visible.
  return getPublicContentRepository().readOwnerDataset(datasetKey)
}
