'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  type HealthPlan,
  type Measurement,
  type MetricKey,
  measurementDay,
  metricDefinitions,
} from '@/health/contracts'
import { targetAt } from '@/health/plan'
import {
  metricSeries,
  type SmoothingWindow,
  smoothingWindows,
  type TrendMode,
  type TrendPoint,
} from '@/health/trends'
import { MeasurementChart } from './measurement-chart'
import { fieldClass, panelClass } from './tracker-toolbar'

export function HealthTrend({
  records,
  plan,
  initialWindow,
}: {
  records: Measurement[]
  plan: HealthPlan
  initialWindow: { from: string; to: string } | null
}) {
  const t = useTranslations('Health')
  const [metric, setMetric] = useState<MetricKey>('weight')
  const [range, setRange] = useState(initialWindow ? 'custom' : '90')
  const [mode, setMode] = useState<TrendMode>('smooth')
  const [customFrom, setFrom] = useState(initialWindow?.from ?? '')
  const [customTo, setTo] = useState(initialWindow?.to ?? '')
  const [fullPlan, setFullPlan] = useState(false)
  const [smoothing, setSmoothing] = useState<SmoothingWindow>(14)
  const [showObserved, setShowObserved] = useState(true)
  const from =
    range === 'custom'
      ? customFrom
      : range === 'all'
        ? ''
        : measurementDay(new Date(Date.now() - (Number(range) - 1) * 86400000).toISOString())
  const to = range === 'custom' ? customTo : measurementDay(new Date().toISOString())
  const points = metricSeries(records, metric, mode, from, to, smoothing)
  const actualFrom = from || measurementDay(points[0]?.time ?? new Date().toISOString())
  const actualTo =
    range === 'custom' && customTo
      ? customTo
      : measurementDay(points.at(-1)?.time ?? new Date().toISOString())
  const domain =
    fullPlan && metric === 'weight'
      ? {
          from: actualFrom < plan.startDate ? actualFrom : plan.startDate,
          to: actualTo > plan.endDate ? actualTo : plan.endDate,
        }
      : { from: actualFrom, to: actualTo < actualFrom ? actualFrom : actualTo }
  const dates = [
    ...new Set([domain.from, domain.to, ...plan.targets.map((point) => point.date)]),
  ].sort()
  const targets: TrendPoint[] =
    metric === 'weight'
      ? dates.flatMap((day) => {
          const target = targetAt(plan, day)
          return target && day >= domain.from && day <= domain.to
            ? [
                {
                  id: day,
                  time: `${day}T00:00:00+08:00`,
                  value: (target.min + target.max) / 2,
                  count: 0,
                },
              ]
            : []
        })
      : []
  return (
    <section id="health-trend" className={`${panelClass} min-w-0 space-y-5 scroll-mt-28`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-bold text-xl">{t('trend')}</h2>
        <div className="flex flex-wrap gap-x-4 gap-y-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-2">
            <span className="h-0.5 w-5 bg-blue-600 dark:bg-blue-400" />
            {t(mode === 'smooth' ? 'smooth' : 'actualCurve')}
          </span>
          {mode !== 'raw' && (
            <span className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-blue-500 border-dashed" />
              {t('gapEstimate')}
            </span>
          )}
          {mode === 'smooth' && showObserved && (
            <span className="flex items-center gap-2">
              <span className="size-1.5 rounded-full bg-blue-500/30" />
              {t('observedMean')}
            </span>
          )}
          {metric === 'weight' && (
            <span className="flex items-center gap-2">
              <span className="w-5 border-t-2 border-emerald-600 border-dashed dark:border-emerald-400" />
              {t('targetLabel')}
            </span>
          )}
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-1 text-sm">
          {t('metric')}
          <select
            className={fieldClass}
            value={metric}
            onChange={(event) => {
              const selected = metricDefinitions.find((row) => row.key === event.target.value)
              if (selected) setMetric(selected.key)
            }}
          >
            {metricDefinitions.map(({ key }) => (
              <option key={key} value={key}>
                {t(`metrics.${key}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          {t('range')}
          <select
            className={fieldClass}
            value={range}
            onChange={(event) => setRange(event.target.value)}
          >
            {(['7', '30', '90', 'all', 'custom'] as const).map((value) => (
              <option key={value} value={value}>
                {t(`ranges.${value}`)}
              </option>
            ))}
          </select>
        </label>
        <label className="space-y-1 text-sm">
          {t('aggregation')}
          <select
            className={fieldClass}
            value={mode}
            onChange={(event) => {
              const value = event.target.value
              if (value === 'raw' || value === 'daily' || value === 'rolling' || value === 'smooth')
                setMode(value)
            }}
          >
            {(['smooth', 'raw', 'daily', 'rolling'] as const).map((value) => (
              <option key={value} value={value}>
                {t(value)}
              </option>
            ))}
          </select>
        </label>
        {mode === 'smooth' && (
          <label className="space-y-1 text-sm">
            {t('smoothingWindow')}
            <select
              className={fieldClass}
              value={smoothing}
              onChange={(event) => {
                const selected = smoothingWindows.find(
                  (window) => window === Number(event.target.value),
                )
                if (selected) setSmoothing(selected)
              }}
            >
              {smoothingWindows.map((days) => (
                <option key={days} value={days}>
                  {t('smoothingDays', { count: days })}
                </option>
              ))}
            </select>
          </label>
        )}
        {range === 'custom' && (
          <>
            <label className="space-y-1 text-sm">
              {t('from')}
              <input
                className={fieldClass}
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(event) => setFrom(event.target.value)}
              />
            </label>
            <label className="space-y-1 text-sm">
              {t('to')}
              <input
                className={fieldClass}
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(event) => setTo(event.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-3">
        {mode === 'smooth' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={showObserved}
              onChange={(event) => setShowObserved(event.target.checked)}
            />
            {t('showObserved')}
          </label>
        )}
        {metric === 'weight' && (
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={fullPlan}
              onChange={(event) => setFullPlan(event.target.checked)}
            />
            {t('fullPlan')}
          </label>
        )}
      </div>
      <MeasurementChart
        key={`${metric}:${mode}:${from}:${to}:${fullPlan}:${smoothing}`}
        points={points}
        targets={targets}
        metric={metric}
        raw={mode === 'raw'}
        rolling={mode === 'rolling'}
        smoothed={mode === 'smooth'}
        showObserved={showObserved}
        domain={domain}
        hold={{ from: plan.holdStart, to: plan.holdEnd }}
      />
      <p className="text-muted-foreground text-xs leading-5">
        {mode === 'smooth'
          ? t('smoothHelp', { days: smoothing })
          : t(mode === 'raw' ? 'rawHelp' : mode === 'daily' ? 'dailyHelp' : 'rollingHelp')}{' '}
        {t('curveHelp')}
      </p>
    </section>
  )
}
