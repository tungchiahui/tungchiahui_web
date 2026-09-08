import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { publicTrafficQuerySchema, publicTrafficResponseSchema } from '@/analytics/public-traffic'
import { publicUmamiConfig } from '@/analytics/umami-config'
import { ArticleReader } from '@/components/article-reader'
import { TrafficMetrics } from '@/components/traffic-metrics'
import type { PublicDocument } from '@/server/public-content'
import {
  documentDate,
  documentSummary,
  groupWikiDocuments,
  trafficPaths,
} from '@/web/content-compatibility'

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn() }) }))

function fixture(overrides: Partial<PublicDocument>): PublicDocument {
  return {
    contentLocaleState: 'source',
    contentType: 'wiki',
    fallbackSegmentCount: 0,
    id: crypto.randomUUID(),
    localizedMarkdown: null,
    pendingSegmentCount: 0,
    rawFrontmatter: { title: 'Fixture' },
    rawMarkdown: '# Fixture\n\nA useful summary paragraph.',
    routePath: '/wiki/fixture',
    sourceHash: 'a'.repeat(64),
    sourcePath: 'content/wiki/2024-01-01-Fixture/index.md',
    sourceUpdatedAt: new Date('2024-01-01T00:00:00.000Z'),
    title: 'Fixture',
    translatedSegmentCount: 0,
    translationMemoryHits: 0,
    ...overrides,
  }
}

describe('Phase 18 Blog/Wiki compatibility', () => {
  it('derives legacy blog date and summary without inventing taxonomy', () => {
    const blog = fixture({
      contentType: 'blog',
      rawMarkdown:
        '---\ntitle: Post\n---\n\n# Post\n\nFirst useful paragraph with [a link](/wiki/x).',
      routePath: '/blog/2026-02-09-post',
      sourcePath: 'content/posts/2026-02-09-Post.md',
    })
    expect(documentDate(blog)).toBe('2026-02-09')
    expect(documentSummary(blog)).toBe('First useful paragraph with a link.')
  })

  it('groups, orders and continuously numbers sparse hierarchical Wiki chapters', () => {
    const root = 'content/wiki/2024-01-01-Fixture'
    const documents = [
      fixture({ sourcePath: `${root}/index.md`, title: 'Fixture handbook' }),
      fixture({ sourcePath: `${root}/0900-Second.md`, title: 'Second' }),
      fixture({ sourcePath: `${root}/0100-First.md`, title: 'First' }),
      fixture({ sourcePath: `${root}/0100-0800-Child.md`, title: 'Child' }),
    ]
    const groups = groupWikiDocuments(documents)
    expect(groups).toHaveLength(1)
    expect(groups[0]?.title).toBe('Fixture handbook')
    expect(
      groups[0]?.chapters.map((entry) => [entry.document.title, entry.chapter, entry.chapterDepth]),
    ).toEqual([
      ['First', '1', 0],
      ['Child', '1.1', 1],
      ['Second', '2', 0],
    ])
  })

  it('aggregates canonical, locale-prefixed and approved Legacy aliases', () => {
    expect(trafficPaths('/blog/newtodolist')).toEqual([
      '/blog/2026-02-09-xin-de-todolist-jie-mian',
      '/blog/newtodolist',
      '/en-us/blog/2026-02-09-xin-de-todolist-jie-mian',
      '/en-us/blog/newtodolist',
      '/zh-cn/blog/2026-02-09-xin-de-todolist-jie-mian',
      '/zh-cn/blog/newtodolist',
      '/zh-hk/blog/2026-02-09-xin-de-todolist-jie-mian',
      '/zh-hk/blog/newtodolist',
      '/zh-tw/blog/2026-02-09-xin-de-todolist-jie-mian',
      '/zh-tw/blog/newtodolist',
    ])
  })

  it('keeps the public traffic boundary bounded and aggregate-only', () => {
    expect(publicUmamiConfig).toMatchObject({
      origin: 'https://umami.tungchiahui.cn',
      shareId: 'rCG6EZoHmlCmNnWn',
      websiteId: '993e907c-7120-4da5-9eaf-85a914ffbc9c',
    })
    expect(publicTrafficQuerySchema.parse(['/blog/post', '/blog/post'])).toEqual(['/blog/post'])
    expect(() => publicTrafficQuerySchema.parse(['/blog/../private'])).toThrow()
    expect(
      publicTrafficResponseSchema.parse({
        averageVisitSeconds: 12,
        bounceRate: 0.5,
        pageviews: 4,
        status: 'available',
        visits: 2,
      }),
    ).not.toHaveProperty('token')
  })

  it('omits the traffic block when Umami has no history for a route', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      json: async () => ({
        averageVisitSeconds: 0,
        bounceRate: 0,
        pageviews: 0,
        status: 'available',
        visits: 0,
      }),
      ok: true,
    })
    vi.stubGlobal('fetch', fetchMock)
    try {
      const { container } = render(
        <TrafficMetrics
          labels={{
            averageTime: 'Average visit',
            bounceRate: 'Bounce rate',
            pageviews: 'Pageviews',
            unavailable: 'Unavailable',
            visits: 'Visits',
          }}
          paths={['/wiki/new-route']}
          variant="detail"
        />,
      )
      await waitFor(() => expect(fetchMock).toHaveBeenCalledOnce())
      await waitFor(() => expect(container.querySelector('[data-traffic-empty]')).not.toBeNull())
      expect(container.querySelector('[data-traffic-metrics]')).toBeNull()
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('restores code copy, image zoom, mobile drawers and keyboard close', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
    render(
      <ArticleReader
        documentNavigation={[
          { chapter: '1', current: true, depth: 0, href: '/wiki/fixture/one', title: 'One' },
        ]}
        headings={[
          { depth: 2, id: 'first', level: 0, number: '1', text: 'First' },
          { depth: 2, id: 'second', level: 0, number: '2', text: 'Second' },
        ]}
        html={
          '<h2 data-heading-anchor id="first" tabindex="0">First</h2><pre><code>const safe = true</code></pre><img alt="Fixture image" src="/images/fixture.png">'
        }
        labels={{
          close: 'Close',
          codeCopied: 'Copied',
          copyCode: 'Copy code',
          documentNavigation: 'Document chapters',
          imagePreview: 'Image preview',
          tableOfContents: 'On this page',
        }}
      />,
    )
    await userEvent.click(await screen.findByRole('button', { name: 'Copy code' }))
    expect(writeText).toHaveBeenCalledWith('const safe = true')
    await userEvent.click(screen.getByRole('heading', { name: 'First' }))
    expect(window.location.hash).toBe('#first')
    await userEvent.click(screen.getByRole('img', { name: 'Fixture image' }))
    expect(screen.getByRole('dialog', { name: 'Image preview' })).toBeVisible()
    await userEvent.click(
      screen.getByRole('dialog', { name: 'Image preview' }).querySelector('img') as HTMLElement,
    )
    expect(screen.queryByRole('dialog', { name: 'Image preview' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Document chapters' }))
    expect(document.querySelector('[data-reader-drawer]')).toBeInTheDocument()
    fireEvent.keyDown(document, { key: 'Escape' })
    await waitFor(() =>
      expect(document.querySelector('[data-reader-drawer]')).not.toBeInTheDocument(),
    )
    expect(screen.getAllByRole('link', { name: '1. First' })).not.toHaveLength(0)
    await userEvent.click(screen.getByRole('button', { name: 'On this page' }))
    const tocLinks = screen.getAllByRole('link', { name: '1. First' })
    const drawerLink = tocLinks.at(-1)
    expect(drawerLink).toBeDefined()
    if (!drawerLink) throw new Error('Drawer TOC link is missing')
    await userEvent.click(drawerLink)
    expect(document.querySelector('[data-reader-drawer]')).not.toBeInTheDocument()
  })
})
