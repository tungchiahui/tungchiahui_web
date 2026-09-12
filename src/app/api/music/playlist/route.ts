import { MUSIC_PLAYLIST_API } from '@/music/catalog'
import { musicPlaylistSchema, normalizeMusicPlaylist } from '@/music/contracts'
import { safeErrorAttributes } from '@/observability/telemetry'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const response = await fetch(MUSIC_PLAYLIST_API, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: AbortSignal.timeout(8_000),
    })
    if (!response.ok) throw new Error(`Playlist upstream returned ${response.status}`)
    const playlist = musicPlaylistSchema.parse(normalizeMusicPlaylist(await response.json()))
    return Response.json(playlist, {
      headers: { 'cache-control': 'public, max-age=300, stale-if-error=86400' },
    })
  } catch (error: unknown) {
    console.error(
      JSON.stringify({ event: 'music_playlist_read_failed', ...safeErrorAttributes(error) }),
    )
    return Response.json(
      { error: 'music_playlist_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: 503 },
    )
  }
}
