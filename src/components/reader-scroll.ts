export type ScrollAnimation = Readonly<{
  from: number
  to: number
  duration: number
  write: (position: number) => void
  complete?: () => void
}>

export function animateReaderScroll(animation: ScrollAnimation) {
  let frame = 0
  let cancelled = false
  const startedAt = performance.now()
  const tick = (now: number) => {
    if (cancelled) return
    const progress = Math.min(1, Math.max(0, (now - startedAt) / animation.duration))
    // Smooth acceleration/deceleration also keeps short layout corrections gentle.
    const eased = progress * progress * (3 - 2 * progress)
    animation.write(animation.from + (animation.to - animation.from) * eased)
    if (progress < 1) frame = requestAnimationFrame(tick)
    else animation.complete?.()
  }
  if (animation.duration <= 0 || Math.abs(animation.to - animation.from) < 1) {
    if (Math.abs(animation.to - animation.from) >= 1) animation.write(animation.to)
    animation.complete?.()
  } else frame = requestAnimationFrame(tick)
  return () => {
    cancelled = true
    cancelAnimationFrame(frame)
  }
}

export function panelScrollDestination(
  input: Readonly<{
    scrollTop: number
    panelTop: number
    panelHeight: number
    itemTop: number
    itemHeight: number
    maximum: number
  }>,
) {
  const inset = 16
  const top = input.itemTop - input.panelTop
  const bottom = top + input.itemHeight
  const adjustment =
    top < inset
      ? top - inset
      : bottom > input.panelHeight - inset
        ? input.itemHeight > input.panelHeight - inset * 2
          ? top - inset
          : bottom - input.panelHeight + inset
        : 0
  return Math.max(0, Math.min(input.maximum, input.scrollTop + adjustment))
}

export function readerHashId(hash: string) {
  try {
    return decodeURIComponent(hash.slice(1))
  } catch {
    return undefined
  }
}

export function isReaderScrollKey(event: KeyboardEvent) {
  const target = event.target
  if (
    target instanceof Element &&
    target.closest('input, textarea, select, [contenteditable="true"]')
  )
    return false
  if (event.key === ' ' && target instanceof Element && target.closest('button')) return false
  return ['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key)
}
