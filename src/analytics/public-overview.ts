import { z } from 'zod'

export const publicMetricRowSchema = z.object({
  bounces: z.coerce.number().nonnegative(),
  name: z
    .string()
    .nullable()
    .transform((value) => value ?? ''),
  pageviews: z.coerce.number().nonnegative(),
  totaltime: z.coerce.number().nonnegative(),
  visitors: z.coerce.number().nonnegative().default(0),
  visits: z.coerce.number().nonnegative(),
})

export const publicOverviewSchema = z
  .object({
    summary: z
      .object({
        averageVisitSeconds: z.number().finite().nonnegative(),
        bounces: z.number().int().nonnegative(),
        bounceRate: z.number().finite().min(0).max(1),
        pagesPerVisit: z.number().finite().nonnegative(),
        pageviews: z.number().int().nonnegative(),
        totalTime: z.number().finite().nonnegative(),
        visitors: z.number().int().nonnegative(),
        visits: z.number().int().nonnegative(),
      })
      .strict(),
    top: z.record(z.string(), z.array(publicMetricRowSchema).max(12)),
  })
  .strict()

export type PublicMetricRow = Readonly<z.infer<typeof publicMetricRowSchema>>
export type PublicOverview = Readonly<z.infer<typeof publicOverviewSchema>>
