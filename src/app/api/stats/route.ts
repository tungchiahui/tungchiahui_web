import { readPublicOverview } from '@/analytics/umami-public'
import { safeErrorAttributes } from '@/observability/telemetry'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    return Response.json(await readPublicOverview(), { headers: { 'cache-control': 'no-store' } })
  } catch (error: unknown) {
    console.error(
      JSON.stringify({ event: 'public_stats_read_failed', ...safeErrorAttributes(error) }),
    )
    return Response.json(
      { error: 'stats_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    )
  }
}
