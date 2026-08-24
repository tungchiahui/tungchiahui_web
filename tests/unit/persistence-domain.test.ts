import { describe, expect, it } from 'vitest'

import {
  applicationJobRequestSchema,
  documentWriteSchema,
  localeSchema,
  ownerDatasetWriteSchema,
} from '../../src/domain/persistence'

describe('persistence trust-boundary validation', () => {
  it('accepts only approved locales', () => {
    expect(localeSchema.safeParse('zh-cn').success).toBe(true)
    expect(localeSchema.safeParse('zh-hant').success).toBe(false)
  })

  it('rejects infrastructure operations from the PostgreSQL application-job boundary', () => {
    expect(
      applicationJobRequestSchema.safeParse({
        jobType: 'deploy',
        payload: { image: 'example' },
      }).success,
    ).toBe(false)
    expect(
      applicationJobRequestSchema.safeParse({
        jobType: 'content_sync',
        payload: { sourceCommit: 'a'.repeat(40) },
      }).success,
    ).toBe(true)
  })

  it('rejects malformed external content and owner-dataset payloads', () => {
    expect(
      documentWriteSchema.safeParse({
        id: 'not-a-uuid',
        contentType: 'blog',
        sourcePath: '',
        sourceCommit: 'main',
        title: '',
        rawFrontmatter: [],
        rawMarkdown: '',
        sourceHash: 'invalid',
        routePath: 'relative',
        sourceUpdatedAt: null,
      }).success,
    ).toBe(false)
    expect(
      ownerDatasetWriteSchema.safeParse({
        datasetKey: 'unapproved_dataset',
        payload: [],
        revision: -1,
        updatedBy: '',
      }).success,
    ).toBe(false)
  })
})
