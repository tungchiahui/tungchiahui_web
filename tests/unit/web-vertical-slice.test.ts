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
  it('defines an exact route cache owner and invalidates canonical, prefixed and list paths', () => {
    expect(publicContentCachePolicy).toEqual({
      invalidation: 'exact-path-and-shared-index-tags',
      key: 'content type, canonical route path, source hash',
      owner: 'Next.js web application',
      ttl: null,
    })
    expect(affectedPublicPaths([change])).toEqual([
      '/',
      '/wiki',
      '/wiki/new-route',
      '/wiki/old-route',
      '/zh-cn',
      '/zh-cn/wiki',
      '/zh-cn/wiki/new-route',
      '/zh-cn/wiki/old-route',
    ])
  })

  it('signs and validates the internal revalidation trust boundary', () => {
    const body = JSON.stringify({ changes: [change], sourceCommit: 'b'.repeat(40) })
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

Use \`ROS2_Control\` and [external](https://example.com/path).

## Code

\`\`\`ts
const identifier = '保持'
\`\`\`

![fixture](/api/assets/fixtures/phase-6.svg)

<script>alert('unsafe')</script>`)

    expect(rendered.headings).toEqual([
      { depth: 1, id: '中文标题', text: '中文标题' },
      { depth: 2, id: 'code', text: 'Code' },
    ])
    expect(rendered.html).toContain('ROS2_Control')
    expect(rendered.html).toContain('shiki')
    expect(rendered.html).toContain('rel="noopener noreferrer"')
    expect(rendered.html).toContain('data-asset-origin="local"')
    expect(rendered.html).not.toContain('<script')
  }, 20_000)
})
