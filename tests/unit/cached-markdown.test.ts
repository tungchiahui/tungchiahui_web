import { beforeEach, describe, expect, it, vi } from 'vitest'

const state = vi.hoisted(() => ({ entries: new Map<string, Promise<unknown>>() }))
vi.mock('server-only', () => ({}))
vi.mock('next/cache', () => ({
  unstable_cache: (render: () => Promise<unknown>, key: string[]) => () => {
    const serialized = JSON.stringify(key)
    const cached = state.entries.get(serialized)
    if (cached) return cached
    const pending = render()
    state.entries.set(serialized, pending)
    return pending
  },
}))
vi.mock('@/web/article-markdown', () => ({
  renderArticleMarkdown: vi.fn(async () => ({ headings: [], html: 'rendered', readingMinutes: 1 })),
}))

import { readCachedArticleMarkdown } from '@/server/cached-markdown'
import type { PublicDocument } from '@/server/public-content'
import { renderArticleMarkdown } from '@/web/article-markdown'

const document: PublicDocument = {
  contentLocaleState: 'source',
  contentType: 'wiki',
  fallbackSegmentCount: 0,
  id: crypto.randomUUID(),
  localizedMarkdown: null,
  pendingSegmentCount: 0,
  rawFrontmatter: {},
  rawMarkdown: '# 原文',
  routePath: '/wiki/test',
  sourceHash: 'a'.repeat(64),
  sourcePath: 'content/wiki/test/index.md',
  sourceUpdatedAt: null,
  title: 'Test',
  translatedSegmentCount: 0,
  translationMemoryHits: 0,
}

beforeEach(() => {
  state.entries.clear()
  vi.clearAllMocks()
})

describe('article render cache identity', () => {
  it('reuses the render cache key and restores HTML for repeated content', async () => {
    await readCachedArticleMarkdown(document, 'zh-cn')
    const result = await readCachedArticleMarkdown(document, 'zh-cn')
    expect(result.html).toBe('rendered')
    expect(result).not.toHaveProperty('htmlGzip')
    expect(renderArticleMarkdown).toHaveBeenCalledTimes(1)
  })

  it('separates locale, source and translation-only changes', async () => {
    await readCachedArticleMarkdown(document, 'en-us')
    await readCachedArticleMarkdown({ ...document, localizedMarkdown: '# English' }, 'en-us')
    await readCachedArticleMarkdown({ ...document, rawMarkdown: '# 新原文' }, 'en-us')
    await readCachedArticleMarkdown(document, 'zh-hk')
    expect(renderArticleMarkdown).toHaveBeenCalledTimes(4)
  })
})
