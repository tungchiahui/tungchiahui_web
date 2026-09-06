import { describe, expect, it } from 'vitest'

import { searchRequestSchema, searchResponseSchema } from '../../src/search/contracts'
import {
  extractSearchableMarkdown,
  materializeSearchProjection,
} from '../../src/search/materialization'
import { createSearchSnippet } from '../../src/search/repository'
import { publicSearchCachePolicy, searchLocaleCacheTag } from '../../src/web/cache-policy'

const source = {
  contentType: 'wiki' as const,
  id: '10000000-0000-4000-8000-000000000001',
  rawFrontmatter: { description: '机器人开发笔记' },
  rawMarkdown:
    '---\ntitle: ROS2 教程\n---\n\n# ROS2 与 C++\n\n正文包含 `ROS2_Control` 和 [文档](https://example.com/private-path)。\n\n```cpp\nint main() {}\n```',
  routePath: '/wiki/ros2',
  sourceHash: 'a'.repeat(64),
  sourcePath: 'content/wiki/ROS2/index.md',
  sourceUpdatedAt: new Date('2026-08-25T00:00:00.000Z'),
  title: 'ROS2 教程',
  translations: {
    'en-us': { markdown: '# ROS2 and C++\n\nRobotics body.', sourceHash: 'a'.repeat(64) },
    'zh-hk': { markdown: '# ROS2 與 C++\n\n機械人正文。', sourceHash: null },
  },
}

describe('PGroonga search contracts and materialization', () => {
  it('extracts headings, body identifiers, code, and link text without indexing destinations', () => {
    const searchable = extractSearchableMarkdown(source.rawMarkdown)
    expect(searchable.headings).toBe('ROS2 与 C++')
    expect(searchable.body).toContain('ROS2_Control')
    expect(searchable.body).toContain('int main() {}')
    expect(searchable.body).not.toContain('private-path')
  })

  it('uses current English materialization and deterministic regional content', () => {
    const english = materializeSearchProjection(source, 'en-us')
    const hongKong = materializeSearchProjection(source, 'zh-hk')
    const taiwan = materializeSearchProjection(source, 'zh-tw')
    expect(english.headings).toBe('ROS2 and C++')
    expect(english.body).toBe('Robotics body.')
    expect(hongKong.headings).toBe('ROS2 與 C++')
    expect(taiwan.headings).toContain('ROS2 與 C++')
    expect(english.projectionHash).toMatch(/^[a-f0-9]{64}$/)
  })

  it('rejects stale English as current and falls back to the latest canonical source', () => {
    const stale = {
      ...source,
      translations: {
        ...source.translations,
        'en-us': { markdown: '# Stale English', sourceHash: 'b'.repeat(64) },
      },
    }
    expect(materializeSearchProjection(stale, 'en-us').headings).toBe('ROS2 与 C++')
  })

  it('normalizes bounded requests and exposes a strict public result contract', () => {
    expect(
      searchRequestSchema.parse({ limit: 10, locale: 'zh-cn', query: '  ROS2   Control ' }),
    ).toEqual({ limit: 10, locale: 'zh-cn', query: 'ROS2 Control' })
    expect(() => searchRequestSchema.parse({ locale: 'zh-hant', query: 'ROS2' })).toThrow()
    expect(() =>
      searchResponseSchema.parse({
        locale: 'zh-cn',
        query: 'ROS2',
        results: [{ body: 'must not leak' }],
      }),
    ).toThrow()
  })

  it('creates a bounded plain-text snippet and a no-TTL locale cache contract', () => {
    const snippet = createSearchSnippet(
      `${'前文'.repeat(100)}ROS2_Control${'后文'.repeat(100)}`,
      'ROS2_Control',
    )
    expect(snippet).toContain('ROS2_Control')
    expect(snippet.startsWith('…')).toBe(true)
    expect(searchLocaleCacheTag('en-us')).toBe('search:locale:en-us')
    expect(publicSearchCachePolicy.ttl).toBeNull()
    expect(publicSearchCachePolicy.edgeAndOpenResty).toBe('no-store')
  })
})
