'use client'

import { useLocale, useTranslations } from 'next-intl'
import type { HealthPlan, Measurement } from '@/health/contracts'
import { metricSeries } from '@/health/trends'
import { panelClass } from './tracker-toolbar'

export function HealthStagePlan({ plan, records }: { plan: HealthPlan; records: Measurement[] }) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const dayBefore = (day: string) => new Date(Date.parse(day) - 86400000).toISOString().slice(0, 10)
  const dayAfter = (day: string) => new Date(Date.parse(day) + 86400000).toISOString().slice(0, 10)
  const format = (value: number) =>
    new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const phases = [
    {
      key: 'phaseInitial',
      from: plan.startDate,
      to: dayBefore(plan.holdStart),
      target:
        plan.targets.find((point) => point.date === plan.holdStart)?.targetMin ?? plan.startWeight,
    },
    {
      key: 'phaseHold',
      from: plan.holdStart,
      to: plan.holdEnd,
      target:
        plan.targets.find((point) => point.date === plan.holdStart)?.targetMin ?? plan.startWeight,
    },
    { key: 'phaseLoss', from: dayAfter(plan.holdEnd), to: plan.endDate, target: plan.goalWeight },
    { key: 'phaseLongTerm', from: dayAfter(plan.endDate), to: '', target: plan.longTermWeight },
  ] as const
  const pace =
    (phases[2].target - phases[1].target) /
    ((Date.parse(plan.endDate) - Date.parse(phases[2].from)) / 86400000 / 7)
  return (
    <section className={`${panelClass} space-y-4`}>
      <h2 className="font-bold text-xl">{t('stagePlan')}</h2>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {phases.map((phase) => {
          const points = metricSeries(records, 'weight', 'daily', phase.from, phase.to)
          const first = points[0],
            last = points.at(-1)
          return (
            <article
              key={phase.key}
              className={`rounded-xl border p-4 ${phase.key === 'phaseHold' ? 'border-amber-500/25 bg-amber-500/5' : 'bg-muted/25'}`}
            >
              <h3 className="font-medium text-sm">{t(phase.key)}</h3>
              <p className="mt-2 text-muted-foreground text-xs">
                {phase.from} – {phase.to || t('pendingDate')}
              </p>
              <p className="mt-4 font-semibold text-2xl tabular-nums">
                {format(phase.target)}{' '}
                <span className="font-normal text-muted-foreground text-sm">{t('units.kg')}</span>
              </p>
              <p className="mt-3 text-muted-foreground text-xs">
                {t('phaseChange')} ·{' '}
                {points.length > 1 && first && last
                  ? `${last.value > first.value ? '+' : ''}${format(last.value - first.value)} ${t('units.kg')}`
                  : '—'}
              </p>
              <p className="mt-1 text-muted-foreground text-xs">
                {t('phaseSamples', { count: points.length })}
              </p>
            </article>
          )
        })}
      </div>
      <p className="text-muted-foreground text-xs leading-5">
        {t('plannedPace', { value: format(Math.abs(pace)) })} · {t('planRevisionHelp')}
      </p>
    </section>
  )
}

export function HealthLifestylePlan() {
  const t = useTranslations('HealthPlan')
  return (
    <details className={panelClass}>
      <summary className="cursor-pointer font-semibold text-lg">{t('planTitle')}</summary>
      <div className="mt-5 grid gap-4 md:grid-cols-3">
        {(['summer', 'school', 'rest'] as const).map((kind) => (
          <article key={kind} className="rounded-xl border p-4">
            <h3 className="font-medium">{t(`${kind}Plan`)}</h3>
            <dl className="mt-4 space-y-4">
              {(['Calories', 'Activity', 'Meals'] as const).map((item) => (
                <div key={item}>
                  <dt className="text-muted-foreground text-xs">
                    {t(
                      item === 'Calories' ? 'calories' : item === 'Activity' ? 'activity' : 'meals',
                    )}
                  </dt>
                  <dd className="mt-1 text-sm leading-6">{t(`${kind}${item}`)}</dd>
                </div>
              ))}
            </dl>
          </article>
        ))}
      </div>
      <aside className="mt-5 rounded-xl bg-amber-500/5 p-4 text-sm leading-6">
        <h3 className="font-medium">{t('healthTitle')}</h3>
        <p className="mt-2 text-muted-foreground">{t('healthBody')}</p>
        <a
          className="mt-2 inline-block text-primary underline underline-offset-4"
          href="https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html"
          target="_blank"
          rel="noreferrer"
        >
          {t('healthSource')}
        </a>
      </aside>
    </details>
  )
}
