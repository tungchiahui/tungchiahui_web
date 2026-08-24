import { createHmac, timingSafeEqual } from 'node:crypto'

import { z } from 'zod'

import { affectedPublicPaths } from '../web/cache-policy'
import type { ContentHookInput, ContentIngestionHooks } from './hooks'

export const revalidationRequestSchema = z
  .object({
    changes: z.array(
      z
        .object({
          documentId: z.uuid(),
          previousRoutePath: z.string().startsWith('/').optional(),
          routePath: z.string().startsWith('/'),
          sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
          type: z.enum(['added', 'deleted', 'modified', 'moved']),
        })
        .strict(),
    ),
    sourceCommit: z.string().regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/),
  })
  .strict()

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

export class HttpZhCnRevalidationHook implements ContentIngestionHooks {
  readonly #endpoint: URL
  readonly #secret: string

  constructor(endpoint: string, secret: string) {
    this.#endpoint = new URL(z.url().parse(endpoint))
    this.#secret = z.string().min(32).parse(secret)
  }

  async diffTranslations() {}

  async refreshSearch() {}

  async revalidateZhCn(input: ContentHookInput) {
    if (input.changes.length === 0) return
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
      throw new Error(`zh-CN cache revalidation failed with HTTP ${response.status}: ${summary}`)
    }
  }
}

export class Phase6ContentHooks implements ContentIngestionHooks {
  readonly #revalidation: HttpZhCnRevalidationHook

  constructor(endpoint: string, secret: string) {
    this.#revalidation = new HttpZhCnRevalidationHook(endpoint, secret)
  }

  async diffTranslations(input: ContentHookInput) {
    this.#logDeferred('translation_diff_deferred', 8, input)
  }

  async refreshSearch(input: ContentHookInput) {
    this.#logDeferred('search_refresh_deferred', 10, input)
  }

  async revalidateZhCn(input: ContentHookInput) {
    await this.#revalidation.revalidateZhCn(input)
  }

  #logDeferred(event: string, replacementPhase: number, input: ContentHookInput) {
    console.log(
      JSON.stringify({
        changedDocuments: input.changes.length,
        event,
        replacementPhase,
        sourceCommit: input.sourceCommit,
      }),
    )
  }
}

export function pathsForRevalidation(input: unknown) {
  return affectedPublicPaths(revalidationRequestSchema.parse(input).changes)
}
