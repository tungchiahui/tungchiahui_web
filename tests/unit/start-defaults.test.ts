import { describe, expect, it } from 'vitest'
import { locales } from '../../src/i18n/locales'
import { startPayloadSchema } from '../../src/start/contracts'
import { createDefaultStartPayload, defaultStartPayload } from '../../src/start/defaults'

describe('Start built-in copy and saved data boundary', () => {
  it('localizes built-in sections while preserving identities, links and settings', () => {
    for (const locale of locales) {
      const data = startPayloadSchema.parse(createDefaultStartPayload(locale))
      expect(
        data.sections.flatMap((section) =>
          section.items.map(({ id, url, color }) => ({ id, url, color })),
        ),
      ).toEqual(
        defaultStartPayload.sections.flatMap((section) =>
          section.items.map(({ id, url, color }) => ({ id, url, color })),
        ),
      )
      expect(data.engine).toBe(defaultStartPayload.engine)
      if (locale === 'en-us') expect(JSON.stringify(data)).not.toMatch(/[\p{Script=Han}]/u)
    }
  })
  it('validates saved author strings without translating or replacing them', () => {
    const data = structuredClone(defaultStartPayload)
    data.sections = [
      {
        title: '作者的中文分组',
        items: [
          {
            id: 'custom',
            name: '自定义名称',
            desc: '原始描述',
            url: 'https://example.test',
            color: '#308eda',
          },
        ],
      },
    ]
    expect(startPayloadSchema.parse(data)).toEqual(data)
  })
})
