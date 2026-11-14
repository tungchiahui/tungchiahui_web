'use client'

import { useLocale, useTranslations } from 'next-intl'
import { type PointerEvent, useEffect, useRef, useState } from 'react'
import { inspectCurve, timeSeriesCurve } from '@/health/chart'
import {
  healthTimeZone,
  type MetricKey,
  measurementDay,
  metricDefinitions,
} from '@/health/contracts'
import type { TrendPoint } from '@/health/trends'

export function MeasurementChart({
  points,
  targets = [],
  metric,
  raw = false,
  rolling = false,
  smoothed = false,
  showObserved = false,
  hold,
  domain,
}: {
  points: TrendPoint[]
  targets?: TrendPoint[]
  metric: MetricKey
  raw?: boolean
  rolling?: boolean
  smoothed?: boolean
  showObserved?: boolean
  hold?: { from: string; to: string }
  domain?: { from: string; to: string }
}) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(700)
  const [activeTime, setActiveTime] = useState<number | null>(null)
  const [rawIndex, setRawIndex] = useState<number | null>(null)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width))
    })
    resize.observe(element)
    return () => resize.disconnect()
  }, [])
  const unit = metricDefinitions.find((definition) => definition.key === metric)?.unit ?? 'index'
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const dates = [...points, ...targets].map((point) => Date.parse(point.time))
  if (domain)
    dates.push(
      Date.parse(`${domain.from}T00:00:00+08:00`),
      Date.parse(`${domain.to}T23:59:59+08:00`),
    )
  const first = dates.reduce(
      (minimum, value) => Math.min(minimum, value),
      Number.POSITIVE_INFINITY,
    ),
    last = dates.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY)
  const values = [...points, ...targets].flatMap((point) =>
    showObserved && point.observedValue !== undefined
      ? [point.value, point.observedValue]
      : [point.value],
  )
  const low = values.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY),
    high = values.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY)
  const padding = Math.max((high - low) * 0.15, 0.5)
  const min = Math.max(0, low - padding),
    max = high + padding
  const right = width - 16
  const x = (time: number | string) =>
    52 +
    (((typeof time === 'string' ? Date.parse(time) : time) - first) /
      Math.max(last - first, 86400000)) *
      (right - 52)
  const y = (value: number) => 250 - ((value - min) / (max - min)) * 218
  const segments = timeSeriesCurve(points)
  const selected = inspectCurve(
    points,
    segments,
    activeTime ?? Date.parse(points.at(-1)?.time ?? new Date().toISOString()),
    raw,
    raw ? (rawIndex ?? Math.max(0, points.length - 1)) : undefined,
  )
  const paths: { id: string; estimated: boolean; path: string }[] = []
  for (const segment of segments) {
    const estimated = segment.end.x - segment.start.x > 86400000
    const command = `C${x(segment.control1.x)},${y(segment.control1.y)} ${x(segment.control2.x)},${y(segment.control2.y)} ${x(segment.end.x)},${y(segment.end.y)}`
    const previous = paths.at(-1)
    if (previous?.estimated === estimated) previous.path += ` ${command}`
    else
      paths.push({
        id: String(segment.start.x),
        estimated,
        path: `M${x(segment.start.x)},${y(segment.start.y)} ${command}`,
      })
  }
  const firstDay = Date.parse(points[0]?.time ?? new Date().toISOString())
  const lastDay = Date.parse(points.at(-1)?.time ?? new Date().toISOString())
  const sliderMax = raw ? points.length - 1 : Math.round((lastDay - firstDay) / 86400000)
  const sliderValue = raw
    ? Math.max(
        0,
        points.findIndex((point) => point.id === selected?.id),
      )
    : Math.max(
        0,
        Math.round((Date.parse(selected?.time ?? new Date().toISOString()) - firstDay) / 86400000),
      )
  const dateLabel = (time: number) =>
    new Intl.DateTimeFormat(locale, {
      timeZone: healthTimeZone,
      month: 'short',
      day: 'numeric',
    }).format(new Date(time))
  const holdLeft = hold ? Math.max(52, x(`${hold.from}T00:00:00+08:00`)) : 0
  const holdRight = hold ? Math.min(right, x(`${hold.to}T23:59:59+08:00`)) : 0
  const inspectPointer = (event: PointerEvent<HTMLDivElement>) => {
    const bounds = event.currentTarget.getBoundingClientRect()
    const position = ((event.clientX - bounds.left) / bounds.width) * width
    if (raw) {
      const pointerY = ((event.clientY - bounds.top) / bounds.height) * 290
      let nearest = 0,
        distance = Number.POSITIVE_INFINITY
      for (const [index, point] of points.entries()) {
        const candidate = (x(point.time) - position) ** 2 + (y(point.value) - pointerY) ** 2
        if (candidate < distance) {
          nearest = index
          distance = candidate
        }
      }
      setRawIndex(nearest)
      return
    }
    setActiveTime(
      first +
        Math.max(0, Math.min(1, (position - 52) / (right - 52))) * Math.max(last - first, 86400000),
    )
  }
  const readingLabel = selected
    ? selected.estimated
      ? t('estimatedPoint', {
          date: measurementDay(selected.time),
          value: format(selected.value),
          unit: t(`units.${unit}`),
          from: selected.from,
          to: selected.to,
        })
      : `${smoothed ? t('smoothedValue') : t('readingValue')} · ${t('chartPoint', { date: measurementDay(selected.time), metric: t(`metrics.${metric}`), value: format(selected.value), unit: t(`units.${unit}`), count: selected.count })}`
    : ''
  return (
    <div ref={container} className="min-w-0 space-y-3">
      {selected && (
        <div
          className="min-h-16 space-y-1"
          aria-live="polite"
          aria-atomic="true"
          data-testid="chart-reading"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-2xl tabular-nums">
              {format(selected.value)}{' '}
              <span className="font-normal text-muted-foreground text-sm">
                {t(`units.${unit}`)}
              </span>
            </strong>
            <span className="text-muted-foreground text-xs">
              {raw && selected.timePrecision !== 'date'
                ? new Date(selected.time).toLocaleString(locale, {
                    timeZone: healthTimeZone,
                    hour12: false,
                  })
                : measurementDay(selected.time)}{' '}
              ·{' '}
              {selected.estimated
                ? t('gapEstimate')
                : t(smoothed ? 'smoothedValue' : 'readingValue')}
            </span>
          </div>
          <p className="text-muted-foreground text-xs">
            {selected.estimated ? (
              t('gapBounds', { from: selected.from, to: selected.to })
            ) : (
              <>
                {smoothed && selected.observedValue !== null && (
                  <>
                    {t('observedMean')} {format(selected.observedValue)} {t(`units.${unit}`)} ·{' '}
                  </>
                )}
                {t(rolling ? 'effectiveDays' : 'samples', { count: selected.count })}
              </>
            )}
          </p>
        </div>
      )}
      {points.length ? (
        <>
          <div
            onPointerMove={inspectPointer}
            onPointerDown={inspectPointer}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') {
                setActiveTime(null)
                setRawIndex(null)
              }
            }}
          >
            <svg
              viewBox={`0 0 ${width} 290`}
              className="h-[290px] w-full overflow-visible"
              role="img"
              aria-label={t('trend')}
            >
              <title>{t('trend')}</title>
              {holdRight > holdLeft && (
                <g className="text-amber-500">
                  <rect
                    x={holdLeft}
                    y="20"
                    width={holdRight - holdLeft}
                    height="230"
                    fill="currentColor"
                    opacity="0.07"
                  />
                  {holdRight - holdLeft > 65 && (
                    <text
                      x={(holdLeft + holdRight) / 2}
                      y="17"
                      textAnchor="middle"
                      fill="currentColor"
                      fontSize="11"
                    >
                      {t('holdLabel')}
                    </text>
                  )}
                </g>
              )}
              {[0, 1, 2, 3, 4].map((tick) => {
                const value = min + ((max - min) * tick) / 4
                return (
                  <g key={tick} className="text-muted-foreground">
                    <line
                      x1="52"
                      x2={right}
                      y1={y(value)}
                      y2={y(value)}
                      stroke="currentColor"
                      opacity="0.12"
                    />
                    <text
                      x="43"
                      y={y(value) + 4}
                      textAnchor="end"
                      fill="currentColor"
                      fontSize="11"
                    >
                      {format(value)}
                    </text>
                  </g>
                )
              })}
              {targets.length > 0 && (
                <polyline
                  className="text-emerald-600 dark:text-emerald-400"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeDasharray="5 5"
                  points={targets.map((point) => `${x(point.time)},${y(point.value)}`).join(' ')}
                />
              )}
              {!raw &&
                paths.map((path) => (
                  <path
                    key={path.id}
                    data-estimated={path.estimated}
                    d={path.path}
                    fill="none"
                    className="text-blue-600 dark:text-blue-400"
                    stroke="currentColor"
                    strokeWidth="2.5"
                    strokeDasharray={path.estimated ? '5 5' : undefined}
                    strokeLinecap="round"
                    opacity={path.estimated ? 0.65 : 1}
                  />
                ))}
              {(raw || (smoothed && showObserved)) &&
                points.map((point) => (
                  <circle
                    key={point.id}
                    data-observed="true"
                    cx={x(point.time)}
                    cy={y(point.observedValue ?? point.value)}
                    r="2.5"
                    className="text-blue-600 dark:text-blue-400"
                    fill="currentColor"
                    opacity={raw ? 0.55 : 0.25}
                  >
                    <title>
                      {t('chartPoint', {
                        date: measurementDay(point.time),
                        metric: t(`metrics.${metric}`),
                        value: format(point.observedValue ?? point.value),
                        unit: t(`units.${unit}`),
                        count: point.count,
                      })}
                    </title>
                  </circle>
                ))}
              {selected && (
                <g>
                  <line
                    x1={x(selected.time)}
                    x2={x(selected.time)}
                    y1="25"
                    y2="250"
                    className="text-blue-500"
                    stroke="currentColor"
                    strokeDasharray="2 5"
                    opacity="0.3"
                  />
                  <circle
                    cx={x(selected.time)}
                    cy={y(selected.value)}
                    r="4"
                    className="text-blue-600 dark:text-blue-400"
                    stroke="currentColor"
                    strokeWidth="2"
                    fill={selected.estimated ? 'var(--card)' : 'currentColor'}
                  />
                </g>
              )}
              {Array.from({ length: width < 480 ? 3 : 5 }, (_, index) => index).map((index) => {
                const count = width < 480 ? 3 : 5,
                  ratio = index / (count - 1)
                return (
                  <text
                    key={index}
                    x={52 + ratio * (right - 52)}
                    y="278"
                    textAnchor={index === 0 ? 'start' : index === count - 1 ? 'end' : 'middle'}
                    className="fill-muted-foreground"
                    fontSize="11"
                  >
                    {dateLabel(first + ratio * (last - first))}
                  </text>
                )
              })}
            </svg>
          </div>
          {points.length > 1 && (
            <input
              className="block h-2 w-full accent-blue-600"
              type="range"
              min="0"
              max={sliderMax}
              value={sliderValue}
              aria-label={t('inspect')}
              aria-valuetext={readingLabel}
              onChange={(event) => {
                if (raw) setRawIndex(Number(event.target.value))
                else setActiveTime(firstDay + Number(event.target.value) * 86400000)
              }}
            />
          )}
        </>
      ) : (
        <p className="py-20 text-center text-muted-foreground text-sm">{t('noData')}</p>
      )}
    </div>
  )
}
