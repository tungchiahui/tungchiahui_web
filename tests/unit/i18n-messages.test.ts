import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

import { contentLocaleState, localizeContentText } from '@/i18n/content'
import { contentGlossary } from '@/i18n/content-glossary'
import { localizeContentMarkdown } from '@/i18n/content-markdown'
import { defaultLocale, localeFromPathname, locales } from '@/i18n/locales'
import { localeSwitchPath, parsePublicRoute } from '@/web/routes'
import enUs from '../../messages/en-us.json'
import zhCn from '../../messages/zh-cn.json'
import zhHk from '../../messages/zh-hk.json'
import zhTw from '../../messages/zh-tw.json'

function flattenKeys(value: Readonly<Record<string, unknown>>, prefix = ''): readonly string[] {
  return Object.entries(value).flatMap(([key, child]) => {
    const path = prefix ? `${prefix}.${key}` : key
    if (typeof child === 'object' && child !== null && !Array.isArray(child)) {
      return flattenKeys(child as Readonly<Record<string, unknown>>, path)
    }
    return [path]
  })
}

describe('UI message baseline', () => {
  it('declares exactly the four approved locales', () => {
    expect(locales).toEqual(['zh-cn', 'zh-hk', 'zh-tw', 'en-us'])
    expect(defaultLocale).toBe('zh-cn')
  })

  it('keeps every locale message shape aligned with zh-CN', () => {
    const expectedKeys = flattenKeys(zhCn).toSorted()

    expect(flattenKeys(zhHk).toSorted()).toEqual(expectedKeys)
    expect(flattenKeys(zhTw).toSorted()).toEqual(expectedKeys)
    expect(flattenKeys(enUs).toSorted()).toEqual(expectedKeys)
  })

  it('keeps legal registration identities byte-exact in every catalog', () => {
    for (const catalog of [zhCn, zhHk, zhTw, enUs]) {
      expect(catalog.Web.icp).toBe('鲁ICP备2025185601号-2')
      expect(catalog.Web.publicSecurity).toBe('鲁公网安备37030302001121号')
    }
  })

  it('routes only the approved locale prefixes and preserves logical paths when switching', () => {
    expect(localeFromPathname('/zh-hk/wiki/docker-tutorial')).toBe('zh-hk')
    expect(localeFromPathname('/zh-hant/wiki/docker-tutorial')).toBe('zh-cn')
    expect(parsePublicRoute(['en-us', 'blog', 'newtodolist'])).toEqual({
      context: { locale: 'en-us', prefixed: true },
      segments: ['blog', 'newtodolist'],
    })
    expect(parsePublicRoute(['zh-hant', 'blog'])).toEqual({
      context: { locale: 'zh-cn', prefixed: false },
      segments: ['zh-hant', 'blog'],
    })
    expect(localeSwitchPath('/wiki/docker-tutorial', 'zh-tw')).toBe('/zh-tw/wiki/docker-tutorial')
  })

  it('converts regional content deterministically through the versioned glossary', () => {
    const source = '博客的软件机器人项目包含源代码，使用 OpenCC 和 PostgreSQL。'
    expect(contentGlossary.version).toMatch(/^\d{4}-\d{2}-\d{2}\.\d+$/)
    expect(contentGlossary.revision).toBe(1)
    expect(localizeContentText(source, 'zh-hk')).toBe(
      '網誌的軟件機械人項目包含原始碼，使用 OpenCC 和 PostgreSQL。',
    )
    expect(localizeContentText(source, 'zh-tw')).toBe(
      '部落格的軟體機器人專案包含原始碼，使用 OpenCC 和 PostgreSQL。',
    )
    expect(localizeContentText(source, 'zh-tw')).toBe(localizeContentText(source, 'zh-tw'))
    expect(contentLocaleState('zh-cn')).toBe('source')
    expect(contentLocaleState('zh-hk')).toBe('converted')
    expect(contentLocaleState('en-us')).toBe('fallback')
  })

  it('materializes only Markdown prose and replays byte-identically', () => {
    const source = `---
title: 软件机器人项目
canonical: https://example.com/软件
---

# 软件机器人项目

访问 [项目链接](https://example.com/软件) 并保留 \`const_identifier\`。

\`\`\`ts
const_identifier = '软件机器人项目'
\`\`\``
    const materialized = localizeContentMarkdown(source, 'zh-tw')

    expect(materialized).toContain('title: 软件机器人项目')
    expect(materialized).toContain('# 軟體機器人專案')
    expect(materialized).toContain('[專案連結](https://example.com/软件)')
    expect(materialized).toContain("const_identifier = '软件机器人项目'")
    expect(localizeContentMarkdown(source, 'zh-tw')).toBe(materialized)
  })

  it('keeps reusable UI copy in catalogs rather than Chinese literals in TSX', () => {
    for (const file of ['src/components/site-shell.tsx', 'src/web/public-page.tsx']) {
      const source = readFileSync(resolve(process.cwd(), file), 'utf8')
      expect(source, file).not.toMatch(/[\p{Script=Han}]/u)
    }
  })
})
