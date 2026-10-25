import { z } from 'zod'
import { musicSongSchema } from './contracts'

export const musicIdSchema = z.string().regex(/^tencent:[A-Za-z0-9_-]{1,100}$/)
export const maximumMusicBytes = 48 * 1024 * 1024
export const musicFileNameSchema = z
  .string()
  .min(1)
  .max(240)
  .regex(/^[^/\\]+\.mp3$/u)
  .refine((value) => [...value].every((char) => char.charCodeAt(0) >= 32))
export const libraryTrackSchema = musicSongSchema
  .extend({
    id: musicIdSchema,
    fileName: musicFileNameSchema.nullable(),
    bytes: z.number().int().nonnegative().nullable(),
    sha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .nullable(),
    duration: z.number().positive().max(7200).nullable(),
    upstreamUrl: z.url().or(z.literal('')),
    revision: z.number().int().nonnegative(),
    updatedAt: z.iso.datetime(),
  })
  .strict()
export type LibraryTrack = z.infer<typeof libraryTrackSchema>
export const musicCheckSchema = z
  .object({
    id: musicIdSchema,
    source: z.enum(['effective', 'meting']),
    status: z.enum(['reachable', 'failed', 'uncertain', 'preview']),
    reason: z.enum([
      'audio_response',
      'http_denied',
      'not_found',
      'not_audio',
      'network',
      'unsupported_url',
      'browser_decode',
      'short_duration',
      'browser_blocked',
    ]),
    checkedAt: z.iso.datetime(),
    urlHash: z.string().regex(/^[a-f0-9]{64}$/),
  })
  .strict()
export type MusicCheck = z.infer<typeof musicCheckSchema>
export const musicImportSchema = z
  .object({
    id: z.uuid(),
    trackId: musicIdSchema,
    title: z.string().trim().min(1).max(200),
    artist: z.string().trim().min(1).max(200),
    fileName: musicFileNameSchema,
    bytes: z.number().int().positive().max(maximumMusicBytes),
    sha256: z.string().regex(/^[a-f0-9]{64}$/),
    duration: z.number().positive().max(7200),
    expectedRevision: z.number().int().nonnegative(),
    status: z.enum(['pending', 'completed', 'conflict']),
    createdAt: z.iso.datetime(),
  })
  .strict()
export type MusicImport = z.infer<typeof musicImportSchema>
export const musicLibrarySchema = z.object({
  tracks: z.array(libraryTrackSchema).max(1000),
  checks: z.array(musicCheckSchema).max(2000),
  imports: z.array(musicImportSchema).max(100),
})

export function musicFileName(title: string, artist: string) {
  const clean = (value: string) =>
    value
      .normalize('NFC')
      .split('')
      .map((char) => (char.charCodeAt(0) < 32 ? '_' : char))
      .join('')
      .replace(/[<>:"/\\|?*]/gu, '_')
      .replace(/\s+/gu, ' ')
      .trim()
      .replace(/[. ]+$/u, '')
  return musicFileNameSchema.parse(
    `${clean(title)}-${clean(artist.replace(/\s*[/、]\s*/gu, '.'))}.mp3`,
  )
}

export function musicCsv(
  tracks: readonly LibraryTrack[],
  checks: readonly MusicCheck[] = [],
  source: MusicCheck['source'] = 'effective',
) {
  const cell = (value: unknown) =>
    `"${String(value ?? '')
      .replace(/^\s*[=+@-]/u, "'$&")
      .replaceAll('"', '""')}"`
  return (
    '\ufeff' +
    [
      [
        'id',
        'title',
        'artist',
        'fileName',
        'url',
        'selfHosted',
        'bytes',
        'duration',
        'checkSource',
        'checkStatus',
        'checkReason',
        'checkedAt',
      ],
      ...tracks.map((t) => {
        const check = checks.find((c) => c.id === t.id && c.source === source)
        return [
          t.id,
          t.title,
          t.artist,
          t.fileName,
          t.url,
          t.selfHosted,
          t.bytes,
          t.duration,
          source,
          check?.status,
          check?.reason,
          check?.checkedAt,
        ]
      }),
    ]
      .map((row) => row.map(cell).join(','))
      .join('\r\n')
  )
}
