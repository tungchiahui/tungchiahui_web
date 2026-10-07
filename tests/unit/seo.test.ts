import { describe, expect, it } from 'vitest'
import type { PublicDocument } from '@/server/public-content'
import { documentSummary } from '@/web/content-compatibility'
import {
  articleStructuredData,
  canonicalUrl,
  pageMetadata,
  publicSitemap,
  serializeStructuredData,
} from '@/web/seo'

const base = new URL('https://www.tungchiahui.cn')
const document: PublicDocument = {
  id: '10000000-0000-4000-8000-000000000001',
  contentType: 'blog',
  contentLocaleState: 'source',
  rawFrontmatter: {},
  rawMarkdown: '# Title\n\nA useful introduction.',
  localizedMarkdown: null,
  title: 'Title',
  routePath: '/blog/2026-01-01-title',
  sourcePath: 'content/posts/2026-01-01-Title.md',
  sourceHash: 'a'.repeat(64),
  sourceUpdatedAt: new Date('2026-02-01T00:00:00Z'),
  fallbackSegmentCount: 0,
  pendingSegmentCount: 0,
  translatedSegmentCount: 0,
  translationMemoryHits: 0,
}

describe('Public SEO', () => {
  it('uses one zh-CN canonical and reciprocal four-locale alternates', () => {
    expect(canonicalUrl(base, '/', 'zh-cn')).toBe('https://www.tungchiahui.cn/')
    const metadata = pageMetadata({
      base,
      path: document.routePath,
      locale: 'zh-tw',
      title: document.title,
      description: 'Useful introduction',
      siteName: 'TungChiaHui',
      document,
    })
    expect(metadata.alternates?.canonical).toBe(
      `https://www.tungchiahui.cn/zh-tw${document.routePath}`,
    )
    expect(metadata.alternates?.languages).toEqual({
      'zh-CN': `https://www.tungchiahui.cn${document.routePath}`,
      'zh-HK': `https://www.tungchiahui.cn/zh-hk${document.routePath}`,
      'zh-TW': `https://www.tungchiahui.cn/zh-tw${document.routePath}`,
      'en-US': `https://www.tungchiahui.cn/en-us${document.routePath}`,
      'x-default': `https://www.tungchiahui.cn${document.routePath}`,
    })
    expect(metadata.openGraph).toMatchObject({
      type: 'article',
      publishedTime: '2026-01-01',
      images: [{ url: 'https://www.tungchiahui.cn/opengraph-image', width: 1200, height: 630 }],
    })
    expect(metadata.twitter).toMatchObject({ card: 'summary_large_image' })
  })

  it('lets crawlers follow search results without indexing query pages', () => {
    const metadata = pageMetadata({
      base,
      path: '/blog',
      locale: 'zh-cn',
      title: 'Blog',
      description: 'Notes',
      siteName: 'TungChiaHui',
      noIndex: true,
    })
    expect(metadata.robots).toEqual({ index: false, follow: true })
    expect(metadata.alternates?.canonical).toBe('https://www.tungchiahui.cn/blog')
  })

  it('emits unique canonical entries without invented modification dates, search or aliases', () => {
    const sitemap = publicSitemap(base, [document, document])
    const urls = sitemap.map((entry) => entry.url)
    expect(new Set(urls).size).toBe(urls.length)
    expect(urls).not.toContain('https://www.tungchiahui.cn/zh-cn')
    expect(urls.some((url) => url.includes('/search') || url.includes('newtodolist'))).toBe(false)
    expect(sitemap.filter((entry) => entry.url.endsWith(document.routePath))).toHaveLength(4)
    expect(sitemap.every((entry) => entry.lastModified === undefined)).toBe(true)
    expect(
      sitemap.find((entry) => entry.url === 'https://www.tungchiahui.cn/about'),
    ).not.toHaveProperty('lastModified')
    expect(publicSitemap(base, []).some((entry) => entry.url.endsWith(document.routePath))).toBe(
      false,
    )
  })

  it('extracts readable prose without legacy components, tables, code or bare URL noise', () => {
    const rawMarkdown =
      '---\ntitle: Ignore me\n---\n\n# Heading\n\n<NuxtLink to="/tech-footprint">Old component</NuxtLink>\n\n介绍：https://example.com/path\n\n| Secret | Table |\n| --- | --- |\n| ignore | values |\n\n```ts\nconst secret = true\n```\n\nA **useful** [introduction](/wiki/intro) using `ROS2_Control`.'
    expect(documentSummary({ ...document, rawMarkdown })).toBe(
      'Old component A useful introduction using ROS2_Control.',
    )
    expect(
      documentSummary({ ...document, rawMarkdown: '# Title\n\n```ts\ncode\n```' }),
    ).toBeUndefined()
    expect(
      documentSummary({ ...document, rawFrontmatter: { description: 'Author summary' } }),
    ).toBe('Author summary')
  })

  it('escapes untrusted structured data and reports the actual fallback language', () => {
    const data = articleStructuredData(
      base,
      { ...document, contentLocaleState: 'fallback' },
      'en-us',
      '</script><script>alert(1)</script>',
      'Intro',
    )
    expect(data.inLanguage).toBe('zh-CN')
    expect(data['@type']).toBe('BlogPosting')
    const serialized = serializeStructuredData(data)
    expect(serialized).not.toContain('<')
    expect(JSON.parse(serialized)).toEqual(data)
  })
})
