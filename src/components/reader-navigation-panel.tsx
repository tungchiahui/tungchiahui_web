'use client'

import { type ReactNode, useEffect, useRef } from 'react'

import { animateReaderScroll, panelScrollDestination } from './reader-scroll'

export function ReaderNavigationPanel({
  children,
  className,
  selectedKey,
}: Readonly<{ children: ReactNode; className: string; selectedKey: string | undefined }>) {
  const panelRef = useRef<HTMLElement>(null)
  const followRef = useRef<() => void>(() => {})

  useEffect(() => {
    const panel = panelRef.current
    if (!panel) return
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    let cancelAnimation: (() => void) | undefined
    let frame = 0
    let idleTimeout = 0
    let paused = false
    let requestedWhilePaused = false
    let pressed = false
    let initialized = false
    const follow = () => {
      frame = 0
      if (paused || panel.clientHeight === 0) return
      const item = panel.querySelector<HTMLElement>('[aria-current]')
      if (!item) return
      const itemRect = item.getBoundingClientRect()
      const control = panel.querySelector<HTMLElement>('[data-reader-pinned-control]')
      const reservedTop = control ? control.offsetHeight + 16 : 0
      const to = panelScrollDestination({
        scrollTop: panel.scrollTop,
        panelTop: panel.getBoundingClientRect().top + reservedTop,
        panelHeight: panel.clientHeight - reservedTop,
        itemTop: itemRect.top,
        itemHeight: itemRect.height,
        maximum: Math.max(0, panel.scrollHeight - panel.clientHeight),
      })
      cancelAnimation?.()
      cancelAnimation = animateReaderScroll({
        from: panel.scrollTop,
        to,
        duration: !initialized || motion?.matches ? 0 : 280,
        write: (top) => {
          panel.scrollTop = top
        },
      })
      initialized = true
    }
    const scheduleFollow = () => {
      if (paused) {
        requestedWhilePaused = true
        return
      }
      if (!frame) frame = requestAnimationFrame(follow)
    }
    followRef.current = scheduleFollow
    const resumeLater = () => {
      window.clearTimeout(idleTimeout)
      idleTimeout = window.setTimeout(() => {
        if (pressed) return
        paused = false
        // Browsing the directory alone must not pull it back to the reading position.
        if (requestedWhilePaused) {
          requestedWhilePaused = false
          scheduleFollow()
        }
      }, 1_500)
    }
    const pause = () => {
      cancelAnimation?.()
      paused = true
      resumeLater()
    }
    const onPointerDown = () => {
      pressed = true
      pause()
    }
    const onPointerUp = () => {
      if (!pressed) return
      pressed = false
      resumeLater()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (['ArrowUp', 'ArrowDown', 'PageUp', 'PageDown', 'Home', 'End', ' '].includes(event.key))
        pause()
    }
    panel.addEventListener('wheel', pause, { passive: true })
    panel.addEventListener('touchstart', onPointerDown, { passive: true })
    panel.addEventListener('pointerdown', onPointerDown, { passive: true })
    panel.addEventListener('keydown', onKeyDown)
    window.addEventListener('pointerup', onPointerUp, { passive: true })
    window.addEventListener('pointercancel', onPointerUp, { passive: true })
    window.addEventListener('touchend', onPointerUp, { passive: true })
    window.addEventListener('touchcancel', onPointerUp, { passive: true })
    window.addEventListener('resize', scheduleFollow)
    motion?.addEventListener('change', scheduleFollow)
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleFollow)
    observer?.observe(panel)
    const nav = panel.querySelector('nav')
    if (nav) observer?.observe(nav)
    scheduleFollow()
    return () => {
      followRef.current = () => {}
      cancelAnimation?.()
      cancelAnimationFrame(frame)
      window.clearTimeout(idleTimeout)
      observer?.disconnect()
      panel.removeEventListener('wheel', pause)
      panel.removeEventListener('touchstart', onPointerDown)
      panel.removeEventListener('pointerdown', onPointerDown)
      panel.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('pointerup', onPointerUp)
      window.removeEventListener('pointercancel', onPointerUp)
      window.removeEventListener('touchend', onPointerUp)
      window.removeEventListener('touchcancel', onPointerUp)
      window.removeEventListener('resize', scheduleFollow)
      motion?.removeEventListener('change', scheduleFollow)
    }
  }, [])

  useEffect(() => {
    if (selectedKey) followRef.current()
  }, [selectedKey])

  return (
    <aside className={className} data-reader-panel ref={panelRef}>
      {children}
    </aside>
  )
}
