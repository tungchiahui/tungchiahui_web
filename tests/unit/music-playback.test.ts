import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { browserAudioPlayback } from '../../src/music/browser-probe'
import { libraryTrackSchema, type MusicCheck } from '../../src/music/library-contracts'
import {
  filterMusicTracks,
  isMetingAudioUrl,
  isMetingServiceFailure,
  playbackPositions,
  playbackVerdict,
} from '../../src/music/playback-check'
import { musicSourceHash } from '../../src/music/probe'

const track = libraryTrackSchema.parse({
  id: 'tencent:sample',
  title: 'Sample',
  artist: 'Artist',
  cover: '',
  lyricSource: '',
  url: 'https://cdn.tungchiahui.cn/sample.mp3',
  upstreamUrl: 'https://music.3e0.cn/sample',
  selfHosted: true,
  fileName: 'Sample-Artist.mp3',
  bytes: null,
  sha256: null,
  duration: 200,
  revision: 0,
  updatedAt: '2026-10-26T00:00:00.000Z',
})
afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

describe('playback verdicts', () => {
  it('keeps resolver failures uncertain and identifies repeated provider failures separately from songs', () => {
    const endpoint = 'https://music.3e0.cn/?type=url&id=example'
    const evidence = { outcome: 'decode' as const, duration: null, samples: [] }
    expect(playbackVerdict(track, evidence, endpoint)).toEqual({
      status: 'uncertain',
      reason: 'not_audio',
    })
    expect(playbackVerdict(track, evidence, track.url)).toEqual({
      status: 'failed',
      reason: 'not_audio',
    })
    expect(
      isMetingServiceFailure(
        endpoint,
        { reason: 'not_audio' },
        { status: 'uncertain', reason: 'not_audio' },
      ),
    ).toBe(true)
    expect(
      isMetingServiceFailure(
        endpoint,
        { reason: 'not_audio' },
        { status: 'reachable', reason: 'browser_decode' },
      ),
    ).toBe(false)
    expect(
      isMetingServiceFailure(
        track.url,
        { reason: 'not_audio' },
        { status: 'failed', reason: 'not_audio' },
      ),
    ).toBe(false)
    expect(isMetingAudioUrl('https://music.3e0.cn.evil.example/?type=url')).toBe(false)
    expect(isMetingAudioUrl('https://cdn.tungchiahui.cn/a.mp3')).toBe(false)
  })

  it('requires actual samples at all three positions, not metadata or the start alone', () => {
    for (const samples of [[], [0], [0, 100], [0, 0, 0]]) {
      expect(playbackVerdict(track, { outcome: 'played', duration: 200, samples }).status).toBe(
        'uncertain',
      )
    }
    expect(
      playbackVerdict(track, { outcome: 'played', duration: 200, samples: playbackPositions(200) })
        .status,
    ).toBe('reachable')
    expect(playbackVerdict(track, { outcome: 'timeout', duration: 200, samples: [0] }).status).toBe(
      'uncertain',
    )
    expect(playbackVerdict(track, { outcome: 'decode', duration: 200, samples: [] }).status).toBe(
      'failed',
    )
    expect(playbackVerdict(track, { outcome: 'blocked', duration: 200, samples: [] }).status).toBe(
      'uncertain',
    )
  })
  it('flags previews without declaring every short original broken', () => {
    expect(
      playbackVerdict(track, { outcome: 'played', duration: 90, samples: playbackPositions(90) })
        .status,
    ).toBe('preview')
    expect(
      playbackVerdict(
        { duration: null },
        { outcome: 'played', duration: 30, samples: playbackPositions(30) },
      ).status,
    ).toBe('preview')
    expect(
      playbackVerdict(
        { duration: 30 },
        { outcome: 'played', duration: 30, samples: playbackPositions(30) },
      ).status,
    ).toBe('reachable')
    expect(playbackVerdict(track, { outcome: 'network', duration: null, samples: [] }).status).toBe(
      'uncertain',
    )
  })
  it('filters the selected source and invalidates the old metadata-only policy hash', () => {
    const check: MusicCheck = {
      id: track.id,
      source: 'meting',
      status: 'preview',
      reason: 'short_duration',
      urlHash: musicSourceHash(track.upstreamUrl),
      checkedAt: track.updatedAt,
    }
    expect(filterMusicTracks([track], [check], 'meting', 'missing', '').length).toBe(1)
    expect(filterMusicTracks([track], [check], 'effective', 'missing', '').length).toBe(0)
    expect(filterMusicTracks([track], [check], 'effective', 'recheck', track.id).length).toBe(1)
    expect(musicSourceHash(track.url)).not.toBe(
      createHash('sha256').update(track.url).digest('hex'),
    )
  })
})

class FakeAudio extends EventTarget {
  duration = 200
  readyState = 4
  currentTime = 0
  seeking = false
  muted = false
  volume = 1
  preload = ''
  src = ''
  paused = true
  error: { code: number } | null = null
  timer: ReturnType<typeof setInterval> | undefined
  advance = true
  block = false
  tailFails = false
  play() {
    if (this.block) return Promise.reject(new DOMException('blocked', 'NotAllowedError'))
    this.paused = false
    this.timer = setInterval(() => {
      if (this.advance && !(this.tailFails && this.currentTime >= 199)) this.currentTime += 0.1
    }, 60)
    return Promise.resolve()
  }
  pause() {
    this.paused = true
    clearInterval(this.timer)
  }
  load() {}
  removeAttribute() {
    this.src = ''
  }
}
function fakeAudio() {
  const audio = new FakeAudio()
  vi.useFakeTimers()
  vi.stubGlobal('Audio', new Proxy(FakeAudio, { construct: () => audio }))

  return audio
}
describe('browser playback rather than canplay', () => {
  it('does not load the document as audio when the upstream URL is missing', async () => {
    const audioFactory = vi.fn()
    vi.stubGlobal('Audio', audioFactory)
    expect(await browserAudioPlayback('')).toEqual({
      outcome: 'network',
      duration: null,
      samples: [],
    })
    expect(audioFactory).not.toHaveBeenCalled()
  })

  it.each([200, 1])(
    'plays muted samples of a %s-second track and releases the media resource',
    async (duration) => {
      const audio = fakeAudio()
      audio.duration = duration
      const result = browserAudioPlayback(track.url)
      await vi.advanceTimersByTimeAsync(3000)
      expect((await result).outcome).toBe('played')
      expect(audio.muted).toBe(true)
      expect(audio.volume).toBe(0)
      expect(audio.paused).toBe(true)
      expect(audio.src).toBe('')
      expect(vi.getTimerCount()).toBe(0)
    },
  )
  it.each(['stalled', 'tail', 'blocked'] as const)('does not pass %s playback', async (kind) => {
    const audio = fakeAudio()
    audio.advance = kind !== 'stalled'
    audio.tailFails = kind === 'tail'
    audio.block = kind === 'blocked'
    const result = browserAudioPlayback(track.url)
    await vi.advanceTimersByTimeAsync(20000)
    expect((await result).outcome).not.toBe('played')
    expect(audio.src).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })
  it('aborts immediately and cleans up a pending play promise', async () => {
    const audio = fakeAudio()
    audio.play = () => new Promise<void>(() => {})
    const abort = new AbortController()
    const result = browserAudioPlayback(track.url, abort.signal)
    const rejected = expect(result).rejects.toMatchObject({ name: 'AbortError' })
    await vi.advanceTimersByTimeAsync(50)
    abort.abort()
    await rejected
    expect(audio.src).toBe('')
    expect(vi.getTimerCount()).toBe(0)
  })
})
