import 'server-only'

import { unstable_cache } from 'next/cache'

import { contentTypeCacheTag, routeCacheTag } from '../web/cache-policy'
import {
  getPublicContentRepository,
  parsePublicDocument,
  parsePublicDocuments,
} from './public-content'

export async function readCachedDocument(routePath: string) {
  const cached = await unstable_cache(
    () => getPublicContentRepository().findByRoute(routePath),
    ['public-document', routePath],
    { revalidate: false, tags: [routeCacheTag(routePath)] },
  )()
  return cached === undefined ? undefined : parsePublicDocument(cached)
}

export async function listCachedDocuments(contentType: 'blog' | 'wiki') {
  const cached = await unstable_cache(
    () => getPublicContentRepository().list(contentType),
    ['public-document-list', contentType],
    { revalidate: false, tags: [contentTypeCacheTag(contentType)] },
  )()
  return parsePublicDocuments(cached)
}

export function readCachedOwnerDataset(datasetKey: 'tech_footprint' | 'weight_loss') {
  return unstable_cache(
    () => getPublicContentRepository().readOwnerDataset(datasetKey),
    ['public-owner-dataset', datasetKey],
    { revalidate: false, tags: [`owner-dataset:${datasetKey}`] },
  )()
}
