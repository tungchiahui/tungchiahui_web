import 'server-only'

import { unstable_cache } from 'next/cache'
import { z } from 'zod'
import { type PublicOverview, publicMetricRowSchema, publicOverviewSchema } from './public-overview'
import { publicTrafficQuerySchema, publicTrafficResponseSchema } from './public-traffic'
import { publicUmamiConfig } from './umami-config'

const legacyMeasurementStart = Date.parse('2024-01-01T00:00:00.000Z')

const shareResponseSchema = z.object({
  token: z.string().min(1),
  websiteId: z.literal(publicUmamiConfig.websiteId),
})

const statisticValueSchema = z.union([
  z.coerce.number().nonnegative(),
  z.object({ value: z.coerce.number().nonnegative() }).transform((value) => value.value),
])

const statsSchema = z.object({
  bounces: statisticValueSchema,
  pageviews: statisticValueSchema,
  totaltime: statisticValueSchema,
  visitors: statisticValueSchema,
  visits: statisticValueSchema,
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
    return z.array(publicMetricRowSchema).parse(await metricsResponse.json())
  },
  ['legacy-public-path-metrics'],
  { revalidate: 60 },
)

const overviewMetricTypes = [
  'path',
  'referrer',
  'channel',
  'country',
  'region',
  'city',
  'browser',
  'os',
  'device',
  'event',
] as const

const readOverview = unstable_cache(
  async (): Promise<PublicOverview> => {
    const shareResponse = await fetch(
      `${publicUmamiConfig.origin}/api/share/${publicUmamiConfig.shareId}`,
      { cache: 'no-store', signal: AbortSignal.timeout(5_000) },
    )
    if (!shareResponse.ok)
      throw new Error(`Public analytics share lookup failed: ${shareResponse.status}`)
    const share = shareResponseSchema.parse(await shareResponse.json())
    const range = { endAt: Date.now(), startAt: legacyMeasurementStart }
    const headers = { 'x-umami-share-token': share.token }
    const endpoint = (path: string, parameters: Readonly<Record<string, string>>) => {
      const url = new URL(
        `/api/websites/${encodeURIComponent(share.websiteId)}/${path}`,
        publicUmamiConfig.origin,
      )
      for (const [key, value] of Object.entries(parameters)) url.searchParams.set(key, value)
      return url
    }
    const [statsResponse, ...metricResponses] = await Promise.all([
      fetch(endpoint('stats', { endAt: String(range.endAt), startAt: String(range.startAt) }), {
        cache: 'no-store',
        headers,
        signal: AbortSignal.timeout(8_000),
      }),
      ...overviewMetricTypes.map((type) =>
        fetch(
          endpoint('metrics/expanded', {
            endAt: String(range.endAt),
            limit: '12',
            startAt: String(range.startAt),
            type,
          }),
          { cache: 'no-store', headers, signal: AbortSignal.timeout(8_000) },
        ),
      ),
    ])
    if (!statsResponse.ok || metricResponses.some((response) => !response.ok))
      throw new Error('Public analytics overview lookup failed')
    const stats = statsSchema.parse(await statsResponse.json())
    const topEntries = await Promise.all(
      metricResponses.map(async (response, index) => {
        const type = overviewMetricTypes[index]
        if (!type) throw new Error('Unexpected analytics metric response')
        return [
          type,
          z
            .array(publicMetricRowSchema)
            .max(5000)
            .parse(await response.json())
            .slice(0, 12),
        ] as const
      }),
    )
    const visits = Math.max(stats.visits, 1)
    return publicOverviewSchema.parse({
      summary: {
        averageVisitSeconds: stats.totaltime / visits,
        bounces: stats.bounces,
        bounceRate: Math.min(1, stats.bounces / visits),
        pagesPerVisit: stats.pageviews / visits,
        pageviews: stats.pageviews,
        totalTime: stats.totaltime,
        visitors: stats.visitors,
        visits: stats.visits,
      },
      top: Object.fromEntries(topEntries),
    })
  },
  ['legacy-public-overview'],
  { revalidate: 60 },
)

export function readPublicOverview() {
  return readOverview()
}

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
