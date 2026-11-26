'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import type { BodyTargetPlan, Measurement } from '@/health/contracts'
import { displayMetricDefinitions } from '@/health/display-metrics'
import { bodyTargetMetrics } from '@/health/plan'
import { metricSeries } from '@/health/trends'
import { panelClass } from './tracker-toolbar'

export function HealthTargetTable({
  targets,
  records,
}: {
  targets: BodyTargetPlan
  records: Measurement[]
}) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const [selectedDate, setSelectedDate] = useState<string>()
  const baseline = targets.points[0]
  const selected = targets.points.find((point) => point.date === selectedDate)
  const smartscale = records.filter((row) => row.source === 'smartscale' && !row.excluded)
  if (!baseline) return null
  const number = new Intl.NumberFormat(locale, { maximumFractionDigits: 2 })
  const signed = new Intl.NumberFormat(locale, {
    maximumFractionDigits: 2,
    signDisplay: 'exceptZero',
  })

  return (
    <section className={`${panelClass} space-y-4`}>
      <div className="space-y-1">
        <h2 className="font-bold text-xl">{t('bodyTargets.title')}</h2>
        <p className="text-muted-foreground text-sm">
          {t('bodyTargets.version', { date: targets.versionDate })}
        </p>
        <p className="text-muted-foreground text-sm">
          {t('bodyTargets.help', { date: baseline.date })}
        </p>
      </div>
      <div className="overflow-x-auto">
        <table className="w-full whitespace-nowrap text-left text-sm">
          <thead>
            <tr className="border-b text-muted-foreground">
              <th scope="col" className="px-3 py-2">
                {t('bodyTargets.date')}
              </th>
              {bodyTargetMetrics.slice(0, 4).map((key) => (
                <th key={key} scope="col" className="px-3 py-2">
                  {t(`metrics.${key}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {targets.points.map((point) => (
              <tr key={point.date} className="border-b last:border-0">
                <th scope="row" className="px-3 py-2 font-normal">
                  <button
                    type="button"
                    className="text-primary underline underline-offset-4"
                    aria-expanded={selected?.date === point.date}
                    aria-controls="body-target-detail"
                    onClick={() =>
                      setSelectedDate(selected?.date === point.date ? undefined : point.date)
                    }
                  >
                    {point.date}
                  </button>
                </th>
                {bodyTargetMetrics.slice(0, 4).map((key) => (
                  <td key={key} className="px-3 py-2 tabular-nums">
                    {number.format(point[key])}{' '}
                    {t(key === 'bodyFat' ? 'units.percent' : 'units.kg')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div id="body-target-detail" className="overflow-x-auto">
        {selected && (
          <table className="w-full whitespace-nowrap text-left text-sm">
            <caption className="mb-2 text-left font-semibold">{selected.date}</caption>
            <thead>
              <tr className="border-b text-muted-foreground">
                {(
                  [
                    'metric',
                    'targetLabel',
                    'bodyTargets.baselineChange',
                    'bodyTargets.scaleMean',
                    'bodyTargets.difference',
                  ] as const
                ).map((label) => (
                  <th key={label} scope="col" className="px-3 py-2">
                    {t(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {bodyTargetMetrics.map((key) => {
                const unit =
                  displayMetricDefinitions.find((metric) => metric.key === key)?.unit ?? 'index'
                const suffix = t(`units.${unit}`)
                const deltaSuffix = unit === 'percent' ? t('units.percentagePoints') : suffix
                const actual = metricSeries(
                  smartscale,
                  key,
                  'daily',
                  selected.date,
                  selected.date,
                )[0]?.value
                return (
                  <tr key={key} className="border-b tabular-nums last:border-0">
                    <th scope="row" className="px-3 py-2 font-normal">
                      {t(`metrics.${key}`)}
                    </th>
                    <td className="px-3 py-2">
                      {number.format(selected[key])} {suffix}
                    </td>
                    <td className="px-3 py-2">
                      {signed.format(selected[key] - baseline[key])} {deltaSuffix}
                    </td>
                    <td className="px-3 py-2">
                      {actual === undefined ? t('noData') : `${number.format(actual)} ${suffix}`}
                    </td>
                    <td className="px-3 py-2">
                      {actual === undefined
                        ? '—'
                        : `${signed.format(actual - selected[key])} ${deltaSuffix}`}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  )
}
