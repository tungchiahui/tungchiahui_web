import { z } from 'zod'

export const bookmarkSchema = z
  .object({
    color: z.string().max(24).default('#308eda'),
    desc: z.string().max(160).default(''),
    id: z.string().min(1).max(100),
    name: z.string().min(1).max(80),
    url: z.url(),
  })
  .strict()
export const startSectionSchema = z
  .object({ items: z.array(bookmarkSchema).max(100), title: z.string().min(1).max(80) })
  .strict()
export const startHistorySchema = z
  .array(
    z.object({ engine: z.string(), text: z.string().min(1), timestamp: z.number().int() }).strict(),
  )
  .max(20)
export const startPayloadSchema = z
  .object({
    version: z.literal(1),
    sections: z.array(startSectionSchema).max(24),
    history: startHistorySchema,
    engine: z.enum(['baidu', 'google', 'bing']),
    background: z.number().int().nonnegative(),
    detailed: z.boolean(),
  })
  .strict()
export type StartPayload = z.infer<typeof startPayloadSchema>

export const startDataResponseSchema = z.object({
  authenticated: z.boolean(),
  account: z.object({ username: z.string(), role: z.enum(['owner', 'user']) }).nullable(),
  dataset: z.object({ payload: startPayloadSchema, revision: z.number().int().nonnegative() }),
})
