'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  type Measurement,
  type MetricKey,
  measurementDay,
  metricDefinitions,
} from '@/health/contracts'
import { trendPoints } from '@/health/trends'
import { getTargetRange, weightMilestones } from '@/personal/weight-plan'
import { fieldClass, panelClass } from './tracker-toolbar'

export function HealthTrend({
  records,
  plans,
}: {
  records: Measurement[]
  plans: { date: string; targetMin: number; targetMax: number }[]
}) {
  const t = useTranslations('Health')
  const [metric, setMetric] = useState<MetricKey>('weight')
  const [range, setRange] = useState('90')
  const [daily, setDaily] = useState(false)
  const [customFrom, setFrom] = useState('')
  const [customTo, setTo] = useState('')
  const from =
    range === 'custom'
      ? customFrom
      : range === 'all'
        ? ''
        : measurementDay(new Date(Date.now() - (Number(range) - 1) * 86400000).toISOString())
  const to = range === 'custom' ? customTo : ''
  const points = trendPoints(records, metric, daily, from, to)
  const targets =
    metric === 'weight'
      ? weightMilestones
          .filter((row) => (!from || row.date >= from) && (!to || row.date <= to))
          .map((row) => ({ time: `${row.date}T00:00:00+08:00`, value: (row.min + row.max) / 2 }))
      : []
  const timestamps = [...points, ...targets].map((point) => Date.parse(point.time))
  const first = Math.min(...timestamps),
    last = Math.max(...timestamps)
  const values = [...points, ...targets].map((point) => point.value)
  const min = values.length ? Math.floor(Math.min(...values) - 1) : 0,
    max = values.length ? Math.ceil(Math.max(...values) + 1) : 1
  const x = (time: string) => 60 + ((Date.parse(time) - first) / Math.max(last - first, 1)) * 780
  const y = (value: number) => 235 - ((value - min) / Math.max(max - min, 1)) * 205
  const targetFor = (time: string) => {
    const date = measurementDay(time)
    const custom = plans.find((row) => row.date === date)
    const target = custom ? { min: custom.targetMin, max: custom.targetMax } : getTargetRange(date)
    return (target.min + target.max) / 2
  }
  return (
    <section className={`${panelClass} space-y-5`}>
      <h2 className="font-bold text-2xl">{t('trend')}</h2>
      <div className="grid gap-4 sm:grid-cols-3">
        <label>
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
        <label>
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
        <label>
          {t('aggregation')}
          <select
            className={fieldClass}
            value={daily ? 'daily' : 'raw'}
            onChange={(event) => setDaily(event.target.value === 'daily')}
          >
            <option value="raw">{t('raw')}</option>
            <option value="daily">{t('daily')}</option>
          </select>
        </label>
        {range === 'custom' && (
          <>
            <label>
              {t('from')}
              <input
                className={fieldClass}
                type="date"
                value={customFrom}
                max={customTo || undefined}
                onChange={(e) => setFrom(e.target.value)}
              />
            </label>
            <label>
              {t('to')}
              <input
                className={fieldClass}
                type="date"
                value={customTo}
                min={customFrom || undefined}
                onChange={(e) => setTo(e.target.value)}
              />
            </label>
          </>
        )}
      </div>
      <p className="text-muted-foreground text-sm">{t(daily ? 'dailyHelp' : 'rawHelp')}</p>
      {points.length ? (
        <div className="overflow-x-auto">
          <svg
            viewBox="0 0 900 280"
            className="w-full min-w-[500px]"
            role="img"
            aria-label={t('trend')}
          >
            <title>{t('trend')}</title>
            {[0, 1, 2, 3, 4].map((tick) => {
              const value = min + ((max - min) * tick) / 4
              return (
                <g key={tick}>
                  <line
                    x1="60"
                    x2="840"
                    y1={y(value)}
                    y2={y(value)}
                    stroke="currentColor"
                    opacity="0.12"
                  />
                  <text x="50" y={y(value) + 4} textAnchor="end" fill="currentColor" fontSize="12">
                    {value.toFixed(1)}
                  </text>
                </g>
              )
            })}
            {metric === 'weight' && (
              <polyline
                fill="none"
                stroke="#059669"
                strokeDasharray="5 4"
                points={[
                  ...targets,
                  ...points.map((row) => ({ time: row.time, value: targetFor(row.time) })),
                ]
                  .sort((a, b) => Date.parse(a.time) - Date.parse(b.time))
                  .map((row) => `${x(row.time)},${y(row.value)}`)
                  .join(' ')}
              />
            )}
            <polyline
              fill="none"
              stroke="#3b82f6"
              strokeWidth="2"
              points={points.map((point) => `${x(point.time)},${y(point.value)}`).join(' ')}
            />
            {points.map((point) => (
              <circle key={point.id} cx={x(point.time)} cy={y(point.value)} r="4" fill="#3b82f6">
                <title>{`${measurementDay(point.time)} ${point.value.toFixed(2)} · ${t('samples', { count: point.count })}`}</title>
              </circle>
            ))}
            <text x="60" y="265" fill="currentColor" fontSize="12">
              {measurementDay(new Date(first).toISOString())}
            </text>
            <text x="840" y="265" textAnchor="end" fill="currentColor" fontSize="12">
              {measurementDay(new Date(last).toISOString())}
            </text>
          </svg>
        </div>
      ) : (
        <p>{t('noData')}</p>
      )}
      {metric === 'weight' && (
        <p className="text-sm text-emerald-600 dark:text-emerald-400">{t('targetCurve')}</p>
      )}
    </section>
  )
}
