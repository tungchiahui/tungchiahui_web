import 'server-only'

import { unstable_cache } from 'next/cache'
import { z } from 'zod'

import { publicTrafficQuerySchema, publicTrafficResponseSchema } from './public-traffic'
import { publicUmamiConfig } from './umami-config'

const legacyMeasurementStart = Date.parse('2024-01-01T00:00:00.000Z')

const shareResponseSchema = z.object({
  token: z.string().min(1),
  websiteId: z.literal(publicUmamiConfig.websiteId),
})

const metricSchema = z.object({
  bounces: z.coerce.number().nonnegative(),
  name: z.string(),
  pageviews: z.coerce.number().nonnegative(),
  totaltime: z.coerce.number().nonnegative(),
  visits: z.coerce.number().nonnegative(),
})

const readMetricRows = unstable_cache(
  async () => {
    const shareResponse = await fetch(
      `${publicUmamiConfig.origin}/api/share/${publicUmamiConfig.shareId}`,
      {
        cache: 'no-store',
        signal: AbortSignal.timeout(5_000),
      },
    )
    if (!shareResponse.ok)
      throw new Error(`Public analytics share lookup failed: ${shareResponse.status}`)
    const share = shareResponseSchema.parse(await shareResponse.json())
    const metricsUrl = new URL(
      `/api/websites/${encodeURIComponent(share.websiteId)}/metrics/expanded`,
      publicUmamiConfig.origin,
    )
    metricsUrl.searchParams.set('type', 'path')
    metricsUrl.searchParams.set('startAt', String(legacyMeasurementStart))
    metricsUrl.searchParams.set('endAt', String(Date.now()))
    metricsUrl.searchParams.set('limit', '5000')
    const metricsResponse = await fetch(metricsUrl, {
      cache: 'no-store',
      headers: { 'x-umami-share-token': share.token },
      signal: AbortSignal.timeout(8_000),
    })
    if (!metricsResponse.ok)
      throw new Error(`Public analytics metrics lookup failed: ${metricsResponse.status}`)
    return z.array(metricSchema).parse(await metricsResponse.json())
  },
  ['legacy-public-path-metrics'],
  { revalidate: 60 },
)

export async function readPublicTraffic(pathInputs: unknown) {
  const paths = publicTrafficQuerySchema.parse(pathInputs)
  const rows = await readMetricRows()
  const selected = rows.filter((row) => paths.includes(row.name))
  const pageviews = Math.round(selected.reduce((total, row) => total + row.pageviews, 0))
  const visits = Math.round(selected.reduce((total, row) => total + row.visits, 0))
  const bounces = selected.reduce((total, row) => total + row.bounces, 0)
  const totalTime = selected.reduce((total, row) => total + row.totaltime, 0)
  return publicTrafficResponseSchema.parse({
    averageVisitSeconds: visits > 0 ? totalTime / visits : 0,
    bounceRate: visits > 0 ? Math.min(1, bounces / visits) : 0,
    pageviews,
    status: 'available',
    visits,
  })
}
