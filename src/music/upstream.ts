import { MUSIC_PLAYLIST_API } from './catalog'
import { normalizeMusicPlaylist } from './contracts'

export async function fetchMusicPlaylist() {
  const response = await fetch(MUSIC_PLAYLIST_API, {
    cache: 'no-store',
    headers: { accept: 'application/json' },
    redirect: 'error',
    signal: AbortSignal.timeout(8000),
  })
  if (!response.ok || !response.body) throw new Error('music_upstream_unavailable')
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const result = await reader.read()
      if (result.done) break
      size += result.value.length
      if (size > 1024 * 1024) throw new Error('music_upstream_too_large')
      chunks.push(result.value)
    }
  } finally {
    await reader.cancel()
  }
  return normalizeMusicPlaylist(JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown)
}
