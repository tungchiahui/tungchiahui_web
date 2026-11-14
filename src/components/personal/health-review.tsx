'use client'

import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { type Measurement, measurementDay } from '@/health/contracts'
import { measurementCalendar, periodStart, periodSummaries } from '@/health/trends'
import { panelClass } from './tracker-toolbar'

export function HealthReview({
  records,
  inspect,
}: {
  records: Measurement[]
  inspect: (from: string, to: string) => void
}) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const [period, setPeriod] = useState<'week' | 'month'>('week')
  const [visible, setVisible] = useState(12)
  const summaries = periodSummaries(records, period).toReversed()
  const weeks = periodSummaries(records, 'week')
  const today = measurementDay(new Date().toISOString())
  const currentWeek = Date.parse(periodStart(today, 'week'))
  const bars = Array.from({ length: 12 }, (_, index) => {
    const day = new Date(currentWeek - (11 - index) * 7 * 86400000).toISOString().slice(0, 10)
    return { day, summary: weeks.find((week) => week.start === day) }
  })
  const maxChange = Math.max(0.5, ...bars.map((bar) => Math.abs(bar.summary?.change ?? 0)))
  const calendar = measurementCalendar(records, today)
  const format = (value: number | null) =>
    value === null ? '—' : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  return (
    <section className="space-y-4" aria-labelledby="health-review-title">
      <div className="grid min-w-0 gap-4 lg:grid-cols-2">
        <article className={`${panelClass} min-w-0`}>
          <h2 className="font-bold text-xl">{t('weeklyChange')}</h2>
          <p className="mt-2 text-muted-foreground text-xs leading-5">{t('weeklyChangeHelp')}</p>
          <fieldset
            className="relative mt-6 flex h-40 min-w-0 gap-1.5 border-b"
            aria-label={t('weeklyChange')}
          >
            <div className="pointer-events-none absolute inset-x-0 top-1/2 border-t border-dashed" />
            {bars.map(({ day, summary }, index) => (
              <div key={day} className="relative flex min-w-0 flex-1 flex-col items-center">
                <button
                  type="button"
                  disabled={!summary}
                  aria-label={`${day} · ${format(summary?.change ?? null)} ${t('units.kg')}`}
                  title={`${day} · ${format(summary?.change ?? null)} ${t('units.kg')}`}
                  onClick={() => summary && inspect(summary.start, summary.end)}
                  className="relative h-full w-full rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
                >
                  {summary?.change !== null && summary?.change !== undefined && (
                    <span
                      className={`absolute inset-x-0 mx-auto w-full max-w-6 rounded-sm ${summary.change <= 0 ? 'bg-blue-500/80 dark:bg-blue-400/80' : 'bg-amber-500/80'}`}
                      style={{
                        height: `${Math.max(1, (Math.abs(summary.change) / maxChange) * 45)}%`,
                        ...(summary.change <= 0 ? { top: '50%' } : { bottom: '50%' }),
                      }}
                    />
                  )}
                </button>
                {index % 3 === 0 && (
                  <span className="absolute top-full mt-2 whitespace-nowrap text-[10px] text-muted-foreground">
                    {day.slice(5)}
                  </span>
                )}
              </div>
            ))}
          </fieldset>
          <div className="mt-9 flex gap-4 text-muted-foreground text-xs">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-blue-500" />
              {t('down')}
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-sm bg-amber-500" />
              {t('up')}
            </span>
          </div>
        </article>
        <article className={`${panelClass} min-w-0`}>
          <h2 className="font-bold text-xl">{t('calendar')}</h2>
          <p className="mt-2 text-muted-foreground text-xs leading-5">{t('calendarHelp')}</p>
          <fieldset
            className="mt-6 grid min-w-0 grid-flow-col grid-cols-[repeat(13,minmax(0,1fr))] grid-rows-7 gap-1.5"
            aria-label={t('calendar')}
          >
            {calendar.map(({ day, count, future }) => (
              <button
                key={day}
                type="button"
                disabled={future || count === 0}
                title={t('calendarDay', { date: day, count })}
                aria-label={t('calendarDay', { date: day, count })}
                onClick={() => inspect(day, day)}
                className={`aspect-square max-h-6 w-full rounded-sm outline-none focus-visible:ring-2 focus-visible:ring-primary ${future ? 'invisible' : count === 0 ? 'bg-muted' : count === 1 ? 'bg-blue-300 dark:bg-blue-800' : count < 4 ? 'bg-blue-500 dark:bg-blue-600' : 'bg-blue-700 dark:bg-blue-400'}`}
              />
            ))}
          </fieldset>
          <div className="mt-3 flex justify-between text-muted-foreground text-[10px]">
            <span>{calendar[0]?.day}</span>
            <span>{today}</span>
          </div>
          <div className="mt-3 flex items-center justify-end gap-1.5 text-muted-foreground text-xs">
            <span>{t('less')}</span>
            <span className="size-2.5 rounded-sm bg-muted" />
            <span className="size-2.5 rounded-sm bg-blue-300 dark:bg-blue-800" />
            <span className="size-2.5 rounded-sm bg-blue-500" />
            <span className="size-2.5 rounded-sm bg-blue-700 dark:bg-blue-400" />
            <span>{t('moreSamples')}</span>
          </div>
        </article>
      </div>
      <article className={`${panelClass} min-w-0 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="health-review-title" className="font-bold text-xl">
            {t('review')}
          </h2>
          <div className="flex gap-1 rounded-lg bg-muted p-1">
            {(['week', 'month'] as const).map((value) => (
              <button
                key={value}
                type="button"
                aria-pressed={period === value}
                className={`rounded-md px-3 py-1.5 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary ${period === value ? 'bg-card shadow-sm' : 'text-muted-foreground'}`}
                onClick={() => {
                  setPeriod(value)
                  setVisible(12)
                }}
              >
                {t(value)}
              </button>
            ))}
          </div>
        </div>
        <p className="text-muted-foreground text-xs leading-5">{t('reviewHelp')}</p>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(['period', 'days', 'averageWeight', 'periodChange', 'averageFat'] as const).map(
                  (key) => (
                    <th
                      key={key}
                      className="whitespace-nowrap border-b px-3 py-3 font-medium text-muted-foreground"
                    >
                      {t(key)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {summaries.slice(0, visible).map((summary) => (
                <tr key={summary.start} className="hover:bg-muted/40">
                  <td className="whitespace-nowrap border-b px-3 py-3">
                    <button
                      className="text-left text-primary underline-offset-4 hover:underline"
                      type="button"
                      onClick={() => inspect(summary.start, summary.end)}
                    >
                      {summary.start} – {summary.end}
                    </button>
                  </td>
                  <td className="border-b px-3 py-3 tabular-nums">{summary.days}</td>
                  <td className="border-b px-3 py-3 tabular-nums">
                    {format(summary.weight)} {t('units.kg')}
                  </td>
                  <td className="border-b px-3 py-3 tabular-nums">
                    {summary.change !== null && summary.change > 0 ? '+' : ''}
                    {format(summary.change)} {t('units.kg')}
                  </td>
                  <td className="border-b px-3 py-3 tabular-nums">
                    {format(summary.bodyFat)} {t('units.percent')}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!summaries.length && <p className="text-muted-foreground text-sm">{t('noData')}</p>}
        {summaries.length > visible && (
          <Button onClick={() => setVisible((old) => old + 12)}>{t('more')}</Button>
        )}
      </article>
    </section>
  )
}
