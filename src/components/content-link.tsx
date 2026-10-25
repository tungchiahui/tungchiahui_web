'use client'

import Link, { useLinkStatus } from 'next/link'
import { useTranslations } from 'next-intl'
import { type ComponentProps, useEffect, useRef, useState } from 'react'

/** Dense chapter lists must not compete with the selected article for bandwidth. */
export function ContentLink({
  children,
  className,
  onMouseEnter,
  onMouseLeave,
  onFocus,
  onTouchStart,
  ...properties
}: Omit<ComponentProps<typeof Link>, 'prefetch'>) {
  const [intent, setIntent] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)
  const cancel = () => clearTimeout(timer.current)
  useEffect(() => () => clearTimeout(timer.current), [])
  return (
    <Link
      {...properties}
      className={['relative', className].filter(Boolean).join(' ')}
      prefetch={intent}
      onMouseEnter={(event) => {
        onMouseEnter?.(event)
        cancel()
        timer.current = setTimeout(() => setIntent(true), 120)
      }}
      onMouseLeave={(event) => {
        onMouseLeave?.(event)
        cancel()
      }}
      onFocus={(event) => {
        onFocus?.(event)
        setIntent(true)
      }}
      onTouchStart={(event) => {
        onTouchStart?.(event)
        setIntent(true)
      }}
    >
      {children}
      <PendingFeedback />
    </Link>
  )
}

function PendingFeedback() {
  const { pending } = useLinkStatus()
  return pending ? <PendingIndicator /> : null
}

function PendingIndicator() {
  const t = useTranslations('Web')
  return (
    <span
      className="pointer-events-none absolute inset-x-0 bottom-0 h-0.5 bg-primary motion-safe:animate-pulse"
      role="status"
    >
      <span className="sr-only">{t('loadingPage')}</span>
    </span>
  )
}
