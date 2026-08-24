import { describe, expect, it } from 'vitest'
import { defaultLocale, locales } from '@/i18n/locales'
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
})
