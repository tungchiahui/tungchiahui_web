import { describe, expect, it } from 'vitest'

import {
  createFakeTranslationProvider,
  createValidatedPaidTranslationProvider,
} from '../../src/translation/provider'

describe('fake translation provider', () => {
  it('is deterministic, explicit, and always zero-cost', async () => {
    const provider = createFakeTranslationProvider()
    const request = {
      context: null,
      maxOutputTokens: 100,
      requestId: '00000000-0000-4000-8000-000000000001',
      sourceLocale: 'zh-cn' as const,
      sourceText: '本地测试',
      targetLocale: 'en-us' as const,
    }

    expect(provider.estimate(request).maximumCostUsd).toBe(0)
    await expect(provider.translate(request)).resolves.toMatchObject({
      model: 'deterministic-v1',
      provider: 'fake',
      translatedText: '本地测试',
      usage: { costUsd: 0 },
    })
    await provider.translate(request)
    expect(provider.getCallCount()).toBe(2)
  })

  it('validates both sides of a paid adapter boundary', async () => {
    const provider = createValidatedPaidTranslationProvider({
      estimate: () => ({
        estimatedInputTokens: 10,
        estimatedOutputTokens: 10,
        maximumCostUsd: 0.01,
      }),
      translate: async () => ({ provider: 'unsafe-adapter' }),
    })
    const request = {
      context: null,
      maxOutputTokens: 100,
      requestId: '00000000-0000-4000-8000-000000000001',
      sourceLocale: 'zh-cn' as const,
      sourceText: '本地测试',
      targetLocale: 'en-us' as const,
    }

    expect(provider.estimate(request).maximumCostUsd).toBe(0.01)
    await expect(provider.translate(request)).rejects.toThrow()
  })
})
