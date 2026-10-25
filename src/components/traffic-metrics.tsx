'use client'

import { useEffect, useRef, useState } from 'react'

import { type PublicTrafficResponse, publicTrafficResponseSchema } from '@/analytics/public-traffic'

export function TrafficMetrics({
  labels,
  paths,
  variant = 'compact',
}: Readonly<{
  labels: Readonly<{
    averageTime: string
    bounceRate: string
    pageviews: string
    unavailable: string
    visits: string
  }>
  paths: readonly string[]
  variant?: 'compact' | 'detail'
}>) {
  const targetRef = useRef<HTMLElement | null>(null)
  const pathsKey = JSON.stringify(paths)
  const [metrics, setMetrics] = useState<PublicTrafficResponse | 'unavailable'>()
  useEffect(() => {
    const controller = new AbortController()
    setMetrics(undefined)
    const load = () =>
      fetch('/api/traffic', {
        body: `{"paths":${pathsKey}}`,
        headers: { 'content-type': 'application/json' },
        method: 'POST',
        signal: controller.signal,
      })
        .then(async (response) => {
          if (!response.ok) throw new Error('unavailable')
          const metrics = publicTrafficResponseSchema.parse(await response.json())
          if (!controller.signal.aborted) setMetrics(metrics)
        })
        .catch((error: unknown) => {
          if (
            !controller.signal.aborted &&
            !(error instanceof DOMException && error.name === 'AbortError')
          )
            setMetrics('unavailable')
        })
    const target = targetRef.current
    // Below-the-fold cards should not contend with article navigation.
    const observer =
      target && typeof IntersectionObserver !== 'undefined'
        ? new IntersectionObserver((entries) => {
            if (entries.some((entry) => entry.isIntersecting)) {
              observer?.disconnect()
              void load()
            }
          })
        : undefined
    if (observer && target) observer.observe(target)
    else void load()
    return () => {
      observer?.disconnect()
      controller.abort()
    }
  }, [pathsKey])
  const Container = variant === 'detail' ? 'div' : 'span'
  return (
    <Container
      className={variant === 'detail' ? 'min-h-4' : 'inline-block min-h-4 min-w-px'}
      ref={(element) => {
        targetRef.current = element
      }}
      data-traffic-slot
    >
      {renderMetrics(metrics, labels, variant)}
    </Container>
  )
}

function renderMetrics(
  metrics: PublicTrafficResponse | 'unavailable' | undefined,
  labels: Parameters<typeof TrafficMetrics>[0]['labels'],
  variant: 'compact' | 'detail',
) {
  if (metrics === undefined) return null
  if (metrics === 'unavailable')
    return <span className="text-muted-foreground text-xs">{labels.unavailable}</span>
  if (metrics.pageviews === 0 && metrics.visits === 0)
    return <span aria-hidden className="hidden" data-traffic-empty />
  if (variant === 'compact') {
    return (
      <span className="text-muted-foreground text-xs">
        {labels.pageviews}: {metrics.pageviews} · {labels.visits}: {metrics.visits}
      </span>
    )
  }
  return (
    <dl
      className="mt-6 grid max-w-2xl grid-cols-2 overflow-hidden rounded-xl border bg-border sm:grid-cols-4"
      data-traffic-metrics
    >
      <div className="bg-background px-4 py-3">
        <dt className="text-muted-foreground text-xs">{labels.pageviews}</dt>
        <dd className="mt-1 font-semibold text-base tabular-nums">{metrics.pageviews}</dd>
      </div>
      <div className="border-l bg-background px-4 py-3">
        <dt className="text-muted-foreground text-xs">{labels.visits}</dt>
        <dd className="mt-1 font-semibold text-base tabular-nums">{metrics.visits}</dd>
      </div>
      <div className="border-t bg-background px-4 py-3 sm:border-t-0 sm:border-l">
        <dt className="text-muted-foreground text-xs">{labels.bounceRate}</dt>
        <dd className="mt-1 font-semibold text-base tabular-nums">
          {Math.round(metrics.bounceRate * 100)}%
        </dd>
      </div>
      <div className="border-t border-l bg-background px-4 py-3 sm:border-t-0">
        <dt className="text-muted-foreground text-xs">{labels.averageTime}</dt>
        <dd className="mt-1 font-semibold text-base tabular-nums">
          {Math.round(metrics.averageVisitSeconds)}s
        </dd>
      </div>
    </dl>
  )
}
