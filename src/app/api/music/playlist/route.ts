import type { MusicSong } from '@/music/contracts'
import { musicPlaylistSchema } from '@/music/contracts'
import { fetchMusicPlaylist } from '@/music/upstream'
import { safeErrorAttributes } from '@/observability/telemetry'
import { publicMusicLibrary } from '@/server/music-library'

export const dynamic = 'force-dynamic'

export async function GET() {
  try {
    const stored = await publicMusicLibrary().tracks()
    let upstream: MusicSong[] = []
    try {
      upstream = await fetchMusicPlaylist()
    } catch {
      console.warn(JSON.stringify({ event: 'music_playlist_using_database_fallback' }))
    }
    const songs = new Map<string, MusicSong>()
    for (const track of stored)
      songs.set(track.id, {
        id: track.id,
        title: track.title,
        artist: track.artist,
        cover: track.cover,
        lyricSource: track.lyricSource,
        url: track.url,
        selfHosted: track.selfHosted,
      })
    const ordered = new Map<string, MusicSong>()
    for (const song of upstream) {
      const id = `tencent:${song.id}`
      const existing = songs.get(id)
      ordered.set(
        id,
        existing?.selfHosted
          ? {
              ...song,
              ...existing,
              cover: song.cover || existing.cover,
              lyricSource: song.lyricSource || existing.lyricSource,
            }
          : { ...song, id },
      )
    }
    for (const [id, song] of songs) if (!ordered.has(id)) ordered.set(id, song)
    const playlist = musicPlaylistSchema.parse([...ordered.values()])
    return Response.json(playlist, {
      headers: { 'cache-control': 'no-store' },
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
