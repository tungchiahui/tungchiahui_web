import { z } from 'zod'
import { CDN_AUDIO_BY_ID, MUSIC_SERVER } from './catalog'

const optionalText = z.union([z.string(), z.number()]).optional()

export const upstreamMusicSongSchema = z
  .object({
    id: optionalText,
    mid: optionalText,
    songmid: optionalText,
    song_song_id: optionalText,
    songId: optionalText,
    name: optionalText,
    title: optionalText,
    songname: optionalText,
    artist: z.union([z.string(), z.number(), z.array(optionalText)]).optional(),
    author: optionalText,
    singer: optionalText,
    cover: optionalText,
    pic: optionalText,
    lrc: optionalText,
    url: optionalText,
  })
  .passthrough()

export const musicSongSchema = z
  .object({
    id: z.string().min(1).max(128),
    title: z.string().min(1).max(300),
    artist: z.string().max(300),
    cover: z.url().or(z.literal('')),
    lyricSource: z.string().max(20_000),
    url: z.url(),
    selfHosted: z.boolean(),
  })
  .strict()

export const musicPlaylistSchema = z.array(musicSongSchema).max(500)
export type MusicSong = z.infer<typeof musicSongSchema>

function text(value: unknown): string {
  if (Array.isArray(value)) return value.map(text).filter(Boolean).join(' / ')
  return typeof value === 'string' || typeof value === 'number' ? String(value).trim() : ''
}

export function extractSongId(song: z.infer<typeof upstreamMusicSongSchema>): string {
  const direct = song.id ?? song.mid ?? song.songmid ?? song.song_song_id ?? song.songId
  if (direct !== undefined) return String(direct)
  for (const source of [song.url, song.lrc]) {
    const value = text(source)
    if (!value) continue
    try {
      const id = new URL(value, 'https://music.3e0.cn').searchParams.get('id')
      if (id) return id
    } catch {
      // Ignore malformed optional upstream fields and continue validation below.
    }
  }
  return ''
}

export function normalizeMusicSong(
  input: z.infer<typeof upstreamMusicSongSchema>,
  index: number,
): MusicSong | null {
  const songId = extractSongId(input)
  const mapped = songId ? CDN_AUDIO_BY_ID[`${MUSIC_SERVER}:${songId}`] : undefined
  const upstreamUrl = text(input.url)
  const parsedUrl = z.url().safeParse(mapped ?? upstreamUrl)
  if (!parsedUrl.success) return null
  const rawCover = text(input.cover) || text(input.pic)
  const cover = z.url().safeParse(rawCover).success ? rawCover : ''
  const title =
    text(input.name) || text(input.title) || text(input.songname) || `Track ${index + 1}`
  return musicSongSchema.parse({
    id: songId || `playlist-${index}`,
    title,
    artist: text(input.artist) || text(input.author) || text(input.singer),
    cover,
    lyricSource: text(input.lrc),
    url: parsedUrl.data,
    selfHosted: Boolean(mapped),
  })
}

export function normalizeMusicPlaylist(input: unknown): MusicSong[] {
  const array = z.array(upstreamMusicSongSchema).max(500).parse(input)
  return array.flatMap((song, index) => {
    const normalized = normalizeMusicSong(song, index)
    return normalized ? [normalized] : []
  })
}
