import { z } from 'zod'

export function roadmapExchangeSchema<T>(payload: z.ZodType<T>) {
  return z
    .object({
      format: z.literal('tungchiahui-tech-roadmap'),
      schemaVersion: z.literal(3),
      exportedAt: z.iso.datetime({ offset: true }),
      payload,
    })
    .strict()
}

export function createRoadmapExchange<T>(payload: T, exportedAt = new Date().toISOString()) {
  return {
    format: 'tungchiahui-tech-roadmap' as const,
    schemaVersion: 3 as const,
    exportedAt,
    payload,
  }
}
