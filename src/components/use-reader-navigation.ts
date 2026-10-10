'use client'

import { type RefObject, useEffect, useState } from 'react'

import type { MarkdownHeading } from '@/web/markdown'

import { animateReaderScroll, isReaderScrollKey, readerHashId } from './reader-scroll'

const imageSizes = new Map<string, Readonly<{ width: number; height: number }>>()
const maximumRememberedImages = 128
const anchorSettleMilliseconds = 20_000

function reserveImageSpace(image: HTMLImageElement) {
  const source = image.getAttribute('src')
  if (!source) return
  if (image.naturalWidth > 0 && image.naturalHeight > 0) {
    imageSizes.delete(source)
    imageSizes.set(source, { width: image.naturalWidth, height: image.naturalHeight })
    const oldest = imageSizes.keys().next().value
    if (imageSizes.size > maximumRememberedImages && oldest) imageSizes.delete(oldest)
  }
  const size = imageSizes.get(source)
  if (size && !image.hasAttribute('width') && !image.hasAttribute('height')) {
    image.width = size.width
    image.height = size.height
  }
}

type AnchorNavigation = {
  heading: HTMLElement
  cancelAnimation?: () => void
  animating: boolean
}

export function useReaderNavigation(
  readerRef: RefObject<HTMLDivElement | null>,
  contentRef: RefObject<HTMLDivElement | null>,
  headings: readonly MarkdownHeading[],
  html: string,
) {
  const [activeId, setActiveId] = useState<string>()

  useEffect(() => {
    const reader = readerRef.current
    const content = contentRef.current
    if (!reader || !content || !html) return
    const header = document.querySelector<HTMLElement>('[data-site-header]')
    const motion = window.matchMedia?.('(prefers-reduced-motion: reduce)')
    const contentHeadings = new Map(
      Array.from(content.querySelectorAll<HTMLElement>('h1, h2, h3, h4, h5, h6')).map((element) => [
        element.id,
        element,
      ]),
    )
    const nodes = headings.flatMap(({ id }) => {
      const element = contentHeadings.get(id)
      return element ? [element] : []
    })
    let navigation: AnchorNavigation | undefined
    let settleTimeout = 0
    let frame = 0
    let hashFrame = 0
    let disposed = false
    let offset = 96

    const measureOffset = () => {
      offset = header ? Math.max(0, header.getBoundingClientRect().bottom) + 24 : 96
      reader.style.setProperty('--reader-anchor-offset', `${offset}px`)
    }
    const stopNavigation = () => {
      navigation?.cancelAnimation?.()
      navigation = undefined
      window.clearTimeout(settleTimeout)
    }
    const destination = (heading: HTMLElement) =>
      Math.max(
        0,
        Math.min(
          Math.max(0, document.documentElement.scrollHeight - window.innerHeight),
          window.scrollY + heading.getBoundingClientRect().top - offset,
        ),
      )
    const updateReadingPosition = () => {
      const maximum = document.documentElement.scrollHeight - window.innerHeight
      document.documentElement.style.setProperty(
        '--reading-progress',
        `${maximum <= 0 ? 100 : Math.min(100, (window.scrollY / maximum) * 100)}%`,
      )
      // Keep the destination highlighted while images settle, avoiding intermediate TOC flashes.
      const active =
        navigation?.heading ??
        nodes.findLast((heading) => heading.getBoundingClientRect().top <= offset + 24) ??
        nodes[0]
      setActiveId(active?.id)
    }
    const correctPosition = () => {
      const current = navigation
      if (!current || current.animating || !current.heading.isConnected) return
      measureOffset()
      const to = destination(current.heading)
      if (Math.abs(to - window.scrollY) <= 2) return
      current.animating = true
      current.cancelAnimation = animateReaderScroll({
        from: window.scrollY,
        to,
        duration: motion?.matches ? 0 : 240,
        write: (top) => window.scrollTo({ top, behavior: 'instant' }),
        complete: () => {
          if (navigation !== current || disposed) return
          current.animating = false
          scheduleUpdate()
        },
      })
    }
    const scheduleUpdate = () => {
      if (frame || disposed) return
      frame = requestAnimationFrame(() => {
        frame = 0
        measureOffset()
        updateReadingPosition()
        correctPosition()
      })
    }
    const navigate = (heading: HTMLElement, animated: boolean, addHistory: boolean) => {
      stopNavigation()
      if (addHistory) {
        const hash = `#${encodeURIComponent(heading.id)}`
        if (window.location.hash !== hash) window.history.pushState(window.history.state, '', hash)
      }
      measureOffset()
      const current: AnchorNavigation = { heading, animating: true }
      navigation = current
      setActiveId(heading.id)
      const to = destination(heading)
      settleTimeout = window.setTimeout(stopNavigation, anchorSettleMilliseconds)
      current.cancelAnimation = animateReaderScroll({
        from: window.scrollY,
        to,
        duration:
          !animated || motion?.matches
            ? 0
            : Math.min(650, 360 + Math.sqrt(Math.abs(to - window.scrollY)) * 4),
        write: (top) => window.scrollTo({ top, behavior: 'instant' }),
        complete: () => {
          if (navigation !== current || disposed) return
          current.animating = false
          if (addHistory) heading.focus({ preventScroll: true })
          scheduleUpdate()
        },
      })
    }
    const navigateHash = () => {
      stopNavigation()
      const id = readerHashId(window.location.hash)
      const heading = nodes.find((node) => node.id === id)
      if (heading) navigate(heading, false, false)
      else scheduleUpdate()
    }
    const onHistoryNavigation = () => {
      stopNavigation()
      cancelAnimationFrame(hashFrame)
      // popstate and hashchange can describe the same browser navigation.
      hashFrame = requestAnimationFrame(navigateHash)
    }
    const onClick = (event: MouseEvent) => {
      if (
        event.defaultPrevented ||
        event.button !== 0 ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        event.shiftKey ||
        !(event.target instanceof Element)
      )
        return
      const anchor = event.target.closest<HTMLAnchorElement>('a[href]')
      if (anchor) {
        if (anchor.hasAttribute('download') || (anchor.target && anchor.target !== '_self')) return
        const url = new URL(anchor.href, window.location.href)
        if (
          url.origin !== window.location.origin ||
          url.pathname !== window.location.pathname ||
          url.search !== window.location.search ||
          !url.hash
        )
          return
        const id = readerHashId(url.hash)
        const heading = nodes.find((node) => node.id === id)
        if (!heading) return
        event.preventDefault()
        navigate(heading, true, true)
      } else if (!event.target.closest('button')) {
        const heading = event.target.closest<HTMLElement>('[data-heading-anchor]')
        if (heading && content.contains(heading)) navigate(heading, true, true)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (isReaderScrollKey(event)) {
        stopNavigation()
        scheduleUpdate()
      }
      if (event.key !== 'Enter' && event.key !== ' ') return
      const heading = event.target
      if (
        heading instanceof HTMLElement &&
        heading.matches('[data-heading-anchor]') &&
        content.contains(heading)
      ) {
        event.preventDefault()
        navigate(heading, true, true)
      }
    }
    const onUserScroll = () => {
      stopNavigation()
      scheduleUpdate()
    }
    const onImageSettled = (event: Event) => {
      if (event.target instanceof HTMLImageElement) reserveImageSpace(event.target)
      scheduleUpdate()
    }
    const onMotionChange = () => {
      const heading = navigation?.heading
      if (heading) navigate(heading, false, false)
    }

    for (const image of content.querySelectorAll('img')) reserveImageSpace(image)
    measureOffset()
    updateReadingPosition()
    // Handle same-page full-path hashes before the prose's generic Next navigation listener.
    reader.addEventListener('click', onClick, true)
    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('wheel', onUserScroll, { passive: true, capture: true })
    window.addEventListener('touchstart', onUserScroll, { passive: true, capture: true })
    window.addEventListener('pointerdown', onUserScroll, { passive: true, capture: true })
    window.addEventListener('scroll', scheduleUpdate, { passive: true })
    window.addEventListener('resize', scheduleUpdate)
    window.addEventListener('hashchange', onHistoryNavigation)
    window.addEventListener('popstate', onHistoryNavigation)
    content.addEventListener('load', onImageSettled, true)
    content.addEventListener('error', onImageSettled, true)
    motion?.addEventListener('change', onMotionChange)
    const observer =
      typeof ResizeObserver === 'undefined' ? undefined : new ResizeObserver(scheduleUpdate)
    observer?.observe(content)
    // Hero metadata (for example asynchronous traffic statistics) can move the entire reader
    // without changing the prose's own dimensions.
    if (reader.parentElement) observer?.observe(reader.parentElement)
    if (header) observer?.observe(header)
    void document.fonts?.ready.then(() => {
      if (!disposed) scheduleUpdate()
    })
    if (window.location.hash) hashFrame = requestAnimationFrame(navigateHash)

    return () => {
      disposed = true
      stopNavigation()
      cancelAnimationFrame(frame)
      cancelAnimationFrame(hashFrame)
      observer?.disconnect()
      reader.removeEventListener('click', onClick, true)
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('wheel', onUserScroll, true)
      window.removeEventListener('touchstart', onUserScroll, true)
      window.removeEventListener('pointerdown', onUserScroll, true)
      window.removeEventListener('scroll', scheduleUpdate)
      window.removeEventListener('resize', scheduleUpdate)
      window.removeEventListener('hashchange', onHistoryNavigation)
      window.removeEventListener('popstate', onHistoryNavigation)
      content.removeEventListener('load', onImageSettled, true)
      content.removeEventListener('error', onImageSettled, true)
      motion?.removeEventListener('change', onMotionChange)
      reader.style.removeProperty('--reader-anchor-offset')
      document.documentElement.style.removeProperty('--reading-progress')
    }
  }, [contentRef, headings, html, readerRef])

  return activeId
}
