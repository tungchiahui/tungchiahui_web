export const AUTO_RESUME_DELAYS = [180, 450, 900, 1600, 2800, 4200] as const
export const PRIMARY_CDN_RECONNECT_DELAYS = [160, 420] as const
export const CDN_GLOBAL_FALLBACK_DELAY = 1800
export const DEAD_TRACK_SKIP_DELAY = 5200
export const ERROR_TRACK_SKIP_DELAY = 360
export const ENDED_ADVANCE_DELAY = 650
export const PRIMARY_CDN_HOST = 'cdn.tungchiahui.cn'
export const GLOBAL_CDN_HOST = 'global.cdn.tungchiahui.cn'
export const CDN_RECONNECT_PARAM = 'music_cdn_retry'

export function isPrimaryCdnUrl(value: string): boolean {
  try {
    return new URL(value).hostname === PRIMARY_CDN_HOST
  } catch {
    return false
  }
}

export function primaryCdnReconnectUrl(value: string, attempt: number, now = Date.now()): string {
  if (!isPrimaryCdnUrl(value)) return ''
  const url = new URL(value)
  url.searchParams.set(CDN_RECONNECT_PARAM, `${attempt}-${now}`)
  return url.toString()
}

export function globalCdnFallbackUrl(value: string): string {
  if (!isPrimaryCdnUrl(value)) return ''
  const url = new URL(value)
  url.hostname = GLOBAL_CDN_HOST
  url.searchParams.delete(CDN_RECONNECT_PARAM)
  return url.toString()
}
