'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import {
  type DatasetSnapshot,
  emptyWeightPayload,
  type WeightPayload,
  type WeightRecord,
  weightLossPayloadSchema,
} from '@/personal/contracts'
import { exportWeightCsv, importWeightCsv } from '@/personal/weight-csv'
import {
  createWeeklyRecords,
  GOAL_WEIGHT,
  START_WEIGHT,
  weightMilestones,
} from '@/personal/weight-plan'
import { fieldClass, panelClass, TrackerToolbar } from './tracker-toolbar'
import { useOwnerDataset } from './use-owner-dataset'

const planned = createWeeklyRecords()
const metricFields = [
  { field: 'weight', label: 'averageWeight', min: 35, max: 250, unit: 'weightUnit' },
  { field: 'bodyFat', label: 'bodyFat', min: 2, max: 70, unit: 'percentUnit' },
  { field: 'muscleMass', label: 'muscleMass', min: 10, max: 100, unit: 'weightUnit' },
  { field: 'waist', label: 'waist', min: 40, max: 200, unit: 'waistUnit' },
] as const

export function WeightTracker({ initial }: { initial: DatasetSnapshot<WeightPayload> }) {
  const t = useTranslations('Weight')
  const store = useOwnerDataset('weight_loss', weightLossPayloadSchema, initial)
  const [selected, setSelected] = useState(planned[0]?.date ?? '')
  const map = new Map(planned.map((record) => [record.date, record]))
  for (const record of store.payload.records) map.set(record.date, record)
  const records = [...map.values()].sort((a, b) => a.date.localeCompare(b.date))
  const active = records.find((record) => record.date === selected) ?? records[0]
  const measured = records.filter(
    (record) => record.weight !== '' && Number.isFinite(Number(record.weight)),
  )
  const latest = measured.at(-1)
  const latestWeight = latest ? Number(latest.weight) : null
  const progress =
    latestWeight === null
      ? 0
      : Math.max(
          0,
          Math.min(100, ((START_WEIGHT - latestWeight) / (START_WEIGHT - GOAL_WEIGHT)) * 100),
        )
  const next =
    weightMilestones.find((item) => item.date > (latest?.date ?? records[0]?.date ?? '')) ??
    weightMilestones.at(-1)
  const comparison = (record: WeightRecord) =>
    record.weight === ''
      ? t('statusPending')
      : Number(record.weight) < record.targetMin
        ? t('statusAhead')
        : Number(record.weight) <= record.targetMax
          ? t('statusOnTarget')
          : t('statusBehind', { difference: (Number(record.weight) - record.targetMax).toFixed(1) })
  const update = (field: 'weight' | 'bodyFat' | 'muscleMass' | 'waist' | 'note', value: string) => {
    if (!active) return
    const edited = { ...active, [field]: value }
    const nextRecords = new Map(store.payload.records.map((record) => [record.date, record]))
    nextRecords.set(edited.date, edited)
    store.change({
      version: 2,
      records: [...nextRecords.values()].sort((a, b) => a.date.localeCompare(b.date)),
    })
  }
  const values = [
    ...records.flatMap((record) => [record.targetMin, record.targetMax]),
    ...measured.map((record) => Number(record.weight)),
  ]
  const min = Math.floor(Math.min(...values) - 2),
    max = Math.ceil(Math.max(...values) + 2)
  const startDate = Date.parse(`${records[0]?.date}T00:00:00Z`)
  const endDate = Date.parse(`${records.at(-1)?.date}T00:00:00Z`)
  const x = (date: string) =>
    50 + ((Date.parse(`${date}T00:00:00Z`) - startDate) / Math.max(1, endDate - startDate)) * 830
  const y = (value: number) => 260 - ((value - min) / Math.max(1, max - min)) * 225
  return (
    <>
      <header className={`${panelClass} mb-6 bg-gradient-to-br from-blue-500/10 to-card`}>
        <p className="text-primary text-sm">{t('eyebrow')}</p>
        <h1 className="mt-3 font-bold text-3xl sm:text-4xl">{t('title')}</h1>
        <p className="mt-4 text-muted-foreground leading-7">{t('intro')}</p>
        <dl className="mt-6 grid grid-cols-2 gap-5 sm:grid-cols-4">
          {(
            [
              [t('startWeight'), `${START_WEIGHT} kg`],
              [t('firstGoal'), '90 kg'],
              [t('finalGoal'), `${GOAL_WEIGHT} kg`],
              [t('planDuration'), `${planned.length - 1} ${t('weeks')}`],
            ] as const
          ).map(([label, value]) => (
            <div key={label}>
              <dt className="text-muted-foreground text-sm">{label}</dt>
              <dd className="mt-2 font-bold text-2xl">{value}</dd>
            </div>
          ))}
        </dl>
      </header>
      <TrackerToolbar
        store={store}
        schema={weightLossPayloadSchema}
        empty={emptyWeightPayload}
        filename="weight-loss"
        importCsv={importWeightCsv}
        exportCsv={exportWeightCsv}
      />
      <dl className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {(
          [
            [
              t('currentWeight'),
              latestWeight === null ? t('noRecord') : `${latestWeight.toFixed(1)} kg`,
            ],
            [
              t('totalChange'),
              latestWeight === null
                ? t('noRecord')
                : `${(latestWeight - START_WEIGHT).toFixed(1)} kg`,
            ],
            [t('goalProgress'), `${Math.round(progress)}%`],
            [t('nextMilestone'), next ? `${next.min}–${next.max} kg` : t('noRecord')],
          ] as const
        ).map(([label, value]) => (
          <div key={label} className={panelClass}>
            <dt className="text-muted-foreground text-sm">{label}</dt>
            <dd className="mt-2 font-bold text-2xl tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      <aside className={`${panelClass} mb-6 border-amber-500/40`}>
        <h2 className="font-semibold">{t('healthTitle')}</h2>
        <p className="mt-2 text-muted-foreground text-sm leading-6">{t('healthBody')}</p>
        <a
          className="mt-3 inline-block text-primary text-sm underline"
          href="https://www.cdc.gov/healthy-weight-growth/losing-weight/index.html"
          target="_blank"
          rel="noreferrer"
        >
          {t('healthSource')}
        </a>
      </aside>
      <section className="mb-6">
        <h2 className="mb-4 font-bold text-2xl">{t('planTitle')}</h2>
        <div className="grid gap-4 md:grid-cols-3">
          {(['summer', 'school', 'rest'] as const).map((kind) => (
            <article key={kind} className={panelClass}>
              <h3 className="font-semibold text-lg">{t(`${kind}Plan`)}</h3>
              <dl className="mt-4 space-y-4">
                {(['Calories', 'Activity', 'Meals'] as const).map((item) => (
                  <div key={item}>
                    <dt className="text-muted-foreground text-xs">
                      {t(
                        item === 'Calories'
                          ? 'calories'
                          : item === 'Activity'
                            ? 'activity'
                            : 'meals',
                      )}
                    </dt>
                    <dd className="mt-1 text-sm leading-6">{t(`${kind}${item}`)}</dd>
                  </div>
                ))}
              </dl>
            </article>
          ))}
        </div>
      </section>
      {active && (
        <section className={`${panelClass} mb-6`}>
          <h2 className="font-bold text-2xl">{t('recordTitle')}</h2>
          <p className="mt-2 text-muted-foreground text-sm">{t('recordDescription')}</p>
          <div className="my-5 grid gap-4 sm:grid-cols-3">
            <label className="text-sm">
              <span>{t('selectWeek')}</span>
              <select
                className={`${fieldClass} mt-2`}
                value={active.date}
                onChange={(event) => setSelected(event.target.value)}
              >
                {records.map((record) => (
                  <option key={record.date} value={record.date}>
                    {record.date}
                  </option>
                ))}
              </select>
            </label>
            <div>
              <p className="text-sm text-muted-foreground">{t('targetRange')}</p>
              <p className="mt-3 font-semibold">
                {active.targetMin}–{active.targetMax} kg
              </p>
            </div>
            <div>
              <p className="text-sm text-muted-foreground">{t('recordStatus')}</p>
              <p className="mt-3 font-semibold">{comparison(active)}</p>
            </div>
          </div>
          <fieldset
            disabled={!store.authenticated}
            className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4"
          >
            <legend className="sr-only">{t('recordTitle')}</legend>
            {metricFields.map((metric) => (
              <label key={metric.field} className="text-sm">
                <span>
                  {t(metric.label)} ({t(metric.unit)})
                </span>
                <input
                  className={`${fieldClass} mt-2`}
                  type="number"
                  min={metric.min}
                  max={metric.max}
                  step="0.1"
                  inputMode="decimal"
                  value={active[metric.field]}
                  onChange={(event) => update(metric.field, event.target.value)}
                />
              </label>
            ))}
            <label className="text-sm sm:col-span-2 lg:col-span-4">
              <span>{t('note')}</span>
              <textarea
                className={`${fieldClass} mt-2`}
                rows={3}
                maxLength={10000}
                value={active.note}
                placeholder={t('notePlaceholder')}
                onChange={(event) => update('note', event.target.value)}
              />
            </label>
          </fieldset>
        </section>
      )}
      <section className={`${panelClass} mb-6`}>
        <h2 className="font-bold text-2xl">{t('trendTitle')}</h2>
        <p className="mt-2 text-sm text-muted-foreground">{t('trendDescription')}</p>
        <div className="mt-4 flex gap-5 text-sm">
          <span className="text-emerald-600">{t('targetLine')}</span>
          <span className="text-blue-600">{t('actualLine')}</span>
        </div>
        <div className="mt-3 overflow-x-auto">
          <svg
            className="min-w-[600px] w-full"
            viewBox="0 0 920 310"
            role="img"
            aria-label={t('trendTitle')}
          >
            <title>{t('trendTitle')}</title>
            {Array.from({ length: 6 }, (_, index) => min + ((max - min) * index) / 5).map(
              (value) => (
                <g key={value}>
                  <line
                    x1="50"
                    x2="880"
                    y1={y(value)}
                    y2={y(value)}
                    stroke="currentColor"
                    opacity="0.12"
                  />
                  <text x="42" y={y(value) + 4} textAnchor="end" fill="currentColor" fontSize="11">
                    {value.toFixed(1)}
                  </text>
                </g>
              ),
            )}
            <polyline
              fill="none"
              stroke="#059669"
              strokeWidth="2"
              strokeDasharray="6 4"
              points={records
                .map(
                  (record) => `${x(record.date)},${y((record.targetMin + record.targetMax) / 2)}`,
                )
                .join(' ')}
            />
            <polyline
              fill="none"
              stroke="#2563eb"
              strokeWidth="3"
              points={measured
                .map((record) => `${x(record.date)},${y(Number(record.weight))}`)
                .join(' ')}
            />
            {measured.map((record) => (
              <circle
                key={record.date}
                cx={x(record.date)}
                cy={y(Number(record.weight))}
                r="4"
                fill="#2563eb"
              >
                <title>
                  {record.date}: {record.weight} kg
                </title>
              </circle>
            ))}
            {records
              .filter((_, index) => index % 6 === 0 || index === records.length - 1)
              .map((record) => (
                <text
                  key={record.date}
                  x={x(record.date)}
                  y="290"
                  textAnchor="middle"
                  fill="currentColor"
                  fontSize="11"
                >
                  {record.date.slice(5)}
                </text>
              ))}
          </svg>
        </div>
      </section>
      <section className={`${panelClass} mb-6`}>
        <h2 className="font-bold text-2xl">{t('milestoneTitle')}</h2>
        <p className="mt-2 text-muted-foreground text-sm">{t('milestoneDescription')}</p>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[600px] text-left text-sm">
            <thead>
              <tr>
                {(['date', 'targetRange', 'actual', 'focus'] as const).map((label) => (
                  <th className="border-b p-3" key={label}>
                    {t(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weightMilestones.map((item) => (
                <tr key={item.date}>
                  <td className="border-b p-3 tabular-nums">{item.date}</td>
                  <td className="border-b p-3">
                    {item.min}–{item.max} kg
                  </td>
                  <td className="border-b p-3">{map.get(item.date)?.weight || t('noRecord')}</td>
                  <td className="border-b p-3">{t(`milestoneFocus.${item.stage}`)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
      <details className={panelClass}>
        <summary className="cursor-pointer font-semibold text-lg">{t('allRecords')}</summary>
        <div className="mt-5 overflow-x-auto">
          <table className="w-full min-w-[700px] text-left text-sm">
            <thead>
              <tr>
                {(['date', 'averageWeight', 'bodyFat', 'muscleMass', 'waist', 'note'] as const).map(
                  (label) => (
                    <th className="border-b p-3" key={label}>
                      {t(label)}
                    </th>
                  ),
                )}
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr key={record.date}>
                  {[
                    record.date,
                    record.weight || '—',
                    record.bodyFat || '—',
                    record.muscleMass || '—',
                    record.waist || '—',
                    record.note,
                  ].map((value, index) => (
                    <td
                      className="max-w-80 whitespace-pre-wrap border-b p-3 break-words"
                      key={['date', 'weight', 'bodyFat', 'muscleMass', 'waist', 'note'][index]}
                    >
                      {value}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
      <p className="mt-5 text-muted-foreground text-sm">{t('dataNote')}</p>
    </>
  )
}
