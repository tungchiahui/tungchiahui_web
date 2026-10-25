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
