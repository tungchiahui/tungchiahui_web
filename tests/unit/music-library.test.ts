import { createHash } from 'node:crypto'
import { once } from 'node:events'
import { readFileSync } from 'node:fs'
import { createServer } from 'node:http'
import { describe, expect, it, vi } from 'vitest'
import { createMusicHttpHandler } from '../../src/music/http'
import {
  libraryTrackSchema,
  musicCsv,
  musicFileName,
  musicImportSchema,
} from '../../src/music/library-contracts'
import {
  audioUrlAllowed,
  checkMusicTrack,
  publicIpv4,
  recognizableAudio,
} from '../../src/music/probe'
import { uploadMusicAudio, validMp3 } from '../../src/music/upload'
import { parseSiteCommand } from '../../tools/site-command'

const track = libraryTrackSchema.parse({
  id: 'tencent:example',
  title: '圆 (Time After Time)',
  artist: 'BoA / WENDY / NINGNING',
  cover: '',
  lyricSource: '',
  url: 'https://cdn.tungchiahui.cn/music/test.mp3',
  selfHosted: true,
  fileName: 'test.mp3',
  bytes: null,
  sha256: null,
  duration: 200,
  upstreamUrl: 'https://music.3e0.cn/?type=url&id=example',
  revision: 0,
  updatedAt: '2026-10-25T00:00:00.000Z',
})
const bytes = readFileSync('tests/fixtures/music/test-tone.mp3')
const task = musicImportSchema.parse({
  id: '11111111-1111-4111-8111-111111111111',
  trackId: track.id,
  title: track.title,
  artist: track.artist,
  fileName: musicFileName(track.title, track.artist),
  bytes: bytes.length,
  sha256: createHash('sha256').update(bytes).digest('hex'),
  duration: 1,
  expectedRevision: 0,
  status: 'pending',
  createdAt: '2026-10-25T00:00:00.000Z',
})

describe('music library boundaries', () => {
  it('preserves Unicode/version names and dot-separated artists without path traversal', () => {
    expect(task.fileName).toBe('圆 (Time After Time)-BoA.WENDY.NINGNING.mp3')
    expect(musicFileName('../歌名:测试', '歌手/另一个')).toBe('.._歌名_测试-歌手.另一个.mp3')
    expect(() => musicImportSchema.parse({ ...task, fileName: '../song.mp3' })).toThrow()
    expect(musicCsv([{ ...track, title: '=HYPERLINK("evil")' }])).toContain("'=HYPERLINK")
  })
  it('recognizes actual MP3 frames and rejects a renamed document or a bare ID3 tag', () => {
    expect(validMp3(bytes)).toBe(true)
    expect(validMp3(Buffer.from('<html>forbidden</html>'))).toBe(false)
    expect(validMp3(Buffer.from('ID3'))).toBe(false)
    expect(recognizableAudio(bytes)).toBe(true)
  })
  it('hashes and verifies uploads before publishing immutable CDN objects', async () => {
    const putObject = vi.fn(async () => ({ metadata: {} }))
    const storage = {
      putObject,
      headObject: vi.fn(async () => ({
        contentLength: bytes.length,
        contentType: 'audio/mpeg',
        metadata: {},
      })),
    }
    const url = await uploadMusicAudio(storage, new URL('https://cdn.tungchiahui.cn/'), task, bytes)
    expect(url.pathname).toContain(`/music/${task.sha256}/`)
    expect(decodeURIComponent(url.pathname)).toContain(task.fileName)
    expect(putObject).toHaveBeenCalledOnce()
    await expect(
      uploadMusicAudio(
        storage,
        new URL('https://cdn.tungchiahui.cn/'),
        { ...task, sha256: '0'.repeat(64) },
        bytes,
      ),
    ).rejects.toThrow('invalid_music_audio')
    expect(putObject).toHaveBeenCalledOnce()
    storage.headObject.mockResolvedValueOnce({
      contentLength: 1,
      contentType: 'audio/mpeg',
      metadata: {},
    })
    await expect(
      uploadMusicAudio(storage, new URL('https://cdn.tungchiahui.cn/'), task, bytes),
    ).rejects.toThrow('verification_failed')
  })
  it('checks the actual chosen source separately and bounds external audio hosts', async () => {
    const inspect = vi.fn(async () => ({
      status: 'uncertain' as const,
      reason: 'network' as const,
    }))
    await checkMusicTrack(track, 'meting', inspect)
    expect(inspect).toHaveBeenCalledWith(track.upstreamUrl)
    for (const value of [
      'http://cdn.tungchiahui.cn/a',
      'https://localhost/a',
      'https://music.3e0.cn.evil.com/a',
      'https://x:y@music.3e0.cn/a',
      'https://127.0.0.1/a',
    ])
      expect(audioUrlAllowed(value)).toBe(false)
    expect(audioUrlAllowed(track.url)).toBe(true)
    for (const value of [
      '127.0.0.1',
      '10.0.0.4',
      '169.254.169.254',
      '172.16.0.1',
      '192.168.1.1',
      '100.64.0.1',
      '::1',
    ])
      expect(publicIpv4(value)).toBe(false)
    expect(publicIpv4('8.8.8.8')).toBe(true)
  })
  it('parses both supported local tools and refuses ambiguous command flags', () => {
    expect(parseSiteCommand(['music', 'studio'])).toEqual({ kind: 'music-studio' })
    expect(parseSiteCommand(['music', 'prepare', '--input', 'in', '--output', 'out'])).toEqual({
      kind: 'music-prepare',
      inputDirectory: 'in',
      outputDirectory: 'out',
    })
    expect(() =>
      parseSiteCommand(['music', 'prepare', '--input', 'in', '--input', 'out']),
    ).toThrow()
  })
  it('denies visitors, ordinary accounts and cross-origin mutations; verifies owner uploads', async () => {
    let role: 'owner' | 'user' = 'owner'
    const repository = {
      tracks: vi.fn(async () => [track]),
      library: vi.fn(async () => ({ tracks: [track], checks: [], imports: [] })),
      sync: vi.fn(async () => {}),
      check: vi.fn(async () => {}),
      prepare: vi.fn(async () => task),
      import: vi.fn(async () => task),
      complete: vi.fn(async () => {}),
    }
    const handler = createMusicHttpHandler(
      { mode: 'test' },
      { current: async () => ({ id: 'owner', username: 'owner', role }) },
      repository,
      {
        putObject: async () => ({ metadata: {} }),
        headObject: async () => ({
          contentLength: bytes.length,
          contentType: 'audio/mpeg',
          metadata: {},
        }),
      },
      new URL('https://cdn.tungchiahui.cn'),
    )
    const server = createServer(async (req, res) => {
      const headers = new Headers()
      for (const [key, value] of Object.entries(req.headers))
        if (typeof value === 'string') headers.set(key, value)
      const result = await handler(req, headers)
      res
        .writeHead(result.status, { 'content-type': 'application/json' })
        .end(JSON.stringify(result.body))
    })
    server.listen(0, '127.0.0.1')
    await once(server, 'listening')
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('missing_address')
    const base = `http://127.0.0.1:${address.port}`
    const cookie = `site_session=${'a'.repeat(64)}`
    try {
      expect((await fetch(`${base}/api/ops/music/library`)).status).toBe(403)
      role = 'user'
      expect((await fetch(`${base}/api/ops/music/library`, { headers: { cookie } })).status).toBe(
        403,
      )
      role = 'owner'
      expect((await fetch(`${base}/api/ops/music/library`, { headers: { cookie } })).status).toBe(
        200,
      )
      expect(
        (
          await fetch(`${base}/api/ops/music/imports`, {
            method: 'POST',
            headers: { cookie, origin: 'https://evil.example', 'content-type': 'application/json' },
            body: JSON.stringify(task),
          })
        ).status,
      ).toBe(403)
      const result = await fetch(`${base}/api/ops/music/imports/${task.id}/audio`, {
        method: 'PUT',
        headers: { cookie, origin: base, 'content-type': 'audio/mpeg' },
        body: bytes,
      })
      expect(result.status).toBe(200)
      expect(repository.complete).toHaveBeenCalledOnce()
    } finally {
      server.closeAllConnections()
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
