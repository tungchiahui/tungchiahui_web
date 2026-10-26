import { type PlaybackEvidence, playbackPositions } from './playback-check'

export async function browserAudioDuration(
  url: string,
  signal?: AbortSignal,
): Promise<number | null> {
  return new Promise((resolve) => {
    const audio = new Audio()
    let finished = false
    const finish = (duration: number | null) => {
      if (finished) return
      finished = true
      clearTimeout(timer)
      signal?.removeEventListener('abort', abort)
      audio.oncanplay = null
      audio.onerror = null
      audio.pause()
      audio.removeAttribute('src')
      audio.load()
      resolve(duration)
    }
    const abort = () => finish(null)
    const timer = setTimeout(abort, 8000)
    audio.preload = 'auto'
    audio.muted = true
    audio.oncanplay = () =>
      finish(Number.isFinite(audio.duration) && audio.duration > 0 ? audio.duration : null)
    audio.onerror = abort
    signal?.addEventListener('abort', abort, { once: true })
    if (signal?.aborted) {
      finish(null)
      return
    }
    audio.src = url
  })
}

/** Muted, bounded playback samples; metadata/canplay alone never passes this probe. */
export async function browserAudioPlayback(
  url: string,
  signal?: AbortSignal,
): Promise<PlaybackEvidence> {
  if (signal?.aborted) throw new DOMException('Aborted', 'AbortError')
  if (!url) return { outcome: 'network', duration: null, samples: [] }
  const audio = new Audio()
  audio.preload = 'auto'
  audio.muted = true
  audio.volume = 0
  const samples: number[] = []
  let duration: number | null = null
  let failure: PlaybackEvidence['outcome'] = 'timeout'
  let cancelWait: (() => void) | undefined
  const onError = () => {
    failure = audio.error?.code === 3 || audio.error?.code === 4 ? 'decode' : 'network'
    cancelWait?.()
  }
  const onAbort = () => cancelWait?.()
  audio.addEventListener('error', onError)
  signal?.addEventListener('abort', onAbort)
  // Polling also handles media events that arrive before a listener can be installed.
  const waitFor = (ready: () => boolean, milliseconds: number) =>
    new Promise<boolean>((resolve, reject) => {
      let settled = false
      const finish = (ok: boolean) => {
        if (settled) return
        settled = true
        clearInterval(interval)
        clearTimeout(timer)
        cancelWait = undefined
        if (signal?.aborted) reject(new DOMException('Aborted', 'AbortError'))
        else resolve(ok)
      }
      const tick = () => {
        if (signal?.aborted || audio.error) finish(false)
        else if (ready()) finish(true)
      }
      const interval = setInterval(tick, 60)
      const timer = setTimeout(() => finish(false), milliseconds)
      cancelWait = () => finish(false)
      tick()
    })
  try {
    audio.src = url
    audio.load()
    if (!(await waitFor(() => Number.isFinite(audio.duration) && audio.duration > 0, 7000))) {
      return { outcome: failure, duration, samples }
    }
    const seconds = audio.duration
    duration = seconds
    if (seconds > 7200) return { outcome: 'timeout', duration: null, samples }
    if (seconds <= 8) {
      // Tiny clips can finish before a seek completes, and streamed local assets may not
      // advertise byte ranges. Playing through verifies all positions without seeking.
      let rejected = false
      void audio.play().catch((error: unknown) => {
        rejected = true
        failure =
          error instanceof DOMException && error.name === 'NotAllowedError' ? 'blocked' : failure
      })
      const positions = playbackPositions(seconds)
      await waitFor(
        () => {
          if (rejected) return true
          if ((!audio.paused || audio.ended) && audio.readyState >= 2) {
            for (const target of positions.slice(samples.length)) {
              if (audio.currentTime >= target + Math.min(0.1, seconds / 10)) samples.push(target)
              else break
            }
          }
          return samples.length === 3
        },
        Math.ceil((seconds + 4) * 1000),
      )
      return { outcome: samples.length === 3 ? 'played' : failure, duration, samples }
    }
    for (const position of playbackPositions(seconds)) {
      audio.pause()
      audio.currentTime = position
      // Seek must finish at the requested position before elapsed playback is accepted.
      if (
        !(await waitFor(
          () =>
            !audio.seeking && Math.abs(audio.currentTime - position) < 0.2 && audio.readyState >= 2,
          4000,
        ))
      )
        break
      let playSettled = false
      let playRejected = false
      void audio.play().then(
        () => {
          playSettled = true
        },
        (error: unknown) => {
          playSettled = true
          playRejected = true
          failure =
            error instanceof DOMException && error.name === 'NotAllowedError'
              ? 'blocked'
              : audio.error
                ? failure
                : 'network'
        },
      )
      const advanced = await waitFor(
        () =>
          playRejected ||
          (playSettled &&
            !audio.paused &&
            !audio.seeking &&
            audio.readyState >= 2 &&
            audio.currentTime >= position + Math.min(0.25, seconds / 10)),
        4000,
      )
      if (!advanced || playRejected) break
      samples.push(position)
    }
    return { outcome: samples.length === 3 ? 'played' : failure, duration, samples }
  } finally {
    audio.pause()
    audio.removeEventListener('error', onError)
    signal?.removeEventListener('abort', onAbort)
    audio.removeAttribute('src')
    audio.load()
  }
}
