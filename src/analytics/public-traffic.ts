import { z } from 'zod'

export const publicTrafficQuerySchema = z
  .array(
    z
      .string()
      .startsWith('/')
      .min(2)
      .max(500)
      .refine((value) => !value.includes('..') && !/[?#]/u.test(value)),
  )
  .min(1)
  .max(512)
  .transform((paths) => [...new Set(paths)].toSorted())

export const publicTrafficResponseSchema = z
  .object({
    averageVisitSeconds: z.number().finite().nonnegative(),
    bounceRate: z.number().finite().min(0).max(1),
    pageviews: z.number().int().nonnegative(),
    status: z.literal('available'),
    visits: z.number().int().nonnegative(),
  })
  .strict()

export type PublicTrafficResponse = Readonly<z.infer<typeof publicTrafficResponseSchema>>
