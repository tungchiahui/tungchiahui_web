import { describe, expect, it } from 'vitest'

import { createFakeTranslationProvider } from '../../src/translation/provider'

describe('fake translation provider', () => {
  it('is deterministic, explicit, and always zero-cost', async () => {
    const provider = createFakeTranslationProvider()
    const request = {
      sourceLocale: 'zh-cn' as const,
      sourceText: '本地测试',
      targetLocale: 'en-us' as const,
    }

    await expect(provider.translate(request)).resolves.toEqual({
      costUsd: 0,
      provider: 'fake',
      translatedText: '[fake:en-us] 本地测试',
    })
    await expect(provider.translate(request)).resolves.toEqual({
      costUsd: 0,
      provider: 'fake',
      translatedText: '[fake:en-us] 本地测试',
    })
    expect(provider.getCallCount()).toBe(2)
  })
})
