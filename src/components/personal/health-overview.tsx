'use client'

import { Activity, ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { timeSeriesCurve } from '@/health/chart'
import {
  type Measurement,
  measurementDay,
  metricDefinitions,
  type OwnerHealthSnapshot,
} from '@/health/contracts'
import { metricSeries } from '@/health/trends'
import { panelClass } from './tracker-toolbar'

export function HealthOverview({ snapshot }: { snapshot: OwnerHealthSnapshot }) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const today = measurementDay(new Date().toISOString())
  const from = measurementDay(new Date(Date.now() - 29 * 86400000).toISOString())
  const format = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const weightDays = metricSeries(
    snapshot.measurements,
    'weight',
    'daily',
    measurementDay(new Date(Date.now() - 6 * 86400000).toISOString()),
    today,
  )
  const average = weightDays.length
    ? weightDays.reduce((sum, point) => sum + point.value, 0) / weightDays.length
    : null
  const latestWeight = snapshot.measurements.find(
    (row) => !row.excluded && row.weight !== null,
  )?.weight
  return (
    <section className="space-y-4" aria-label={t('overview')}>
      <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
        {(
          [
            'weight',
            'bodyFat',
            'muscleMass',
            'waist',
            'bmi',
            'bodyWater',
            'visceralFat',
            'basalMetabolism',
          ] as const
        ).map((metric) => {
          const latest: Measurement | undefined = snapshot.measurements.find(
            (row) => !row.excluded && row[metric] !== null,
          )
          const points = metricSeries(snapshot.measurements, metric, 'smooth', from, today)
          const first = points[0],
            last = points.at(-1)
          const change =
            points.length > 1 && first && last
              ? (last.observedValue ?? last.value) - (first.observedValue ?? first.value)
              : null
          const min = Math.min(...points.map((point) => point.value))
          const max = Math.max(...points.map((point) => point.value))
          const start = Date.parse(first?.time ?? today)
          const duration = Math.max(Date.parse(last?.time ?? today) - start, 86400000)
          const unit =
            metricDefinitions.find((definition) => definition.key === metric)?.unit ?? 'kg'
          const Icon =
            change === null || change === 0 ? Minus : change < 0 ? ArrowDownRight : ArrowUpRight
          return (
            <article key={metric} className="min-w-0 rounded-2xl border bg-card p-4 sm:p-5">
              <h2 className="font-medium text-muted-foreground text-sm">
                {t(`metrics.${metric}`)}
              </h2>
              <p className="mt-3 break-words font-semibold text-3xl tabular-nums tracking-tight">
                {format(latest?.[metric])}{' '}
                <span className="font-normal text-muted-foreground text-xs">
                  {t(`units.${unit}`)}
                </span>
              </p>
              <p className="mt-1 min-h-4 text-muted-foreground text-xs">
                {latest ? measurementDay(latest.measuredAt) : t('noData')}
              </p>
              <svg
                viewBox="0 0 160 36"
                className="mt-4 h-9 w-full text-blue-600 dark:text-blue-400"
                aria-hidden="true"
              >
                {timeSeriesCurve(points).map((segment) => {
                  const x = (time: number) => 3 + ((time - start) / duration) * 154
                  const y = (value: number) => 30 - ((value - min) / Math.max(max - min, 0.1)) * 24
                  return (
                    <path
                      key={segment.start.x}
                      d={`M${x(segment.start.x)},${y(segment.start.y)} C${x(segment.control1.x)},${y(segment.control1.y)} ${x(segment.control2.x)},${y(segment.control2.y)} ${x(segment.end.x)},${y(segment.end.y)}`}
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeDasharray={
                        segment.end.x - segment.start.x > 86400000 ? '3 3' : undefined
                      }
                      strokeLinecap="round"
                    />
                  )
                })}
                {points.length === 1 && <circle cx="3" cy="30" r="2.5" fill="currentColor" />}
              </svg>
              <p className="mt-3 flex flex-wrap items-center gap-x-1 text-xs">
                <Icon className="size-3.5 shrink-0" aria-hidden="true" />
                <span className="tabular-nums">
                  {change !== null && change > 0 ? '+' : ''}
                  {format(change)}
                </span>
                <span className="text-muted-foreground">{t('recentChange')}</span>
              </p>
            </article>
          )
        })}
      </div>
      <div className={`${panelClass} grid gap-5 sm:grid-cols-2 lg:grid-cols-4`}>
        <div>
          <p className="text-muted-foreground text-xs">{t('average7')}</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {format(average)} <span className="text-sm">{t('units.kg')}</span>
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {t('effectiveDays', { count: weightDays.length })}
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t('checkpoint')}</p>
          <p className="mt-1 font-semibold text-xl">
            {format(snapshot.plan.goalWeight)} <span className="text-sm">{t('units.kg')}</span>
          </p>
          <p className="mt-1 text-muted-foreground text-xs">{snapshot.plan.endDate}</p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t('remaining')}</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {format(average === null ? null : average - snapshot.plan.goalWeight)}{' '}
            <span className="text-sm">{t('units.kg')}</span>
          </p>
        </div>
        <div>
          <p className="text-muted-foreground text-xs">{t('relativeStart')}</p>
          <p className="mt-1 font-semibold text-xl tabular-nums">
            {format(
              latestWeight === null || latestWeight === undefined
                ? null
                : latestWeight - snapshot.plan.startWeight,
            )}{' '}
            <span className="text-sm">{t('units.kg')}</span>
          </p>
          <p className="mt-1 text-muted-foreground text-xs">
            {snapshot.plan.startDate} · {snapshot.plan.startWeight} {t('units.kg')}
          </p>
        </div>
      </div>
      <div className="flex flex-wrap gap-x-5 gap-y-2 px-1 text-muted-foreground text-xs">
        <span className="flex items-center gap-1.5">
          <Activity className="size-3.5" aria-hidden="true" />
          {t('lastSync')} ·{' '}
          {snapshot.sync.lastSuccessAt
            ? new Date(snapshot.sync.lastSuccessAt).toLocaleString(locale, {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })
            : t('noData')}
        </span>
        <span>
          {t('sourceUpdated')} ·{' '}
          {snapshot.sync.sourceUpdatedAt
            ? new Date(snapshot.sync.sourceUpdatedAt).toLocaleString(locale, {
                timeZone: 'Asia/Shanghai',
                hour12: false,
              })
            : t('noData')}
        </span>
        {snapshot.sync.lastError && (
          <p role="status" className="text-amber-700 dark:text-amber-400">
            {t('syncFailed')}
          </p>
        )}
      </div>
    </section>
  )
}
