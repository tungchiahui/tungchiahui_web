import { getPublicContentRepository } from '@/server/public-content'

export const dynamic = 'force-dynamic'

export async function GET() {
  const ready = await getPublicContentRepository().isReady()
  return Response.json(
    {
      dependencies: { postgresql: ready ? 'ready' : 'unavailable' },
      status: ready ? 'ready' : 'not_ready',
    },
    { headers: { 'cache-control': 'no-store' }, status: ready ? 200 : 503 },
  )
}
