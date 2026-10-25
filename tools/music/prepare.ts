import { execFile } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { basename, extname, resolve } from 'node:path'
import { promisify } from 'node:util'
import { z } from 'zod'
import { maximumMusicBytes, musicFileName } from '../../src/music/library-contracts'

const execute = promisify(execFile)
const audioInfo = z.object({
  format: z.object({
    duration: z.coerce.number().positive().max(7200),
    tags: z.record(z.string(), z.string()).optional(),
  }),
  streams: z.array(z.object({ codec_type: z.string(), codec_name: z.string().optional() })),
})
export async function inspectLocalAudio(path: string) {
  const { stdout } = await execute(
    'ffprobe',
    [
      '-v',
      'error',
      '-protocol_whitelist',
      'file',
      '-show_format',
      '-show_streams',
      '-of',
      'json',
      path,
    ],
    { timeout: 20_000, maxBuffer: 1024 * 1024 },
  )
  const info = audioInfo.parse(JSON.parse(stdout) as unknown)
  if (!info.streams.some((s) => s.codec_type === 'audio')) throw new Error('audio_stream_missing')
  return info
}
export async function prepareMusic(inputDirectory: string, outputDirectory: string) {
  const input = resolve(inputDirectory),
    output = resolve(outputDirectory)
  if (input === output) throw new Error('Input and output directories must be different')
  await mkdir(output, { recursive: true })
  const results: Array<{
    input: string
    output?: string
    status: 'prepared' | 'skipped' | 'failed'
    reason?: string
  }> = []
  for (const entry of await readdir(input, { withFileTypes: true })) {
    if (!entry.isFile()) continue
    const extension = extname(entry.name).toLowerCase()
    if (
      ![
        '.mp3',
        '.flac',
        '.wav',
        '.ogg',
        '.opus',
        '.m4a',
        '.aac',
        '.aiff',
        '.aif',
        '.ape',
        '.wma',
      ].includes(extension)
    ) {
      results.push({
        input: entry.name,
        status: 'skipped',
        reason: 'unsupported_or_encrypted_format',
      })
      continue
    }
    const source = resolve(input, entry.name)
    const temporary = resolve(output, `.music-${randomUUID()}.mp3`)
    try {
      if ((await stat(source)).size > 256 * 1024 * 1024) throw new Error('input_too_large')
      const info = await inspectLocalAudio(source)
      const tags = info.format.tags ?? {}
      const name = basename(entry.name, extname(entry.name))
      const separator = name.lastIndexOf('-')
      const title = tags.title ?? tags.TITLE ?? (separator > 0 ? name.slice(0, separator) : '')
      const artist = tags.artist ?? tags.ARTIST ?? (separator > 0 ? name.slice(separator + 1) : '')
      if (!title.trim() || !artist.trim()) throw new Error('title_and_artist_required')
      const fileName = musicFileName(title, artist)
      const destination = resolve(output, fileName)
      const codec = info.streams.find((s) => s.codec_type === 'audio')?.codec_name
      if (codec === 'mp3') await writeFile(temporary, await readFile(source), { flag: 'wx' })
      else
        await execute(
          'ffmpeg',
          [
            '-nostdin',
            '-v',
            'error',
            '-protocol_whitelist',
            'file',
            '-i',
            source,
            '-map',
            '0:a:0',
            '-vn',
            '-c:a',
            'libmp3lame',
            '-q:a',
            '2',
            '-metadata',
            `title=${title}`,
            '-metadata',
            `artist=${artist}`,
            temporary,
          ],
          { timeout: 180_000, maxBuffer: 1024 * 1024 },
        )
      const prepared = await inspectLocalAudio(temporary)
      if (Math.abs(prepared.format.duration - info.format.duration) > 2)
        throw new Error('duration_changed')
      const bytes = await readFile(temporary)
      if (bytes.length > maximumMusicBytes) throw new Error('output_too_large')
      try {
        const existing = await readFile(destination)
        if (
          createHash('sha256').update(existing).digest('hex') !==
          createHash('sha256').update(bytes).digest('hex')
        )
          throw new Error('filename_conflict')
        results.push({
          input: entry.name,
          output: fileName,
          status: 'skipped',
          reason: 'already_prepared',
        })
      } catch (error: unknown) {
        if (!(error instanceof Error && 'code' in error && error.code === 'ENOENT')) throw error
        await writeFile(destination, bytes, { flag: 'wx' })
        results.push({ input: entry.name, output: fileName, status: 'prepared' })
      }
    } catch (error: unknown) {
      const known = [
        'input_too_large',
        'title_and_artist_required',
        'duration_changed',
        'output_too_large',
        'filename_conflict',
      ]
      results.push({
        input: entry.name,
        status: 'failed',
        reason:
          error instanceof Error && known.includes(error.message)
            ? error.message
            : 'decode_or_conversion_failed',
      })
    } finally {
      await rm(temporary, { force: true })
    }
  }
  await writeFile(
    resolve(output, `music-preparation-${randomUUID()}.json`),
    JSON.stringify({ createdAt: new Date().toISOString(), results }, null, 2),
    { flag: 'wx' },
  )
  return { results, output }
}
