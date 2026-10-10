import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  animateReaderScroll,
  isReaderScrollKey,
  panelScrollDestination,
  readerHashId,
} from '@/components/reader-scroll'

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

function animationClock() {
  vi.spyOn(performance, 'now').mockReturnValue(0)
  const frames = new Map<number, FrameRequestCallback>()
  let identifier = 0
  vi.stubGlobal('requestAnimationFrame', (callback: FrameRequestCallback) => {
    frames.set(++identifier, callback)
    return identifier
  })
  vi.stubGlobal('cancelAnimationFrame', (id: number) => frames.delete(id))
  return (now: number) => {
    const pending = [...frames.values()]
    frames.clear()
    for (const callback of pending) callback(now)
  }
}

describe('reader scroll motion and boundaries', () => {
  it('accelerates and decelerates without teleporting, then finishes exactly at the target', () => {
    const tick = animationClock()
    const positions: number[] = []
    const complete = vi.fn()
    animateReaderScroll({
      from: 0,
      to: 1000,
      duration: 500,
      write: (y) => positions.push(y),
      complete,
    })
    for (const time of [0, 100, 200, 300, 400, 500]) tick(time)
    expect(positions[0]).toBe(0)
    expect(positions.at(-1)).toBe(1000)
    const changes = positions.slice(1).map((y, index) => y - (positions[index] ?? 0))
    expect(changes.every((change) => change > 0)).toBe(true)
    expect(changes[0]).toBeLessThan(changes[2] ?? 0)
    expect(changes.at(-1)).toBeLessThan(changes[2] ?? 0)
    expect(complete).toHaveBeenCalledOnce()
  })

  it('stops immediately on interruption, without completing or writing subsequent frames', () => {
    const tick = animationClock()
    const write = vi.fn()
    const complete = vi.fn()
    const cancel = animateReaderScroll({ from: 100, to: 600, duration: 500, write, complete })
    tick(100)
    cancel()
    tick(500)
    expect(write).toHaveBeenCalledOnce()
    expect(complete).not.toHaveBeenCalled()
  })

  it('uses an immediate position for reduced motion and avoids redundant writes', () => {
    animationClock()
    const write = vi.fn()
    const complete = vi.fn()
    animateReaderScroll({ from: 0, to: 600, duration: 0, write, complete })
    expect(write).toHaveBeenCalledWith(600)
    animateReaderScroll({ from: 600, to: 600, duration: 280, write, complete })
    expect(write).toHaveBeenCalledOnce()
    expect(complete).toHaveBeenCalledTimes(2)
  })

  it('keeps an already visible item still and reveals an offscreen item within panel bounds', () => {
    const panel = { scrollTop: 50, panelTop: 100, panelHeight: 400, itemHeight: 40, maximum: 1000 }
    expect(panelScrollDestination({ ...panel, itemTop: 200 })).toBe(50)
    expect(panelScrollDestination({ ...panel, itemTop: 700 })).toBe(306)
    expect(panelScrollDestination({ ...panel, itemTop: 80 })).toBe(14)
    expect(panelScrollDestination({ ...panel, itemTop: 1800 })).toBe(1000)
  })

  it('aligns oversized items at their start rather than oscillating between edges', () => {
    expect(
      panelScrollDestination({
        scrollTop: 0,
        panelTop: 0,
        panelHeight: 100,
        itemTop: 100,
        itemHeight: 120,
        maximum: 300,
      }),
    ).toBe(84)
  })

  it('decodes multilingual hashes and ignores malformed escapes', () => {
    expect(readerHashId('#%E7%9B%AE%E5%BD%95')).toBe('目录')
    expect(readerHashId('#%E7')).toBeUndefined()
  })

  it('recognizes reading keys while preserving editing and button activation', () => {
    const key = new KeyboardEvent('keydown', { key: 'PageDown' })
    expect(isReaderScrollKey(key)).toBe(true)
    const input = document.createElement('input')
    input.addEventListener('keydown', (event) => expect(isReaderScrollKey(event)).toBe(false))
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    const button = document.createElement('button')
    button.addEventListener('keydown', (event) => expect(isReaderScrollKey(event)).toBe(false))
    button.dispatchEvent(new KeyboardEvent('keydown', { key: ' ' }))
  })
})
