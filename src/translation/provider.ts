import { z } from 'zod'

import { targetedPatchContextSchema } from './segmentation'

const usdSchema = z.number().finite().nonnegative().max(1_000_000)

export const translationProviderRequestSchema = z
  .object({
    context: targetedPatchContextSchema.nullable(),
    maxOutputTokens: z.number().int().positive().max(100_000),
    requestId: z.uuid(),
    sourceLocale: z.literal('zh-cn'),
    sourceText: z.string().min(1).max(1_000_000),
    targetLocale: z.literal('en-us'),
  })
  .strict()

export const translationProviderEstimateSchema = z
  .object({
    estimatedInputTokens: z.number().int().nonnegative(),
    estimatedOutputTokens: z.number().int().nonnegative(),
    maximumCostUsd: usdSchema,
  })
  .strict()

export const translationProviderResponseSchema = z
  .object({
    model: z.string().trim().min(1).max(200),
    provider: z.string().trim().min(1).max(100),
    translatedText: z.string().min(1).max(1_000_000),
    usage: z
      .object({
        costUsd: usdSchema,
        inputTokens: z.number().int().nonnegative(),
        outputTokens: z.number().int().nonnegative(),
      })
      .strict(),
  })
  .strict()

export type TranslationProviderRequest = Readonly<z.infer<typeof translationProviderRequestSchema>>
export type TranslationProviderEstimate = Readonly<
  z.infer<typeof translationProviderEstimateSchema>
>
export type TranslationProviderResponse = Readonly<
  z.infer<typeof translationProviderResponseSchema>
>

export interface TranslationProvider {
  readonly kind: 'fake' | 'paid'
  estimate(request: TranslationProviderRequest): TranslationProviderEstimate
  getCallCount(): number
  translate(request: TranslationProviderRequest): Promise<TranslationProviderResponse>
}

export class TranslationProviderRequestError extends Error {
  override readonly name = 'TranslationProviderRequestError'
  readonly retryable: boolean

  constructor(message: string, retryable: boolean) {
    super(message)
    this.retryable = retryable
  }
}

export type PaidTranslationAdapter = Readonly<{
  estimate: (request: TranslationProviderRequest) => TranslationProviderEstimate
  translate: (request: TranslationProviderRequest) => Promise<unknown>
}>

export function createValidatedPaidTranslationProvider(
  adapter: PaidTranslationAdapter,
): TranslationProvider {
  let callCount = 0
  return Object.freeze({
    kind: 'paid' as const,
    estimate(input: TranslationProviderRequest) {
      const request = translationProviderRequestSchema.parse(input)
      return translationProviderEstimateSchema.parse(adapter.estimate(request))
    },
    getCallCount: () => callCount,
    async translate(input: TranslationProviderRequest) {
      const request = translationProviderRequestSchema.parse(input)
      callCount += 1
      return translationProviderResponseSchema.parse(await adapter.translate(request))
    },
  })
}

type FakeTranslationProviderOptions = Readonly<{
  costUsdPerRequest?: number
  failCalls?: readonly number[]
  model?: string
}>

export function createFakeTranslationProvider(
  options: FakeTranslationProviderOptions = {},
): TranslationProvider {
  let callCount = 0
  const costUsd = usdSchema.parse(options.costUsdPerRequest ?? 0)
  const failCalls = new Set(options.failCalls ?? [])
  const model = z
    .string()
    .trim()
    .min(1)
    .max(200)
    .parse(options.model ?? 'deterministic-v1')

  return Object.freeze({
    kind: 'fake' as const,
    estimate(input: TranslationProviderRequest) {
      const request = translationProviderRequestSchema.parse(input)
      const estimatedInputTokens = Buffer.byteLength(request.sourceText, 'utf8')
      return translationProviderEstimateSchema.parse({
        estimatedInputTokens,
        estimatedOutputTokens: Math.min(request.maxOutputTokens, estimatedInputTokens),
        maximumCostUsd: costUsd,
      })
    },
    getCallCount: () => callCount,
    async translate(input: TranslationProviderRequest) {
      const request = translationProviderRequestSchema.parse(input)
      callCount += 1
      if (failCalls.has(callCount)) {
        throw new TranslationProviderRequestError('Injected fake provider failure', true)
      }

      const inputTokens = Buffer.byteLength(request.sourceText, 'utf8')
      return Object.freeze(
        translationProviderResponseSchema.parse({
          model,
          provider: 'fake',
          translatedText: request.sourceText,
          usage: {
            costUsd,
            inputTokens,
            outputTokens: Math.min(request.maxOutputTokens, inputTokens),
          },
        }),
      )
    },
  })
}
