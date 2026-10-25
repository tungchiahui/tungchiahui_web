import { createHash } from 'node:crypto'
import { lookup } from 'node:dns'
import { get } from 'node:https'
import type { LibraryTrack, MusicCheck } from './library-contracts'

export function audioUrlAllowed(input: string) {
  try {
    const url = new URL(input)
    return (
      url.protocol === 'https:' &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === '443') &&
      (['music.3e0.cn', 'cdn.tungchiahui.cn', 'global.cdn.tungchiahui.cn'].includes(url.hostname) ||
        url.hostname.endsWith('.qq.com') ||
        url.hostname.endsWith('.qqmusic.com') ||
        url.hostname.endsWith('.qqmusic.qq.com'))
    )
  } catch {
    return false
  }
}
export function publicIpv4(address: string) {
  const parts = address.split('.').map(Number)
  const a = parts[0],
    b = parts[1]
  return (
    parts.length === 4 &&
    parts.every((n) => Number.isInteger(n) && n >= 0 && n <= 255) &&
    a !== 0 &&
    a !== 10 &&
    a !== 127 &&
    a !== undefined &&
    a < 224 &&
    !(a === 169 && b === 254) &&
    !(a === 172 && b !== undefined && b >= 16 && b <= 31) &&
    !(a === 192 && (b === 168 || b === 0)) &&
    !(a === 100 && b !== undefined && b >= 64 && b <= 127) &&
    !(a === 198 && (b === 18 || b === 19))
  )
}
export function recognizableAudio(bytes: Uint8Array) {
  const b = Buffer.from(bytes)
  return (
    ['ID3', 'fLaC', 'OggS', 'RIFF'].some((m) => b.subarray(0, m.length).toString() === m) ||
    (b[0] === 255 && ((b[1] ?? 0) & 224) === 224) ||
    b.subarray(4, 8).toString() === 'ftyp'
  )
}

export type AudioProbeResult = Pick<MusicCheck, 'status' | 'reason'>
export async function inspectAudioUrl(
  url: string,
  signal = AbortSignal.timeout(12_000),
  redirects = 0,
): Promise<AudioProbeResult> {
  if (!audioUrlAllowed(url) || redirects > 4)
    return { status: 'uncertain', reason: 'unsupported_url' }
  try {
    const result = await new Promise<AudioProbeResult | { location: string }>((resolve, reject) => {
      const request = get(
        url,
        {
          signal,
          family: 4,
          headers: {
            range: 'bytes=0-65535',
            accept: 'audio/*',
            'user-agent': 'TungChiaHui-Music-Check/1.0',
          },
          lookup: (hostname, _options, callback) =>
            lookup(hostname, { family: 4 }, (error, address, family) => {
              if (error) callback(error, '', 4)
              else if (!publicIpv4(address)) callback(new Error('private_address_denied'), '', 4)
              else callback(null, address, family)
            }),
        },
        (response) => {
          const status = response.statusCode ?? 0
          if (status >= 300 && status < 400 && response.headers.location) {
            response.destroy()
            resolve({ location: new URL(response.headers.location, url).toString() })
            return
          }
          if (status !== 200 && status !== 206) {
            response.destroy()
            resolve({
              status: status === 429 || status >= 500 ? 'uncertain' : 'failed',
              reason: status === 404 ? 'not_found' : 'http_denied',
            })
            return
          }
          let size = 0
          const chunks: Buffer[] = []
          const finish = () => {
            const data = Buffer.concat(chunks)
            resolve(
              recognizableAudio(data)
                ? { status: 'reachable', reason: 'audio_response' }
                : { status: 'failed', reason: 'not_audio' },
            )
          }
          response.on('data', (chunk: Buffer) => {
            const kept = chunk.subarray(0, Math.max(0, 65536 - size))
            chunks.push(kept)
            size += kept.length
            if (size >= 4096) {
              finish()
              response.destroy()
            }
          })
          response.on('end', finish)
          response.on('error', reject)
        },
      )
      request.on('error', reject)
    })
    return 'location' in result ? inspectAudioUrl(result.location, signal, redirects + 1) : result
  } catch {
    return { status: 'uncertain', reason: 'network' }
  }
}
export function musicSourceHash(url: string) {
  return createHash('sha256').update(url).digest('hex')
}
export async function checkMusicTrack(
  track: LibraryTrack,
  source: MusicCheck['source'],
  inspect = inspectAudioUrl,
): Promise<MusicCheck> {
  const url = source === 'effective' ? track.url : track.upstreamUrl
  return {
    ...(await inspect(url)),
    id: track.id,
    source,
    checkedAt: new Date().toISOString(),
    urlHash: musicSourceHash(url),
  }
}
