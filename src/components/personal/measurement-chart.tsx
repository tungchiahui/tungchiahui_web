'use client'

import { useLocale, useTranslations } from 'next-intl'
import { type PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { chartYAxis, inspectCurve, timeSeriesCurve } from '@/health/chart'
import { type HealthPlan, healthTimeZone, measurementDay } from '@/health/contracts'
import { type DisplayMetricKey, displayMetricDefinitions } from '@/health/display-metrics'
import { metricTargetAt } from '@/health/plan'
import type { TrendPoint } from '@/health/trends'

const emptyTargets: TrendPoint[] = []

export function MeasurementChart({
  points,
  targets = emptyTargets,
  metric,
  raw = false,
  rolling = false,
  smoothed = false,
  showObserved = false,
  hold,
  domain,
  plan,
  tall = false,
}: {
  points: TrendPoint[]
  targets?: TrendPoint[]
  metric: DisplayMetricKey
  raw?: boolean
  rolling?: boolean
  smoothed?: boolean
  showObserved?: boolean
  hold?: { from: string; to: string }
  domain?: { from: string; to: string }
  plan?: HealthPlan
  tall?: boolean
}) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const container = useRef<HTMLDivElement>(null)
  const [width, setWidth] = useState(700)
  const [activeTime, setActiveTime] = useState<number | null>(null)
  const [rawIndex, setRawIndex] = useState<number | null>(null)
  const [pointer, setPointer] = useState<{ x: number; y: number } | null>(null)
  useEffect(() => {
    const element = container.current
    if (!element) return
    const resize = new ResizeObserver(([entry]) => {
      if (entry) setWidth(Math.max(280, entry.contentRect.width))
    })
    resize.observe(element)
    return () => resize.disconnect()
  }, [])
  const unit =
    displayMetricDefinitions.find((definition) => definition.key === metric)?.unit ?? 'index'
  const formatter = useMemo(
    () => new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }),
    [locale],
  )
  const format = formatter.format
  const chartHeight = tall ? (width < 480 ? 420 : 520) : 290
  const plotTop = 32
  const plotBottom = chartHeight - 40
  const plotHeight = plotBottom - plotTop
  const tickCount = tall ? (width < 480 ? 9 : 11) : 5
  const { first, last } = useMemo(() => {
    const dates = [...points, ...targets].map((point) => Date.parse(point.time))
    if (domain)
      dates.push(
        Date.parse(`${domain.from}T00:00:00+08:00`),
        Date.parse(`${domain.to}T23:59:59+08:00`),
      )
    return {
      first: dates.reduce((minimum, value) => Math.min(minimum, value), Number.POSITIVE_INFINITY),
      last: dates.reduce((maximum, value) => Math.max(maximum, value), Number.NEGATIVE_INFINITY),
    }
  }, [points, targets, domain])
  const { min, max, ticks } = useMemo(
    () =>
      chartYAxis(
        [...points, ...targets].flatMap((point) =>
          showObserved && point.observedValue !== undefined
            ? [point.value, point.observedValue]
            : [point.value],
        ),
        tickCount,
      ),
    [points, targets, showObserved, tickCount],
  )
  const right = width - 16
  const x = useCallback(
    (time: number | string) =>
      52 +
      (((typeof time === 'string' ? Date.parse(time) : time) - first) /
        Math.max(last - first, 86400000)) *
        (right - 52),
    [first, last, right],
  )
  const y = useCallback(
    (value: number) => plotBottom - ((value - min) / (max - min)) * plotHeight,
    [min, max, plotBottom, plotHeight],
  )
  const segments = useMemo(() => timeSeriesCurve(points), [points])
  const measurementDays = useMemo(() => points.map((point) => measurementDay(point.time)), [points])
  const fallbackTime = points.at(-1)?.time ?? targets[0]?.time ?? new Date().toISOString()
  const inspectionTime = activeTime ?? Date.parse(fallbackTime)
  const inspectionDay = measurementDay(new Date(inspectionTime).toISOString())
  const dayTime = Date.parse(`${inspectionDay}T00:00:00+08:00`)
  const inspected = inspectCurve(points, segments, inspectionTime, raw, rawIndex ?? undefined)
  const firstActualDay = measurementDays[0] ?? ''
  const lastActualDay = measurementDays.at(-1) ?? ''
  const selected =
    inspected &&
    (raw
      ? measurementDay(inspected.time) === inspectionDay
      : inspectionDay >= firstActualDay && inspectionDay <= lastActualDay)
      ? inspected
      : null
  const planned = plan && targets.length ? metricTargetAt(plan, metric, inspectionDay) : null
  const targetLabel = t(planned?.interpolated ? 'targetInterpolation' : 'targetLabel')
  const targetNodes = targets.filter((point) =>
    plan?.bodyTargets?.points.some((node) => node.date === point.id),
  )
  const plannedValue = planned ? (planned.min + planned.max) / 2 : null
  const cursorX = x(dayTime)
  const planNearest =
    pointer !== null &&
    plannedValue !== null &&
    (!selected || Math.abs(pointer.y - y(plannedValue)) < Math.abs(pointer.y - y(selected.value)))
  const plannedLabel = planned
    ? planned.min === planned.max
      ? format(planned.min)
      : `${format(planned.min)}–${format(planned.max)}`
    : ''
  const observed =
    selected && !selected.estimated && !rolling
      ? smoothed
        ? selected.observedValue
        : selected.value
      : null
  const difference = observed !== null && plannedValue !== null ? observed - plannedValue : null
  const differenceUnit = t(unit === 'percent' ? 'units.percentagePoints' : `units.${unit}`)
  const differenceLabel =
    difference === null ? '' : `${difference > 0 ? '+' : ''}${format(difference)}`
  const paths = useMemo(() => {
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
    return paths
  }, [segments, x, y])
  const firstDay = Number.isFinite(first)
    ? Date.parse(`${measurementDay(new Date(first).toISOString())}T00:00:00+08:00`)
    : dayTime
  const lastDay = Number.isFinite(last)
    ? Date.parse(`${measurementDay(new Date(last).toISOString())}T00:00:00+08:00`)
    : dayTime
  const sliderMax = raw ? points.length - 1 : Math.round((lastDay - firstDay) / 86400000)
  const sliderValue = raw
    ? Math.max(
        0,
        points.findIndex((point) => point.id === selected?.id),
      )
    : Math.max(0, Math.round((dayTime - firstDay) / 86400000))
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
    const pointerX = ((event.clientX - bounds.left) / bounds.width) * width
    const pointerY = ((event.clientY - bounds.top) / bounds.height) * chartHeight
    const time =
      first + Math.max(0, Math.min(1, (pointerX - 52) / (right - 52))) * Math.max(last - first, 1)
    setActiveTime(time)
    setPointer({
      x: Math.max(0, Math.min(width, pointerX)),
      y: Math.max(0, Math.min(chartHeight, pointerY)),
    })
    if (raw) {
      const day = measurementDay(new Date(time).toISOString())
      let nearest: number | null = null
      let distance = Number.POSITIVE_INFINITY
      for (const [index, point] of points.entries()) {
        if (measurementDays[index] !== day) continue
        const candidate = (x(point.time) - pointerX) ** 2 + (y(point.value) - pointerY) ** 2
        if (candidate < distance) {
          nearest = index
          distance = candidate
        }
      }
      setRawIndex(nearest)
    }
  }
  const observedMarkers = useMemo(
    () =>
      (raw || (smoothed && showObserved)) &&
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
      )),
    [raw, smoothed, showObserved, points, x, y, t, metric, format, unit],
  )
  const readingLabel = selected
    ? selected.estimated
      ? t('estimatedPoint', {
          date: inspectionDay,
          value: format(selected.value),
          unit: t(`units.${unit}`),
          from: selected.from,
          to: selected.to,
        })
      : `${smoothed ? t('smoothedValue') : t('readingValue')} · ${t('chartPoint', { date: measurementDay(selected.time), metric: t(`metrics.${metric}`), value: format(selected.value), unit: t(`units.${unit}`), count: selected.count })}`
    : t('actualMissing', { date: inspectionDay })
  const inspectionLabel = `${readingLabel}${planned ? ` · ${targetLabel} ${plannedLabel} ${t(`units.${unit}`)}` : ''}`
  return (
    <div ref={container} className="min-w-0 space-y-3">
      {(selected || planned || activeTime !== null) && (
        <div
          className={tall ? 'min-h-24 space-y-1' : 'min-h-16 space-y-1'}
          aria-live="polite"
          aria-atomic="true"
          data-testid="chart-reading"
        >
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <strong className="text-2xl tabular-nums">
              {selected ? format(selected.value) : t('noData')}{' '}
              <span className="font-normal text-muted-foreground text-sm">
                {t(`units.${unit}`)}
              </span>
            </strong>
            <span className="text-muted-foreground text-xs">
              {raw && selected && selected.timePrecision !== 'date'
                ? new Date(selected.time).toLocaleString(locale, {
                    timeZone: healthTimeZone,
                    hour12: false,
                  })
                : inspectionDay}{' '}
              ·{' '}
              {selected?.estimated
                ? t('gapEstimate')
                : t(selected ? (smoothed ? 'smoothedValue' : 'readingValue') : 'actualCurve')}
            </span>
          </div>
          {selected && (
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
          )}
          {planned && (
            <p
              className="text-emerald-700 [.dark_&]:text-emerald-300 text-sm"
              data-testid="chart-plan-reading"
            >
              {targetLabel} · {plannedLabel} {t(`units.${unit}`)}
              {difference !== null &&
                ` · ${t('planDifference', { value: differenceLabel, unit: differenceUnit })}`}
            </p>
          )}
        </div>
      )}
      {points.length || targets.length ? (
        <>
          <div
            className="relative touch-pan-y select-none"
            onPointerMove={inspectPointer}
            onPointerDown={(event) => {
              event.currentTarget.setPointerCapture(event.pointerId)
              inspectPointer(event)
            }}
            onPointerUp={(event) => {
              if (event.currentTarget.hasPointerCapture(event.pointerId))
                event.currentTarget.releasePointerCapture(event.pointerId)
            }}
            onPointerCancel={() => {
              setActiveTime(null)
              setRawIndex(null)
              setPointer(null)
            }}
            onPointerLeave={(event) => {
              if (event.pointerType === 'mouse') {
                setActiveTime(null)
                setRawIndex(null)
                setPointer(null)
              }
            }}
          >
            {pointer && (
              <div
                className="pointer-events-none absolute z-10 rounded-xl border bg-card/95 p-3 text-xs shadow-lg backdrop-blur-sm"
                style={{
                  width: Math.min(220, width - 16),
                  left: Math.max(
                    8,
                    Math.min(width - Math.min(220, width - 16) - 8, pointer.x + 16),
                  ),
                  top: Math.max(8, Math.min(chartHeight - 176, pointer.y - 140)),
                }}
                aria-hidden="true"
                data-testid="chart-tooltip"
              >
                <p className="font-semibold">{inspectionDay}</p>
                <p className="mt-2 text-blue-700 [.dark_&]:text-blue-300">
                  {t('actualCurve')} ·{' '}
                  {selected ? `${format(selected.value)} ${t(`units.${unit}`)}` : t('noData')}
                  {selected?.estimated && ` · ${t('gapEstimate')}`}
                  {smoothed && selected && !selected.estimated && ` · ${t('smoothedValue')}`}
                </p>
                {smoothed && selected && !selected.estimated && selected.observedValue !== null && (
                  <p className="mt-1 text-muted-foreground">
                    {t('observedMean')} · {format(selected.observedValue)} {t(`units.${unit}`)}
                  </p>
                )}
                {planned && (
                  <p className="mt-1 text-emerald-700 [.dark_&]:text-emerald-300">
                    {targetLabel} · {plannedLabel} {t(`units.${unit}`)}
                  </p>
                )}
                {difference !== null && (
                  <p className="mt-2 text-muted-foreground">
                    {t('planDifference', { value: differenceLabel, unit: differenceUnit })}
                  </p>
                )}
              </div>
            )}
            <svg
              viewBox={`0 0 ${width} ${chartHeight}`}
              className="w-full overflow-visible"
              style={{ height: chartHeight }}
              role="img"
              aria-label={t('trend')}
            >
              <title>{t('trend')}</title>
              {holdRight > holdLeft && (
                <g className="text-amber-500">
                  <rect
                    x={holdLeft}
                    y={plotTop - 12}
                    width={holdRight - holdLeft}
                    height={plotHeight + 12}
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
              {ticks.map((value) => {
                return (
                  <g key={value} className="text-muted-foreground" data-testid="chart-y-tick">
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
                  strokeWidth={planNearest ? 3 : 1.75}
                  data-testid="chart-plan-line"
                  strokeDasharray="5 5"
                  points={targets.map((point) => `${x(point.time)},${y(point.value)}`).join(' ')}
                />
              )}
              {targetNodes.map((point) => (
                <circle
                  key={point.id}
                  className="text-emerald-600 dark:text-emerald-400"
                  cx={x(point.time)}
                  cy={y(point.value)}
                  r="3.5"
                  fill="currentColor"
                  data-testid="chart-target-node"
                />
              ))}
              {!raw &&
                paths.map((path) => (
                  <path
                    key={path.id}
                    data-estimated={path.estimated}
                    d={path.path}
                    fill="none"
                    className="text-blue-600 dark:text-blue-400"
                    stroke="currentColor"
                    strokeWidth={pointer && !planNearest ? 3.5 : 2.5}
                    strokeDasharray={path.estimated ? '5 5' : undefined}
                    strokeLinecap="round"
                    opacity={path.estimated ? 0.65 : 1}
                  />
                ))}
              {observedMarkers}
              {(selected || planned) && Number.isFinite(cursorX) && (
                <g>
                  <line
                    x1={cursorX}
                    x2={cursorX}
                    y1={plotTop - 7}
                    y2={plotBottom}
                    className="text-foreground"
                    stroke="currentColor"
                    strokeDasharray="2 5"
                    opacity="0.3"
                  />
                  {selected && (
                    <circle
                      cx={raw ? x(selected.time) : cursorX}
                      cy={y(selected.value)}
                      r="4"
                      className="text-blue-600 dark:text-blue-400"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill={selected.estimated ? 'var(--card)' : 'currentColor'}
                    />
                  )}
                  {plannedValue !== null && (
                    <circle
                      cx={cursorX}
                      cy={y(plannedValue)}
                      r="4"
                      className="text-emerald-600 dark:text-emerald-400"
                      stroke="currentColor"
                      strokeWidth="2"
                      fill="var(--card)"
                      data-testid="chart-plan-cursor"
                    />
                  )}
                </g>
              )}
              {Array.from({ length: width < 480 ? 3 : 5 }, (_, index) => index).map((index) => {
                const count = width < 480 ? 3 : 5,
                  ratio = index / (count - 1)
                return (
                  <text
                    key={index}
                    x={52 + ratio * (right - 52)}
                    y={chartHeight - 12}
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
          {(raw ? points.length > 1 : lastDay > firstDay) && (
            <input
              className="block h-2 w-full accent-blue-600"
              type="range"
              min="0"
              max={sliderMax}
              value={sliderValue}
              aria-label={t('inspect')}
              aria-valuetext={inspectionLabel}
              onChange={(event) => {
                setPointer(null)
                if (raw) {
                  const index = Number(event.target.value)
                  setRawIndex(index)
                  setActiveTime(Date.parse(points[index]?.time ?? fallbackTime))
                } else setActiveTime(firstDay + Number(event.target.value) * 86400000)
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
