import { createHash } from 'node:crypto'
import { encodeObjectKeyForUrl, type ObjectStorage } from '../storage/contracts'
import { assetCachePolicy, buildAssetObjectKey, buildCdnAssetUrl } from '../storage/policy'
import { type MusicImport, maximumMusicBytes } from './library-contracts'

export function validMp3(bytes: Uint8Array) {
  // An ID3 tag alone is insufficient: require a plausible MPEG layer III frame after it.
  let start = 0
  if (Buffer.from(bytes.subarray(0, 3)).toString() === 'ID3') {
    if (bytes.length < 10 || [...bytes.subarray(6, 10)].some((b) => b > 127)) return false
    start =
      10 +
      ((bytes[6] ?? 0) << 21) +
      ((bytes[7] ?? 0) << 14) +
      ((bytes[8] ?? 0) << 7) +
      (bytes[9] ?? 0)
  }
  for (let i = start; i < Math.min(bytes.length - 3, start + 4096); i++) {
    const b = bytes[i + 1] ?? 0,
      c = bytes[i + 2] ?? 0
    if (
      bytes[i] === 255 &&
      (b & 224) === 224 &&
      (b & 6) === 2 &&
      (b & 24) !== 8 &&
      (c & 240) !== 0 &&
      (c & 240) !== 240 &&
      (c & 12) !== 12
    )
      return true
  }
  return false
}
export async function uploadMusicAudio(
  storage: Pick<ObjectStorage, 'putObject' | 'headObject'>,
  baseUrl: URL,
  task: MusicImport,
  bytes: Uint8Array,
) {
  if (
    bytes.length > maximumMusicBytes ||
    bytes.length !== task.bytes ||
    createHash('sha256').update(bytes).digest('hex') !== task.sha256 ||
    !validMp3(bytes)
  )
    throw new Error('invalid_music_audio')
  const key = buildAssetObjectKey('music', task.sha256, task.fileName)
  await storage.putObject({
    key,
    body: bytes,
    contentType: 'audio/mpeg',
    cacheControl: assetCachePolicy.immutable,
    metadata: { sha256: task.sha256 },
  })
  const head = await storage.headObject(key)
  if (head.contentLength !== task.bytes || head.contentType !== 'audio/mpeg')
    throw new Error('music_upload_verification_failed')
  if (
    baseUrl.protocol === 'http:' &&
    ['localhost', '127.0.0.1', '[::1]'].includes(baseUrl.hostname) &&
    baseUrl.pathname === '/api/assets/'
  )
    return new URL(encodeObjectKeyForUrl(key), baseUrl)
  return buildCdnAssetUrl(baseUrl, key)
}
