import { z } from 'zod'
import type { LibraryTrack, MusicCheck } from './library-contracts'

// Also bounds owner-supplied diagnostic evidence; it is not a security attestation.
export const playbackEvidenceSchema = z
  .object({
    outcome: z.enum(['played', 'network', 'blocked', 'decode', 'timeout']),
    duration: z.number().positive().max(7200).nullable(),
    samples: z.array(z.number().nonnegative().max(7200)).max(3),
  })
  .strict()
export type PlaybackEvidence = z.infer<typeof playbackEvidenceSchema>
export function playbackPositions(duration: number) {
  return [0, duration / 2, Math.max(0, duration - Math.min(1, duration / 4))]
}
export function isMetingAudioUrl(input: string) {
  try {
    const url = new URL(input)
    return url.hostname === 'music.3e0.cn' && url.searchParams.get('type') === 'url'
  } catch {
    return false
  }
}

export function isMetingServiceFailure(
  url: string,
  server: Pick<MusicCheck, 'reason'>,
  browser: Pick<MusicCheck, 'status' | 'reason'>,
) {
  return (
    isMetingAudioUrl(url) &&
    browser.status === 'uncertain' &&
    ['not_audio', 'http_denied', 'not_found', 'network'].includes(server.reason) &&
    ['not_audio', 'browser_blocked', 'network'].includes(browser.reason)
  )
}

export function playbackVerdict(
  track: Pick<LibraryTrack, 'duration'>,
  evidence: PlaybackEvidence,
  audioUrl = '',
): Pick<MusicCheck, 'status' | 'reason'> {
  if (evidence.outcome === 'decode')
    return { status: isMetingAudioUrl(audioUrl) ? 'uncertain' : 'failed', reason: 'not_audio' }
  const duration = evidence.duration
  if (
    duration !== null &&
    (track.duration !== null
      ? duration < track.duration - 10 && duration < track.duration * 0.85
      : duration <= 60)
  )
    return { status: 'preview', reason: 'short_duration' }
  if (
    duration !== null &&
    evidence.outcome === 'played' &&
    evidence.samples.length === 3 &&
    playbackPositions(duration).every(
      (target, index) =>
        Math.abs(target - (evidence.samples[index] ?? -100)) <= Math.min(0.2, duration / 20),
    )
  ) {
    return { status: 'reachable', reason: 'browser_decode' }
  }
  return {
    status: 'uncertain',
    reason: evidence.outcome === 'network' ? 'network' : 'browser_blocked',
  }
}

export type MusicFilter = 'all' | 'cdn' | 'missing' | 'recheck'
export function filterMusicTracks(
  tracks: readonly LibraryTrack[],
  checks: readonly MusicCheck[],
  source: MusicCheck['source'],
  filter: MusicFilter,
  query: string,
) {
  return tracks.filter((track) => {
    const check = checks.find((item) => item.id === track.id && item.source === source)
    return (
      (filter !== 'cdn' || track.selfHosted) &&
      (filter !== 'missing' ||
        check?.status === 'failed' ||
        check?.status === 'preview' ||
        (source === 'meting' && check?.status === 'uncertain')) &&
      (filter !== 'recheck' || !check || check.status === 'uncertain') &&
      `${track.id} ${track.title} ${track.artist} ${track.fileName ?? ''}`
        .toLowerCase()
        .includes(query.trim().toLowerCase())
    )
  })
}
