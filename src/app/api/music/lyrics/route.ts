import { z } from 'zod'
import { safeErrorAttributes } from '@/observability/telemetry'

export const dynamic = 'force-dynamic'

const querySchema = z.object({ source: z.url().max(2_000) }).strict()
const allowedHosts = new Set(['music.3e0.cn'])

export async function GET(request: Request) {
  const parsed = querySchema.safeParse(Object.fromEntries(new URL(request.url).searchParams))
  if (!parsed.success || !allowedHosts.has(new URL(parsed.data.source).hostname)) {
    return Response.json(
      { error: 'invalid_lyric_request' },
      { headers: { 'cache-control': 'no-store' }, status: 400 },
    )
  }
  try {
    const response = await fetch(parsed.data.source, {
      cache: 'no-store',
      headers: { accept: 'text/plain' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!response.ok) throw new Error(`Lyrics upstream returned ${response.status}`)
    const text = (await response.text()).slice(0, 200_000)
    return new Response(text, {
      headers: {
        'cache-control': 'public, max-age=86400, stale-if-error=604800',
        'content-type': 'text/plain; charset=utf-8',
      },
    })
  } catch (error: unknown) {
    console.error(
      JSON.stringify({ event: 'music_lyrics_read_failed', ...safeErrorAttributes(error) }),
    )
    return Response.json(
      { error: 'music_lyrics_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    )
  }
}
