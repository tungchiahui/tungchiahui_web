import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { ControlApiConfiguration } from '../control-plane/configuration'
import { ownerRequestOriginAllowed } from '../control-plane/owner-http'
import { FixedWindowRateLimiter } from '../control-plane/rate-limit'
import type { ObjectStorage } from '../storage/contracts'
import {
  maximumMusicBytes,
  musicFileName,
  musicIdSchema,
  musicImportSchema,
} from './library-contracts'
import { type MusicLibraryRepository, MusicRevisionConflict } from './library-repository'
import { checkMusicTrack, musicSourceHash } from './probe'
import { uploadMusicAudio } from './upload'
import { fetchMusicPlaylist } from './upstream'

async function body(request: IncomingMessage, maximum: number) {
  const parts: Buffer[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    size += bytes.length
    if (size > maximum) throw new Error('music_payload_too_large')
    parts.push(bytes)
  }
  return Buffer.concat(parts)
}
export function createMusicHttpHandler(
  configuration: Pick<ControlApiConfiguration, 'mode'>,
  sessions: {
    current(token: string): Promise<{ id: string; role: 'owner' | 'user' } | undefined>
  } | null,
  repository: Pick<
    MusicLibraryRepository,
    'tracks' | 'library' | 'sync' | 'check' | 'prepare' | 'import' | 'complete'
  > | null,
  storage: Pick<ObjectStorage, 'putObject' | 'headObject'> | null,
  cdnBase: URL,
) {
  const limiter = new FixedWindowRateLimiter(240)
  let busy = false
  return async (request: IncomingMessage, headers: Headers) => {
    const path = new URL(request.url ?? '/', 'http://control-api').pathname
    const response = (status: number, data: unknown) => ({ status, body: data })
    // Authenticate before reading any audio body. The existing account cookie is HttpOnly.
    const tokens = (headers.get('cookie') ?? '')
      .split(';')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('site_session='))
    const token = tokens.length === 1 ? tokens[0]?.slice('site_session='.length) : undefined
    const account =
      token && /^[a-f0-9]{64}$/.test(token) ? await sessions?.current(token) : undefined
    if (account?.role !== 'owner') return response(403, { error: 'owner_required' })
    if (request.method !== 'GET' && !ownerRequestOriginAllowed(headers, configuration.mode))
      return response(403, { error: 'origin_denied' })
    const rate = limiter.consume(account.id)
    if (!rate.allowed)
      return {
        ...response(429, { error: 'rate_limit_exceeded' }),
        headers: { 'retry-after': String(rate.retryAfterSeconds) },
      }
    if (!repository) return response(503, { error: 'music_store_unavailable' })
    if (path === '/api/ops/music/library' && request.method === 'GET')
      return response(200, await repository.library())
    if (request.method !== 'POST' && request.method !== 'PUT')
      return response(405, { error: 'method_not_allowed' })
    if (busy)
      return { ...response(429, { error: 'music_task_busy' }), headers: { 'retry-after': '1' } }
    busy = true
    try {
      const upload = /^\/api\/ops\/music\/imports\/([a-f0-9-]{36})\/audio$/.exec(path)
      if (upload?.[1] && request.method === 'PUT') {
        if (!storage) return response(503, { error: 'music_upload_disabled' })
        if (headers.get('content-type') !== 'audio/mpeg')
          return response(415, { error: 'mp3_required' })
        const task = await repository.import(upload[1])
        if (!task) return response(404, { error: 'music_import_not_found' })
        if (task.status === 'completed') return response(200, { completed: true })
        if (task.status === 'conflict') return response(409, { error: 'music_revision_conflict' })
        const bytes = await body(request, maximumMusicBytes)
        const deliveryBase =
          configuration.mode === 'production'
            ? cdnBase
            : new URL('/api/assets/', headers.get('origin') ?? 'http://127.0.0.1:3000')
        const url = await uploadMusicAudio(storage, deliveryBase, task, bytes)
        await repository.complete(task, url.toString())
        return response(200, { completed: true })
      }
      if (!/^application\/json(?:;.*)?$/i.test(headers.get('content-type') ?? ''))
        return response(415, { error: 'application_json_required' })
      const input: unknown = JSON.parse((await body(request, 64 * 1024)).toString('utf8'))
      if (path === '/api/ops/music/sync' && request.method === 'POST') {
        z.object({}).strict().parse(input)
        await repository.sync(await fetchMusicPlaylist())
        return response(200, await repository.library())
      }
      if (path === '/api/ops/music/check' && request.method === 'POST') {
        const selected = z
          .object({ id: musicIdSchema, source: z.enum(['effective', 'meting']) })
          .strict()
          .parse(input)
        const track = (await repository.tracks()).find((t) => t.id === selected.id)
        if (!track) return response(404, { error: 'music_track_not_found' })
        const check = await checkMusicTrack(track, selected.source)
        await repository.check(check)
        return response(200, { check })
      }
      if (path === '/api/ops/music/check/browser' && request.method === 'POST') {
        const selected = z
          .object({
            id: musicIdSchema,
            source: z.enum(['effective', 'meting']),
            urlHash: z.string().regex(/^[a-f0-9]{64}$/),
            duration: z.number().positive().max(7200).nullable(),
          })
          .strict()
          .parse(input)
        const track = (await repository.tracks()).find((t) => t.id === selected.id)
        if (!track) return response(404, { error: 'music_track_not_found' })
        if (
          musicSourceHash(selected.source === 'effective' ? track.url : track.upstreamUrl) !==
          selected.urlHash
        )
          return response(409, { error: 'music_source_changed' })
        const short =
          selected.duration !== null &&
          (track.duration !== null
            ? selected.duration < track.duration - 10 && selected.duration < track.duration * 0.85
            : selected.duration <= 60)
        const check = {
          id: track.id,
          source: selected.source,
          urlHash: selected.urlHash,
          checkedAt: new Date().toISOString(),
          status:
            selected.duration === null
              ? ('uncertain' as const)
              : short
                ? ('preview' as const)
                : ('reachable' as const),
          reason:
            selected.duration === null
              ? ('browser_blocked' as const)
              : short
                ? ('short_duration' as const)
                : ('browser_decode' as const),
        }
        await repository.check(check)
        return response(200, { check })
      }
      if (path === '/api/ops/music/imports' && request.method === 'POST') {
        const task = musicImportSchema.parse(input)
        if (task.status !== 'pending' || task.fileName !== musicFileName(task.title, task.artist))
          return response(400, { error: 'invalid_import_status' })
        return response(201, { task: await repository.prepare(task) })
      }
      return response(404, { error: 'not_found' })
    } catch (error: unknown) {
      if (error instanceof MusicRevisionConflict)
        return response(409, { error: 'music_revision_conflict' })
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return response(400, { error: 'music_validation_failed' })
      if (error instanceof Error && error.message === 'music_payload_too_large')
        return response(413, { error: 'music_payload_too_large' })
      if (error instanceof Error && error.message === 'invalid_music_audio')
        return response(400, { error: 'invalid_music_audio' })
      throw error
    } finally {
      busy = false
    }
  }
}
