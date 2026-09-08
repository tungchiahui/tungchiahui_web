import { describe, expect, it } from 'vitest'

import {
  pathsForRevalidation,
  signRevalidationPayload,
  verifyRevalidationSignature,
} from '@/content/revalidation'
import { resolveMarkdownAsset, resolvePublicAsset } from '@/web/assets'
import { affectedPublicPaths, publicContentCachePolicy } from '@/web/cache-policy'
import { renderMarkdown } from '@/web/markdown'

const change = {
  documentId: '10000000-0000-4000-8000-000000000001',
  previousRoutePath: '/wiki/old-route',
  routePath: '/wiki/new-route',
  sourceHash: 'a'.repeat(64),
  type: 'moved' as const,
}

describe('Phase 6 public web boundaries', () => {
  it('defines an exact route cache owner and invalidates every locale and list path', () => {
    expect(publicContentCachePolicy).toEqual({
      invalidation: 'exact-path-and-shared-index-tags',
      key: 'content type, canonical route path, source hash',
      owner: 'Next.js web application',
      ttl: null,
    })
    const paths = affectedPublicPaths([change])
    expect(paths).toHaveLength(20)
    expect(paths).toEqual(
      expect.arrayContaining([
        '/',
        '/en-us/wiki/new-route',
        '/zh-cn/wiki/new-route',
        '/zh-hk/wiki/old-route',
        '/zh-tw/wiki',
      ]),
    )
  })

  it('signs and validates the internal revalidation trust boundary', () => {
    const body = JSON.stringify({
      changes: [change],
      sourceCommit: 'b'.repeat(40),
      translation: {
        fallbackSegments: 1,
        memoryHits: 2,
        pendingSegments: 1,
        translatedSegments: 2,
      },
    })
    const secret = 'phase-6-test-revalidation-secret'
    const signature = signRevalidationPayload(body, secret)

    expect(verifyRevalidationSignature(body, secret, signature)).toBe(true)
    expect(verifyRevalidationSignature(`${body} `, secret, signature)).toBe(false)
    expect(pathsForRevalidation(JSON.parse(body) as unknown)).toContain('/zh-cn/wiki/new-route')
  })

  it('validates local/CDN asset URLs and rejects unsafe schemes and traversal', () => {
    expect(resolvePublicAsset('/api/assets/fixtures/phase-6.svg')).toMatchObject({
      origin: 'local',
      url: '/api/assets/fixtures/phase-6.svg',
    })
    expect(resolvePublicAsset('https://cdn.tungchiahui.cn/路径/image.webp')).toMatchObject({
      origin: 'cdn',
    })
    expect(resolveMarkdownAsset('javascript:alert(1)')).toBeUndefined()
    expect(() => resolvePublicAsset('/images/../secret')).toThrow()
    expect(() => resolvePublicAsset('/images/%2e%2e/secret')).toThrow()
    expect(() => resolvePublicAsset('/images/a" onerror="alert(1)')).toThrow()
  })

  it('renders safe Markdown with Shiki, headings, links, images and protected identifiers', async () => {
    const rendered = await renderMarkdown(`---
title: Fixture
---

# 中文标题

Use \`ROS2_Control\`, [external](http://example.com/path), and [attachment](/docs/file.pdf).

## Code

\`\`\`ts
const identifier = '保持'
\`\`\`

![fixture](/api/assets/fixtures/phase-6.svg)

| Column A | Column B |
| --- | --- |
| Value A | Value B |

<script>alert('unsafe')</script>`)

    expect(rendered.headings).toEqual([
      { depth: 1, id: '中文标题', level: 0, number: '1', text: '中文标题' },
      { depth: 2, id: 'code', level: 1, number: '1.1', text: 'Code' },
    ])
    expect(rendered.html).toContain('ROS2_Control')
    expect(rendered.html).toContain('shiki')
    expect(rendered.html).toContain('class="language-ts"')
    expect(rendered.html).toContain('--shiki-light')
    expect(rendered.html).toContain('--shiki-dark')
    expect(rendered.html).toContain('rel="noopener noreferrer"')
    expect(rendered.html).toContain('data-attachment="true"')
    expect(rendered.html).toContain('data-asset-origin="local"')
    expect(rendered.html).toContain('<div class="table-scroll"><table>')
    expect(rendered.html).toContain(
      '<h1 data-heading-anchor id="中文标题" tabindex="0"><span class="heading-number">1.</span>',
    )
    expect(rendered.html).toContain('<h2 data-heading-anchor id="code" tabindex="0">')
    expect(rendered.html).not.toContain('<script')
  }, 20_000)

  it('highlights the fenced languages used by the canonical Markdown corpus', async () => {
    const languages = [
      'bash',
      'c',
      'cmake',
      'cpp',
      'dart',
      'diff',
      'dockerfile',
      'gitignore',
      'html',
      'ini',
      'javascript',
      'json',
      'jsonc',
      'lua',
      'makefile',
      'markdown',
      'powershell',
      'python',
      'sql',
      'text',
      'typescript',
      'xml',
      'yaml',
    ] as const
    const rendered = await renderMarkdown(
      languages.map((language) => `\`\`\`${language}\nexample\n\`\`\``).join('\n\n'),
    )
    for (const language of languages) {
      const highlightedLanguage = language === 'gitignore' ? 'text' : language
      expect(rendered.html).toContain(`class="language-${highlightedLanguage}"`)
    }
    expect(rendered.html.match(/class="shiki/g)).toHaveLength(languages.length)
  }, 20_000)

  it('converts only Markdown prose and protects frontmatter, code, URLs and identifiers', async () => {
    const rendered = await renderMarkdown(
      `---
title: 软件机器人
canonical: https://example.com/软件
---

# 软件机器人项目

访问 [项目链接](https://example.com/软件) 并保留 \`const_identifier\`。

\`\`\`ts
const_identifier = '软件机器人'
\`\`\``,
      'zh-tw',
    )

    expect(rendered.headings).toContainEqual({
      depth: 1,
      id: '軟體機器人專案',
      level: 0,
      number: '1',
      text: '軟體機器人專案',
    })
    expect(rendered.html).toContain('專案連結')
    expect(rendered.html).toContain('href="https://example.com/%E8%BD%AF%E4%BB%B6"')
    expect(rendered.html).not.toContain('%E8%BB%9F%E9%AB%94')
    expect(rendered.html).toContain('const_identifier')
    expect(rendered.html).toContain("'软件机器人'")
    expect(rendered.html).not.toContain('title: 軟體機器人')
  }, 20_000)

  it('numbers every available Markdown heading depth relative to the highest present level', async () => {
    const rendered = await renderMarkdown(`### Root

#### Child

###### Skipped level

### Second root`)

    expect(rendered.headings.map(({ depth, level, number }) => ({ depth, level, number }))).toEqual(
      [
        { depth: 3, level: 0, number: '1' },
        { depth: 4, level: 1, number: '1.1' },
        { depth: 6, level: 2, number: '1.1.1' },
        { depth: 3, level: 0, number: '2' },
      ],
    )
  })
})
