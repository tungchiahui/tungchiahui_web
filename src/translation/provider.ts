import { z } from 'zod'

const translationRequestSchema = z.object({
  sourceLocale: z.literal('zh-cn'),
  sourceText: z.string(),
  targetLocale: z.literal('en-us'),
})

export type TranslationRequest = z.infer<typeof translationRequestSchema>

export type TranslationResult = Readonly<{
  costUsd: 0
  provider: 'fake'
  translatedText: string
}>

export interface TranslationProvider {
  readonly kind: 'fake'
  getCallCount(): number
  translate(request: TranslationRequest): Promise<TranslationResult>
}

export function createFakeTranslationProvider(): TranslationProvider {
  let callCount = 0

  return Object.freeze({
    kind: 'fake' as const,
    getCallCount: () => callCount,
    async translate(input: TranslationRequest) {
      const request = translationRequestSchema.parse(input)
      callCount += 1

      return Object.freeze({
        costUsd: 0 as const,
        provider: 'fake' as const,
        translatedText: `[fake:${request.targetLocale}] ${request.sourceText}`,
      })
    },
  })
}
