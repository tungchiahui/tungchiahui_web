import { z } from 'zod'

export class FixedWindowRateLimiter {
  readonly #buckets = new Map<string, { count: number; windowStartedAt: number }>()
  readonly #limit: number
  readonly #windowMilliseconds: number

  constructor(limitInput: number, windowMillisecondsInput = 60_000) {
    this.#limit = z.number().int().positive().parse(limitInput)
    this.#windowMilliseconds = z.number().int().positive().parse(windowMillisecondsInput)
  }

  consume(keyInput: string, now = new Date()) {
    const key = z.string().min(1).max(500).parse(keyInput)
    const timestamp = now.getTime()
    const existing = this.#buckets.get(key)
    const bucket =
      !existing || timestamp - existing.windowStartedAt >= this.#windowMilliseconds
        ? { count: 0, windowStartedAt: timestamp }
        : existing
    bucket.count += 1
    this.#buckets.set(key, bucket)
    const retryAfterSeconds = Math.max(
      1,
      Math.ceil((bucket.windowStartedAt + this.#windowMilliseconds - timestamp) / 1_000),
    )
    return Object.freeze({
      allowed: bucket.count <= this.#limit,
      limit: this.#limit,
      remaining: Math.max(0, this.#limit - bucket.count),
      retryAfterSeconds,
    })
  }
}
