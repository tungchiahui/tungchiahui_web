'use client'
import { useLocale, useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  type HealthExchange,
  type HealthSnapshot,
  healthExchangeSchema,
  healthImportPreviewSchema,
  healthTimeZone,
  type Measurement,
  measurementDay,
  metricDefinitions,
} from '@/health/contracts'
import { GOAL_WEIGHT, getTargetRange, START_WEIGHT, weightMilestones } from '@/personal/weight-plan'
import { HealthRecordForm } from './health-record-form'
import { HealthTrend } from './health-trend'
import { downloadFile, fieldClass, panelClass } from './tracker-toolbar'
import { healthRequest, useHealthData } from './use-health-data'

export function WeightTracker() {
  const t = useTranslations('Weight')
  const h = useTranslations('Health')
  const store = useHealthData()
  return (
    <div className="space-y-6">
      <header className={`${panelClass} bg-gradient-to-br from-blue-500/10 to-card`}>
        <p className="text-primary text-sm">{t('eyebrow')}</p>
        <h1 className="mt-3 font-bold text-3xl sm:text-4xl">{t('title')}</h1>
        <p className="mt-4 text-muted-foreground leading-7">{t('intro')}</p>
      </header>
      {store.snapshot ? (
        <HealthDashboard snapshot={store.snapshot} reload={() => store.reload()} />
      ) : (
        <section className={panelClass}>
          <p role="status">
            {h(store.checking ? 'checking' : store.error ? 'loadFailed' : 'ownerOnly')}
          </p>
          {store.error && <Button onClick={() => void store.reload()}>{h('retry')}</Button>}
        </section>
      )}
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
      {!store.snapshot && (
        <section className={panelClass}>
          <h2 className="font-bold text-2xl">{t('milestoneTitle')}</h2>
          <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {weightMilestones.map((row) => (
              <li key={row.date} className="text-sm">
                {row.date} · {row.min}–{row.max} kg
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

function HealthDashboard({
  snapshot,
  reload,
}: {
  snapshot: HealthSnapshot
  reload: () => Promise<void>
}) {
  const t = useTranslations('Health')
  const w = useTranslations('Weight')
  const locale = useLocale()
  const [selected, setSelected] = useState<Measurement | undefined>()
  const [formGeneration, setFormGeneration] = useState(0)
  const [source, setSource] = useState('all')
  const [from, setFrom] = useState(''),
    [to, setTo] = useState('')
  const [visible, setVisible] = useState(30)
  const [pending, setPending] = useState<{
    file: HealthExchange
    preview: ReturnType<typeof healthImportPreviewSchema.parse>
  } | null>(null)
  const [exchangeError, setExchangeError] = useState('')
  const [importing, setImporting] = useState(false)
  const records = snapshot.measurements
  const latest = records.find((row) => !row.excluded)
  const latestWeight = records.find((row) => !row.excluded && row.weight !== null)
  const dateTime = (row: Measurement) =>
    row.timePrecision === 'date'
      ? `${measurementDay(row.measuredAt)} · ${t('precision.date')}`
      : new Date(row.measuredAt).toLocaleString(locale, { timeZone: healthTimeZone, hour12: false })
  const syncTime = (value: string | null) =>
    value ? new Date(value).toLocaleString(locale, { timeZone: healthTimeZone }) : t('noData')
  const value = (number: number | null | undefined) =>
    number === null || number === undefined
      ? '—'
      : new Intl.NumberFormat(locale, { maximumFractionDigits: 3 }).format(number)
  const filtered = records.filter(
    (row) =>
      (source === 'all' || row.source === source) &&
      (!from || measurementDay(row.measuredAt) >= from) &&
      (!to || measurementDay(row.measuredAt) <= to),
  )
  const saved = async () => {
    await reload()
    setSelected(undefined)
    setFormGeneration((old) => old + 1)
  }
  return (
    <>
      <section className={`${panelClass} space-y-5`}>
        <h2 className="font-bold text-2xl">{t('overview')}</h2>
        <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {(['weight', 'bodyFat', 'bmi', 'muscleMass'] as const).map((key) => (
            <div key={key}>
              <dt className="text-muted-foreground text-sm">{t(`metrics.${key}`)}</dt>
              <dd className="mt-2 font-bold text-2xl tabular-nums">{value(latest?.[key])}</dd>
            </div>
          ))}
          <div>
            <dt>{t('startWeight')}</dt>
            <dd>{START_WEIGHT} kg</dd>
          </div>
          <div>
            <dt>{t('goalGap')}</dt>
            <dd>
              {value(
                latestWeight?.weight === null || latestWeight?.weight === undefined
                  ? null
                  : latestWeight.weight - GOAL_WEIGHT,
              )}{' '}
              kg
            </dd>
          </div>
          <div>
            <dt>{t('change')}</dt>
            <dd>
              {value(
                latestWeight?.weight === null || latestWeight?.weight === undefined
                  ? null
                  : latestWeight.weight - START_WEIGHT,
              )}{' '}
              kg
            </dd>
          </div>
          <div>
            <dt>{t('goal')}</dt>
            <dd>{GOAL_WEIGHT} kg</dd>
          </div>
        </dl>
        <p className="text-sm text-muted-foreground">
          {t('measuredAt')} · {latest ? dateTime(latest) : t('noData')}
        </p>
        {latestWeight && latestWeight.id !== latest?.id && (
          <p className="text-sm">
            {t('lastWeight')} · {value(latestWeight.weight)} kg · {dateTime(latestWeight)}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          {t('lastSync')} · {syncTime(snapshot.sync.lastSuccessAt)}
          <br />
          {t('sourceUpdated')} · {syncTime(snapshot.sync.sourceUpdatedAt)}
        </p>
        {snapshot.sync.lastError && (
          <p role="status" className="text-amber-600 dark:text-amber-400">
            {t('syncFailed')}
          </p>
        )}
      </section>
      <HealthTrend records={records} plans={snapshot.planOverrides} />
      <section className={`${panelClass} space-y-4`}>
        <h2 className="font-bold text-2xl">{t('composition')}</h2>
        <p className="text-muted-foreground text-sm">{latest ? dateTime(latest) : t('noData')}</p>
        <dl className="grid grid-cols-2 gap-5 lg:grid-cols-4">
          {metricDefinitions.map(({ key, unit }) => (
            <div key={key}>
              <dt className="text-muted-foreground text-sm">{t(`metrics.${key}`)}</dt>
              <dd className="mt-1 font-semibold tabular-nums">
                {value(latest?.[key])} {t(`units.${unit}`)}
              </dd>
            </div>
          ))}
        </dl>
      </section>
      <section className={`${panelClass} space-y-5`}>
        <h2 className="font-bold text-2xl">{t('history')}</h2>
        <div className="grid gap-4 sm:grid-cols-3">
          <label>
            {t('source')}
            <select
              className={fieldClass}
              value={source}
              onChange={(e) => {
                setSource(e.target.value)
                setVisible(30)
              }}
            >
              {(['all', 'manual_legacy', 'manual', 'smartscale'] as const).map((item) => (
                <option key={item} value={item}>
                  {t(`sources.${item}`)}
                </option>
              ))}
            </select>
          </label>
          <label>
            {t('from')}
            <input
              className={fieldClass}
              type="date"
              value={from}
              onChange={(e) => setFrom(e.target.value)}
            />
          </label>
          <label>
            {t('to')}
            <input
              className={fieldClass}
              type="date"
              value={to}
              onChange={(e) => setTo(e.target.value)}
            />
          </label>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(
                  ['measuredAt', 'source', 'metrics.weight', 'metrics.bodyFat', 'note'] as const
                ).map((label) => (
                  <th key={label} className="border-b p-3">
                    {t(label)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.slice(0, visible).map((row) => (
                <tr key={row.id} className={row.excluded ? 'opacity-60' : ''}>
                  <td className="border-b p-3">
                    <button
                      type="button"
                      className="text-primary underline text-left"
                      onClick={() => {
                        setSelected(row)
                        setFormGeneration((old) => old + 1)
                      }}
                    >
                      {dateTime(row)}
                    </button>
                    {row.excluded && <span className="block">{t('excluded')}</span>}
                  </td>
                  <td className="border-b p-3">{t(`sources.${row.source}`)}</td>
                  <td className="border-b p-3 tabular-nums">{value(row.weight)}</td>
                  <td className="border-b p-3 tabular-nums">{value(row.bodyFat)}</td>
                  <td className="max-w-48 break-words border-b p-3">{row.note}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {!filtered.length && <p>{t('noData')}</p>}
        {filtered.length > visible && (
          <Button onClick={() => setVisible((old) => old + 30)}>{t('more')}</Button>
        )}
        <Button
          onClick={() => {
            setSelected(undefined)
            setFormGeneration((old) => old + 1)
          }}
        >
          {t('addRecord')}
        </Button>
      </section>
      {selected && (
        <section className={`${panelClass} space-y-4`}>
          <h2 className="font-bold text-2xl">{t('details')}</h2>
          <p>
            {dateTime(selected)} · {t(`sources.${selected.source}`)} ·{' '}
            {t(`precision.${selected.timePrecision}`)}
          </p>
          <dl className="grid grid-cols-2 gap-4 sm:grid-cols-4">
            {metricDefinitions.map(({ key, unit }) => (
              <div key={key}>
                <dt className="text-muted-foreground text-sm">{t(`metrics.${key}`)}</dt>
                <dd>
                  {value(selected[key])} {t(`units.${unit}`)}
                </dd>
              </div>
            ))}
          </dl>
          <p className="whitespace-pre-wrap break-words">{selected.note}</p>
        </section>
      )}
      <HealthRecordForm
        key={`${selected?.id ?? 'new'}:${formGeneration}`}
        record={selected}
        saved={saved}
      />
      <section className={`${panelClass} space-y-4`}>
        <h2 className="font-bold text-2xl">{w('milestoneTitle')}</h2>
        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr>
                {(['date', 'targetRange', 'actual', 'focus'] as const).map((key) => (
                  <th key={key} className="border-b p-3">
                    {w(key)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {weightMilestones.map((row) => {
                const override = snapshot.planOverrides.find((plan) => plan.date === row.date)
                const target = override
                  ? { min: override.targetMin, max: override.targetMax }
                  : getTargetRange(row.date)
                const weights = records.filter(
                  (record) =>
                    !record.excluded &&
                    measurementDay(record.measuredAt) === row.date &&
                    record.weight !== null,
                )
                const average = weights.length
                  ? weights.reduce((sum, record) => sum + Number(record.weight), 0) / weights.length
                  : null
                return (
                  <tr key={row.date}>
                    <td className="border-b p-3">{row.date}</td>
                    <td className="border-b p-3">
                      {target.min}–{target.max} kg
                    </td>
                    <td className="border-b p-3">{value(average)}</td>
                    <td className="border-b p-3">{w(`milestoneFocus.${row.stage}`)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </div>
        <p className="text-muted-foreground text-sm">{t('dailyHelp')}</p>
      </section>
      <section className={`${panelClass} space-y-4`}>
        <h2 className="font-bold text-2xl">{t('exchange')}</h2>
        <p className="text-muted-foreground text-sm">{t('exchangeHelp')}</p>
        <div className="flex flex-wrap items-center gap-3">
          <Button
            onClick={() =>
              downloadFile(
                JSON.stringify(
                  healthExchangeSchema.parse({
                    format: 'tungchiahui-health',
                    schemaVersion: 1,
                    exportedAt: new Date().toISOString(),
                    timeZone: healthTimeZone,
                    measurements: records,
                    planOverrides: snapshot.planOverrides,
                  }),
                  null,
                  2,
                ),
                'body-measurements.json',
                'application/json',
              )
            }
          >
            {t('export')}
          </Button>
          <label>
            {t('import')}
            <input
              className={fieldClass}
              type="file"
              accept=".json,application/json"
              disabled={importing}
              onChange={async (event) => {
                setPending(null)
                setExchangeError('')
                try {
                  const file = event.target.files?.[0]
                  if (!file) return
                  if (file.size > 32 * 1024 * 1024) throw new Error('too_large')
                  const parsed = healthExchangeSchema.parse(
                    JSON.parse(await file.text()) as unknown,
                  )
                  const preview = healthImportPreviewSchema.parse(
                    await healthRequest('import', 'POST', { file: parsed }),
                  )
                  setPending({ file: parsed, preview })
                } catch {
                  setExchangeError(t('invalid'))
                } finally {
                  event.target.value = ''
                }
              }}
            />
          </label>
        </div>
        {pending && (
          <div role="status" className="space-y-3">
            <p>{t('importPreview', pending.preview)}</p>
            <div className="flex gap-3">
              <Button
                disabled={importing || pending.preview.conflicts > 0}
                onClick={async () => {
                  setImporting(true)
                  try {
                    await healthRequest('import', 'POST', {
                      file: pending.file,
                      expectedRevision: pending.preview.revision,
                    })
                    setPending(null)
                    await saved()
                  } catch {
                    setExchangeError(t('conflict'))
                  } finally {
                    setImporting(false)
                  }
                }}
              >
                {t('confirmImport')}
              </Button>
              <Button disabled={importing} onClick={() => setPending(null)}>
                {t('cancel')}
              </Button>
            </div>
          </div>
        )}
        {exchangeError && (
          <p role="alert" className="text-destructive">
            {exchangeError}
          </p>
        )}
      </section>
    </>
  )
}
