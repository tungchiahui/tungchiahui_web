import { act, cleanup, fireEvent, render } from '@testing-library/react'
import { useMemo, useRef } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { useReaderNavigation } from '@/components/use-reader-navigation'

const headings = [{ id: 'target', text: 'Target', depth: 2, level: 0, number: '1' }] as const
const html = '<img src="/images/lifecycle-fixture.png" alt="Fixture"><h2 id="target">Target</h2>'

function Fixture() {
  const readerRef = useRef<HTMLDivElement>(null)
  const contentRef = useRef<HTMLDivElement>(null)
  const active = useReaderNavigation(readerRef, contentRef, headings, html)
  const markup = useMemo(() => ({ __html: html }), [])
  return (
    <div ref={readerRef}>
      {/* biome-ignore lint/security/noDangerouslySetInnerHtml: fixed test fixture. */}
      <div dangerouslySetInnerHTML={markup} ref={contentRef} />
      <output>{active}</output>
    </div>
  )
}

const scrollYDescriptor = Object.getOwnPropertyDescriptor(window, 'scrollY')
const heightDescriptor = Object.getOwnPropertyDescriptor(document.documentElement, 'scrollHeight')

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  if (scrollYDescriptor) Object.defineProperty(window, 'scrollY', scrollYDescriptor)
  if (heightDescriptor)
    Object.defineProperty(document.documentElement, 'scrollHeight', heightDescriptor)
  else Reflect.deleteProperty(document.documentElement, 'scrollHeight')
  window.history.replaceState(null, '', '/')
})

function setupLayout() {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'performance',
    ],
  })
  vi.stubGlobal('matchMedia', () => ({
    matches: true,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
  }))
  let position = 0
  let headingTop = 1000
  Object.defineProperty(window, 'scrollY', { configurable: true, get: () => position })
  Object.defineProperty(document.documentElement, 'scrollHeight', {
    configurable: true,
    value: 6000,
  })
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function (
    this: HTMLElement,
  ) {
    return new DOMRect(0, this.id === 'target' ? headingTop - position : 0, 500, 40)
  })
  const scroll = vi
    .spyOn(window, 'scrollTo')
    .mockImplementation((options: number | ScrollToOptions) => {
      if (typeof options !== 'number') position = options.top ?? position
      window.dispatchEvent(new Event('scroll'))
    })
  window.history.replaceState(null, '', '/#target')
  return {
    scroll,
    shift: () => {
      headingTop += 300
    },
  }
}

describe('reader anchor lifecycle', () => {
  it('resolves headings within the reader when the surrounding page has the same id', () => {
    setupLayout()
    const outside = document.createElement('div')
    outside.id = 'target'
    document.body.prepend(outside)
    try {
      render(<Fixture />)
      act(() => vi.advanceTimersByTime(100))
      expect(window.scrollY).toBe(904)
    } finally {
      outside.remove()
    }
  })

  it('corrects late layout changes only within the bounded settle window', () => {
    const { scroll, shift } = setupLayout()
    const { container } = render(<Fixture />)
    act(() => vi.advanceTimersByTime(100))
    expect(window.scrollY).toBe(904)
    const image = container.querySelector('img')
    if (!image) throw new Error('Fixture image is missing')
    shift()
    fireEvent.load(image)
    act(() => vi.advanceTimersByTime(100))
    expect(window.scrollY).toBe(1204)
    act(() => vi.advanceTimersByTime(20_000))
    const calls = scroll.mock.calls.length
    shift()
    fireEvent.load(image)
    act(() => vi.advanceTimersByTime(100))
    expect(scroll).toHaveBeenCalledTimes(calls)
    expect(window.scrollY).toBe(1204)
  })

  it('cancels calibration on user input and disposes every pending task on unmount', () => {
    const { scroll, shift } = setupLayout()
    const { container, unmount } = render(<Fixture />)
    act(() => vi.advanceTimersByTime(100))
    const calls = scroll.mock.calls.length
    fireEvent.wheel(window)
    shift()
    const image = container.querySelector('img')
    if (!image) throw new Error('Fixture image is missing')
    fireEvent.load(image)
    act(() => vi.advanceTimersByTime(100))
    expect(scroll).toHaveBeenCalledTimes(calls)
    unmount()
    act(() => vi.advanceTimersByTime(30_000))
    expect(vi.getTimerCount()).toBe(0)
    expect(document.documentElement.style.getPropertyValue('--reading-progress')).toBe('')
    expect(scroll).toHaveBeenCalledTimes(calls)
  })
})
