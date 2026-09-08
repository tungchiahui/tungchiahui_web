'use client'

import { useEffect } from 'react'

const primaryOrigin = 'https://cdn.tungchiahui.cn'
const fallbackOrigin = 'https://global.cdn.tungchiahui.cn'
const scriptPath = '/libs/font-awesome/7.1.0/all.min.js'
const stylesheetPath = '/libs/font-awesome/7.1.0/fontawesome.min.css'
const retryDelays = [240, 480] as const

export function CdnFontAwesome() {
  useEffect(() => {
    let task: number | undefined
    const load = () => {
      task = window.setTimeout(() => {
        loadStylesheet()
        loadScript()
      }, 0)
    }
    if (document.readyState === 'complete') load()
    else window.addEventListener('load', load, { once: true })
    return () => {
      window.removeEventListener('load', load)
      if (task !== undefined) window.clearTimeout(task)
    }
  }, [])

  return null
}

function loadStylesheet() {
  if (document.querySelector<HTMLLinkElement>('link[data-site-font-awesome]')) return
  const link = document.createElement('link')
  link.dataset.siteFontAwesome = 'true'
  link.rel = 'stylesheet'
  attachFallback(link, 'href', stylesheetPath)
  document.head.append(link)
}

function loadScript() {
  if (document.querySelector<HTMLScriptElement>('script[data-site-font-awesome]')) return
  const script = document.createElement('script')
  script.dataset.siteFontAwesome = 'true'
  script.async = true
  attachFallback(script, 'src', scriptPath)
  document.head.append(script)
}

function attachFallback(
  element: HTMLLinkElement | HTMLScriptElement,
  attribute: 'href' | 'src',
  path: string,
) {
  let attempt = 0
  const setUrl = (value: string) => element.setAttribute(attribute, value)
  element.addEventListener('error', () => {
    const delay = retryDelays[attempt]
    if (delay !== undefined) {
      attempt += 1
      window.setTimeout(
        () => setUrl(`${primaryOrigin}${path}?cdn_retry=${attempt}-${Date.now()}`),
        delay,
      )
      return
    }
    setUrl(`${fallbackOrigin}${path}`)
  })
  setUrl(`${primaryOrigin}${path}`)
}
