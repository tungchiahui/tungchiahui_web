'use client'

import { useEffect, useState } from 'react'

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
  const [metrics, setMetrics] = useState<PublicTrafficResponse | 'unavailable'>()
  useEffect(() => {
    const controller = new AbortController()
    fetch('/api/traffic', {
      body: JSON.stringify({ paths }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) throw new Error('unavailable')
        setMetrics(publicTrafficResponseSchema.parse(await response.json()))
      })
      .catch((error: unknown) => {
        if (!(error instanceof DOMException && error.name === 'AbortError'))
          setMetrics('unavailable')
      })
    return () => controller.abort()
  }, [paths])
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
