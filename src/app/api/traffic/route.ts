import { publicTrafficQuerySchema } from '@/analytics/public-traffic'
import { readPublicTraffic } from '@/analytics/umami-public'
import { safeErrorAttributes } from '@/observability/telemetry'

export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const body = await request.json().catch(() => undefined)
  const paths = publicTrafficQuerySchema.safeParse(
    typeof body === 'object' && body !== null && 'paths' in body ? body.paths : undefined,
  )
  if (!paths.success) {
    return Response.json(
      { error: 'invalid_traffic_request' },
      { headers: { 'cache-control': 'no-store' }, status: 400 },
    )
  }
  try {
    return Response.json(await readPublicTraffic(paths.data), {
      headers: { 'cache-control': 'no-store' },
    })
  } catch (error: unknown) {
    console.error(
      JSON.stringify({ event: 'public_traffic_read_failed', ...safeErrorAttributes(error) }),
    )
    return Response.json(
      { error: 'traffic_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    )
  }
}
