'use client'

import { Dialog } from '@base-ui/react/dialog'
import { LockKeyhole, Plus, Settings2, X } from 'lucide-react'
import { NextIntlClientProvider, useLocale, useMessages, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  healthTimeZone,
  type Measurement,
  measurementDay,
  metricDefinitions,
  type OwnerHealthSnapshot,
} from '@/health/contracts'
import { HealthExchangePanel } from './health-exchange'
import { HealthOverview } from './health-overview'
import { HealthLifestylePlan, HealthStagePlan } from './health-plan'
import { HealthRecordForm } from './health-record-form'
import { HealthReview } from './health-review'
import { HealthTrend } from './health-trend'
import { fieldClass, panelClass } from './tracker-toolbar'
import { useHealthData } from './use-health-data'

export function WeightTracker() {
  const t = useTranslations('Weight')
  const h = useTranslations('Health')
  const locale = useLocale()
  const messages = useMessages()
  const store = useHealthData()
  return (
    <div className="min-w-0 space-y-6">
      <header className="py-3 sm:py-5">
        <h1 className="font-bold text-3xl tracking-tight sm:text-4xl">{t('title')}</h1>
        <p className="mt-3 text-muted-foreground text-sm leading-6">{t('intro')}</p>
      </header>
      {store.snapshot ? (
        <NextIntlClientProvider
          locale={locale}
          messages={{ ...messages, HealthPlan: store.snapshot.planMessages }}
        >
          <HealthDashboard snapshot={store.snapshot} reload={() => store.reload()} />
        </NextIntlClientProvider>
      ) : (
        <section className={`${panelClass} flex items-start gap-4`}>
          <LockKeyhole
            className="mt-0.5 size-5 shrink-0 text-muted-foreground"
            aria-hidden="true"
          />
          <div className="space-y-3">
            <p role="status" className="text-sm leading-6">
              {h(store.checking ? 'checking' : store.error ? 'loadFailed' : 'ownerOnly')}
            </p>
            {store.error && <Button onClick={() => void store.reload()}>{h('retry')}</Button>}
          </div>
        </section>
      )}
    </div>
  )
}

function HealthDashboard({
  snapshot,
  reload,
}: {
  snapshot: OwnerHealthSnapshot
  reload: () => Promise<void>
}) {
  const t = useTranslations('Health')
  const locale = useLocale()
  const [selected, setSelected] = useState<Measurement | undefined>()
  const [formGeneration, setFormGeneration] = useState(0)
  const [editing, setEditing] = useState(false)
  const [managementOpen, setManagementOpen] = useState(false)
  const [source, setSource] = useState('all')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [visible, setVisible] = useState(10)
  const [inspection, setInspection] = useState<{ from: string; to: string } | null>(null)
  const records = snapshot.measurements
  const latest = records.find((row) => !row.excluded)
  const format = (value: number | null | undefined) =>
    value === null || value === undefined
      ? '—'
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 2 }).format(value)
  const dateTime = (row: Measurement) =>
    row.timePrecision === 'date'
      ? `${measurementDay(row.measuredAt)} · ${t('precision.date')}`
      : new Date(row.measuredAt).toLocaleString(locale, { timeZone: healthTimeZone, hour12: false })
  const filtered = records.filter(
    (row) =>
      (source === 'all' || row.source === source) &&
      (!from || measurementDay(row.measuredAt) >= from) &&
      (!to || measurementDay(row.measuredAt) <= to),
  )
  const edit = (row?: Measurement) => {
    setSelected(row)
    setFormGeneration((old) => old + 1)
    setEditing(true)
  }
  const saved = async () => {
    await reload()
    setEditing(false)
    setSelected(undefined)
  }
  const inspect = (start: string, end: string) => {
    setSource('all')
    setFrom(start)
    setTo(end)
    setVisible(10)
    setInspection({ from: start, to: end })
    document.getElementById('health-trend')?.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }
  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h2 className="font-semibold text-lg">{t('overview')}</h2>
        <div className="flex flex-wrap gap-2">
          <Button onClick={() => edit()}>
            <Plus className="mr-1.5 size-4" aria-hidden="true" />
            {t('addRecord')}
          </Button>
          <Button
            className="border bg-card text-foreground hover:bg-muted"
            onClick={() => {
              setManagementOpen(true)
              document
                .getElementById('health-management')
                ?.scrollIntoView({ behavior: 'smooth', block: 'start' })
            }}
          >
            <Settings2 className="mr-1.5 size-4" aria-hidden="true" />
            {t('manage')}
          </Button>
        </div>
      </div>
      <HealthOverview snapshot={snapshot} />
      <HealthTrend
        key={inspection ? `${inspection.from}:${inspection.to}` : 'default'}
        records={records}
        plan={snapshot.plan}
        initialWindow={inspection}
      />
      <HealthReview records={records} inspect={inspect} />
      <HealthStagePlan plan={snapshot.plan} records={records} />
      <section id="health-history" className={`${panelClass} min-w-0 space-y-4`}>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-bold text-xl">{t('history')}</h2>
          <span className="text-muted-foreground text-xs">
            {t('recordsCount', { count: filtered.length })}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="space-y-1 text-sm">
            {t('source')}
            <select
              className={fieldClass}
              value={source}
              onChange={(event) => {
                setSource(event.target.value)
                setVisible(10)
              }}
            >
              {(['all', 'manual_legacy', 'manual', 'smartscale'] as const).map((item) => (
                <option key={item} value={item}>
                  {t(`sources.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label className="space-y-1 text-sm">
            {t('from')}
            <input
              className={fieldClass}
              type="date"
              value={from}
              max={to || undefined}
              onChange={(event) => {
                setFrom(event.target.value)
                setVisible(10)
              }}
            />
          </label>
          <label className="space-y-1 text-sm">
            {t('to')}
            <input
              className={fieldClass}
              type="date"
              value={to}
              min={from || undefined}
              onChange={(event) => {
                setTo(event.target.value)
                setVisible(10)
              }}
            />
          </label>
        </div>
        {(from || to) && (
          <Button
            className="border bg-card text-foreground hover:bg-muted"
            onClick={() => {
              setFrom('')
              setTo('')
              setVisible(10)
              setInspection(null)
            }}
          >
            {t('clearRange')}
          </Button>
        )}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(
                  ['measuredAt', 'source', 'metrics.weight', 'metrics.bodyFat', 'note'] as const
                ).map((label) => (
                  <th
                    key={label}
                    className="whitespace-nowrap border-b px-3 py-3 font-medium text-muted-foreground"
                  >
                    {t(label)}
                    {label === 'metrics.weight'
                      ? ` (${t('units.kg')})`
                      : label === 'metrics.bodyFat'
                        ? ` (${t('units.percent')})`
                        : ''}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visible).map((row) => (
                <tr
                  key={row.id}
                  className={`${row.excluded ? 'opacity-60' : ''} hover:bg-muted/40`}
                >
                  <td className="border-b px-3 py-3">
                    <button
                      type="button"
                      className="whitespace-nowrap text-left text-primary underline-offset-4 hover:underline"
                      onClick={() => edit(row)}
                    >
                      {dateTime(row)}
                    </button>
                    {row.excluded && <span className="mt-1 block text-xs">{t('excluded')}</span>}
                  </td>
                  <td className="whitespace-nowrap border-b px-3 py-3 text-xs">
                    {t(`sources.${row.source}`)}
                  </td>
                  <td className="border-b px-3 py-3 tabular-nums">{format(row.weight)}</td>
                  <td className="border-b px-3 py-3 tabular-nums">{format(row.bodyFat)}</td>
                  <td className="min-w-32 max-w-64 break-words border-b px-3 py-3">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <p className="text-muted-foreground text-sm">{t('noData')}</p>}
        {filtered.length > visible && (
          <Button onClick={() => setVisible((old) => old + 10)}>{t('more')}</Button>
        )}
      </section>
      <details className={panelClass}>
        <summary className="cursor-pointer font-semibold text-lg">{t('allMetrics')}</summary>
        <p className="mt-4 text-muted-foreground text-xs">
          {latest ? dateTime(latest) : t('noData')} · {t('compositionHelp')}
        </p>
        <dl className="mt-5 grid grid-cols-2 gap-5 sm:grid-cols-3 lg:grid-cols-4">
          {metricDefinitions.map(({ key, unit }) => (
            <div key={key}>
              <dt className="text-muted-foreground text-xs">{t(`metrics.${key}`)}</dt>
              <dd className="mt-1 font-medium tabular-nums">
                {format(latest?.[key])}{' '}
                <span className="text-muted-foreground text-xs">{t(`units.${unit}`)}</span>
              </dd>
            </div>
          ))}
        </dl>
      </details>
      <HealthLifestylePlan />
      <HealthExchangePanel
        snapshot={snapshot}
        saved={saved}
        open={managementOpen}
        setOpen={setManagementOpen}
      />
      <Dialog.Root open={editing} onOpenChange={setEditing}>
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50 backdrop-blur-sm" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-4xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl sm:p-7">
            <div className="mb-5 flex items-start justify-between gap-3">
              <div>
                <Dialog.Title className="font-semibold text-xl">
                  {t(selected ? 'editRecord' : 'addRecord')}
                </Dialog.Title>
                <Dialog.Description className="mt-2 text-muted-foreground text-xs">
                  {selected
                    ? `${dateTime(selected)} · ${t(`sources.${selected.source}`)}`
                    : t('rawHelp')}
                </Dialog.Description>
              </div>
              <Dialog.Close
                render={
                  <Button
                    className="shrink-0 border bg-card text-foreground hover:bg-muted"
                    aria-label={t('close')}
                  />
                }
              >
                <X className="size-4" aria-hidden="true" />
              </Dialog.Close>
            </div>
            <HealthRecordForm
              key={`${selected?.id ?? 'new'}:${formGeneration}`}
              record={selected}
              saved={saved}
            />
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </>
  )
}
