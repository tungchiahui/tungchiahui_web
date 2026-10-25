import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ComponentProps } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('server-only', () => ({}))
vi.mock('next-intl', () => ({ useTranslations: () => (key: string) => key }))
vi.mock('next/link', () => ({
  useLinkStatus: () => ({ pending: false }),
  default: ({ prefetch, ...properties }: ComponentProps<'a'> & { prefetch?: boolean }) => (
    <a {...properties} data-prefetch={String(prefetch)} />
  ),
}))

import { ContentLink } from '@/components/content-link'
import { TrafficMetrics } from '@/components/traffic-metrics'
import { materializePublicDocument, summarizePublicDocument } from '@/server/public-content'
import { documentSummary, groupWikiDocuments } from '@/web/content-compatibility'

const labels = {
  averageTime: '平均时间',
  bounceRate: '跳出率',
  pageviews: '浏览量',
  unavailable: '不可用',
  visits: '访问次数',
}

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('reader work and request budgets', () => {
  it('keeps translated summaries and chapter metadata without retaining document bodies', () => {
    const document = materializePublicDocument(
      {
        contentType: 'blog',
        id: crypto.randomUUID(),
        title: '标题',
        rawMarkdown: '# 标题\n\n原文',
        localizedMarkdown: '# Title\n\nTranslated summary.',
        rawFrontmatter: {},
        routePath: '/blog/test',
        sourceHash: 'a'.repeat(64),
        sourcePath: 'content/posts/2026-01-01-test.md',
        sourceUpdatedAt: null,
        localizedLocale: 'en-us',
        localizedSourceHash: 'a'.repeat(64),
        fallbackSegmentCount: 0,
        pendingSegmentCount: 0,
        translatedSegmentCount: 1,
        translationMemoryHits: 1,
      },
      'en-us',
    )
    const summary = summarizePublicDocument(document)
    expect(documentSummary(summary)).toBe('Translated summary.')
    expect(summary).not.toHaveProperty('rawMarkdown')
    expect(summary).not.toHaveProperty('localizedMarkdown')
    const wiki = summarizePublicDocument({
      ...document,
      contentType: 'wiki',
      sourcePath: 'content/wiki/test/0100-chapter.md',
    })
    expect(groupWikiDocuments([wiki])[0]?.chapters[0]?.chapter).toBe('1')
    const project = summarizePublicDocument({
      ...document,
      contentType: 'project',
      routePath: '/projects/test',
      sourcePath: 'content/projects/test.md',
      rawFrontmatter: { description: 'Outdated metadata summary' },
      localizedMarkdown: '# Project\n\nTranslated project introduction.\n\nFurther details.',
    })
    expect(documentSummary(project)).toBe('Translated project introduction.')
    expect(project).not.toHaveProperty('localizedMarkdown')
  })

  it('prefetches a chapter on deliberate pointer or keyboard intent only', () => {
    vi.useFakeTimers()
    render(<ContentLink href="/wiki/chapter">Chapter</ContentLink>)
    const link = screen.getByRole('link')
    expect(link).toHaveAttribute('data-prefetch', 'false')
    fireEvent.mouseEnter(link)
    act(() => vi.advanceTimersByTime(60))
    fireEvent.mouseLeave(link)
    act(() => vi.advanceTimersByTime(200))
    expect(link).toHaveAttribute('data-prefetch', 'false')
    fireEvent.mouseEnter(link)
    act(() => vi.advanceTimersByTime(120))
    expect(link).toHaveAttribute('data-prefetch', 'true')
    cleanup()
    render(<ContentLink href="/wiki/other">Other</ContentLink>)
    fireEvent.focus(screen.getByRole('link'))
    expect(screen.getByRole('link')).toHaveAttribute('data-prefetch', 'true')
  })

  it('loads statistics only after visibility and retains requests across equivalent path arrays', async () => {
    let notify: ((visible: boolean) => void) | undefined
    const disconnect = vi.fn()
    vi.stubGlobal(
      'IntersectionObserver',
      class {
        constructor(callback: (entries: { isIntersecting: boolean }[]) => void) {
          notify = (visible) => callback([{ isIntersecting: visible }])
        }
        observe() {}
        disconnect = disconnect
      },
    )
    const fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        status: 'available',
        pageviews: 3,
        visits: 2,
        bounceRate: 0,
        averageVisitSeconds: 1,
      }),
    })
    vi.stubGlobal('fetch', fetch)
    const view = render(<TrafficMetrics labels={labels} paths={['/wiki/one']} />)
    expect(fetch).not.toHaveBeenCalled()
    act(() => notify?.(false))
    expect(fetch).not.toHaveBeenCalled()
    await act(async () => notify?.(true))
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(disconnect).toHaveBeenCalled()
    view.rerender(<TrafficMetrics labels={labels} paths={['/wiki/one']} />)
    expect(fetch).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/浏览量/)).toHaveTextContent('3')
  })
})
