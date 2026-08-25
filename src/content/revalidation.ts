import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { affectedPublicPaths } from '../web/cache-policy'
import { type ContentHookInput, type ContentIngestionHooks, contentHookInputSchema } from './hooks'

export const revalidationRequestSchema = contentHookInputSchema

export function signRevalidationPayload(body: string, secret: string) {
  return createHmac('sha256', z.string().min(32).parse(secret)).update(body).digest('hex')
}

export function verifyRevalidationSignature(body: string, secret: string, signature: unknown) {
  const received = z
    .string()
    .regex(/^[a-f0-9]{64}$/)
    .safeParse(signature)
  if (!received.success) return false
  const expected = Buffer.from(signRevalidationPayload(body, secret), 'hex')
  const actual = Buffer.from(received.data, 'hex')
  return expected.length === actual.length && timingSafeEqual(expected, actual)
}

export class HttpPublicContentRevalidationHook implements ContentIngestionHooks {
  readonly #endpoint: URL
  readonly #secret: string

  constructor(endpoint: string, secret: string) {
    this.#endpoint = new URL(z.url().parse(endpoint))
    this.#secret = z.string().min(32).parse(secret)
  }

  async diffTranslations() {}

  async refreshSearch() {}

  async revalidatePublicContent(input: ContentHookInput) {
    if (input.changes.length === 0 && input.searchLocales === undefined) return
    const payload = revalidationRequestSchema.parse(input)
    const body = JSON.stringify(payload)
    const response = await fetch(this.#endpoint, {
      body,
      headers: {
        'content-type': 'application/json',
        'x-site-revalidation-signature': signRevalidationPayload(body, this.#secret),
      },
      method: 'POST',
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok) {
      const summary = (await response.text()).slice(0, 500)
      throw new Error(
        `public locale cache revalidation failed with HTTP ${response.status}: ${summary}`,
      )
    }
  }
}

export class PublicContentHooks implements ContentIngestionHooks {
  readonly #revalidation: HttpPublicContentRevalidationHook

  constructor(endpoint: string, secret: string) {
    this.#revalidation = new HttpPublicContentRevalidationHook(endpoint, secret)
  }

  async diffTranslations(input: ContentHookInput) {
    console.log(
      JSON.stringify({
        changedDocuments: input.changes.length,
        event: 'translation_memory_materialized',
        fallbackSegments: input.translation.fallbackSegments,
        memoryHits: input.translation.memoryHits,
        pendingSegments: input.translation.pendingSegments,
        providerCalls: 0,
        sourceCommit: input.sourceCommit,
        translatedSegments: input.translation.translatedSegments,
      }),
    )
  }

  async refreshSearch(input: ContentHookInput) {
    void input
  }

  async revalidatePublicContent(input: ContentHookInput) {
    await this.#revalidation.revalidatePublicContent(input)
  }
}

export function pathsForRevalidation(input: unknown) {
  return affectedPublicPaths(revalidationRequestSchema.parse(input).changes)
}
