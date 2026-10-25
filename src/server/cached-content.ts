import 'server-only'

import { unstable_cache } from 'next/cache'
import { cache } from 'react'
import type { ContentType } from '../domain/persistence'
import type { AppLocale } from '../i18n/locales'
import { contentTypeCacheTag, routeCacheTag } from '../web/cache-policy'
import {
  getPublicContentRepository,
  parsePublicDocument,
  parsePublicDocumentSummaries,
} from './public-content'

export const readCachedDocument = cache(async (routePath: string, locale: AppLocale) => {
  const cached = await unstable_cache(
    () => getPublicContentRepository().findByRoute(routePath, locale),
    ['public-document', locale, routePath],
    { revalidate: false, tags: [routeCacheTag(routePath)] },
  )()
  return cached === undefined ? undefined : parsePublicDocument(cached)
})

export const listCachedDocuments = cache(async (contentType: ContentType, locale: AppLocale) => {
  const cached = await unstable_cache(
    () => getPublicContentRepository().list(contentType, locale),
    ['public-document-summaries-v1', locale, contentType],
    { revalidate: false, tags: [contentTypeCacheTag(contentType)] },
  )()
  return parsePublicDocumentSummaries(cached)
})

export function readCachedOwnerDataset(datasetKey: 'tech_footprint' | 'weight_loss') {
  // Personal trackers are small, mutable datasets. Request-time reads across both
  // slots avoid a write committing while a stale indefinite cache remains visible.
  return getPublicContentRepository().readOwnerDataset(datasetKey)
}
