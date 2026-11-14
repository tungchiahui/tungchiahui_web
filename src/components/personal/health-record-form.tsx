'use client'
import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  emptyMetrics,
  type Measurement,
  measurementInputSchema,
  metricDefinitions,
} from '@/health/contracts'
import { fieldClass } from './tracker-toolbar'
import { healthRequest } from './use-health-data'

export function HealthRecordForm({
  record,
  saved,
}: {
  record: Measurement | undefined
  saved: () => Promise<void>
}) {
  const t = useTranslations('Health')
  const [newId] = useState(() => crypto.randomUUID())
  const [precision, setPrecision] = useState(record?.timePrecision ?? 'datetime')
  const [time, setTime] = useState(
    record
      ? new Date(Date.parse(record.measuredAt) + 8 * 3600000).toISOString().slice(0, 19)
      : new Date(Date.now() + 8 * 3600000).toISOString().slice(0, 19),
  )
  const [values, setValues] = useState(
    Object.fromEntries(metricDefinitions.map(({ key }) => [key, record?.[key]?.toString() ?? ''])),
  )
  const [note, setNote] = useState(record?.note ?? '')
  const [excluded, setExcluded] = useState(record?.excluded ?? false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const automatic = record?.source === 'smartscale'
  const action = async (remove = false) => {
    setBusy(true)
    setError('')
    try {
      if (remove && record)
        await healthRequest(`measurements/${record.id}`, 'DELETE', {
          expectedRevision: record.revision,
        })
      else if (automatic && record)
        await healthRequest(`measurements/${record.id}`, 'PATCH', {
          expectedRevision: record.revision,
          note: note.trim() || null,
          excluded,
        })
      else {
        const metrics = { ...emptyMetrics }
        for (const { key } of metricDefinitions)
          metrics[key] = values[key]?.trim() ? Number(values[key]) : null
        const measuredAt =
          precision === 'date'
            ? `${time.slice(0, 10)}T00:00:00+08:00`
            : `${time.length === 16 ? `${time}:00` : time}+08:00`
        const measurement = measurementInputSchema.parse({
          ...metrics,
          measuredAt,
          timePrecision: precision,
          note: note.trim() || null,
          excluded,
        })
        if (record)
          await healthRequest(`measurements/${record.id}`, 'PUT', {
            measurement,
            expectedRevision: record.revision,
          })
        else await healthRequest('measurements', 'POST', { id: newId, measurement })
      }
      await saved()
    } catch (failure: unknown) {
      setError(
        failure instanceof Error && failure.message === 'conflict' ? t('conflict') : t('invalid'),
      )
    } finally {
      setBusy(false)
    }
  }
  return (
    <div className="space-y-5">
      {automatic && <p className="text-muted-foreground text-sm">{t('sourceHelp')}</p>}
      <form
        onSubmit={(event) => {
          event.preventDefault()
          void action()
        }}
        className="space-y-5"
      >
        <fieldset disabled={busy || automatic} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <legend className="sr-only">{t('measurements')}</legend>
          <label>
            {t('timePrecision')}
            <select
              className={fieldClass}
              value={precision}
              onChange={(event) =>
                setPrecision(event.target.value === 'date' ? 'date' : 'datetime')
              }
            >
              <option value="datetime">{t('precision.datetime')}</option>
              <option value="date">{t('precision.date')}</option>
            </select>
          </label>
          <label>
            {t('measuredAt')}
            <input
              className={fieldClass}
              required
              type={precision === 'date' ? 'date' : 'datetime-local'}
              step={precision === 'date' ? undefined : 1}
              value={precision === 'date' ? time.slice(0, 10) : time}
              onChange={(event) =>
                setTime(
                  precision === 'date' ? `${event.target.value}T00:00:00` : event.target.value,
                )
              }
            />
          </label>
          {metricDefinitions.map(({ key, unit, min, max }) => (
            <label key={key}>
              {t(`metrics.${key}`)} ({t(`units.${unit}`)})
              <input
                className={fieldClass}
                type="number"
                step="any"
                min={min}
                max={max}
                inputMode="decimal"
                value={values[key] ?? ''}
                onChange={(event) => setValues({ ...values, [key]: event.target.value })}
              />
            </label>
          ))}
        </fieldset>
        <label className="block">
          {t('note')}
          <textarea
            className={fieldClass}
            disabled={busy}
            rows={3}
            maxLength={10000}
            value={note}
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={excluded}
            disabled={busy}
            onChange={(event) => setExcluded(event.target.checked)}
          />
          {t('excluded')}
        </label>
        {error && (
          <p role="alert" className="text-destructive">
            {error}
          </p>
        )}
        <div className="flex flex-wrap gap-3">
          <Button type="submit" disabled={busy}>
            {t('save')}
          </Button>
          {record && !automatic && (
            <Button
              type="button"
              disabled={busy}
              onClick={() => {
                if (window.confirm(t('confirmDelete'))) void action(true)
              }}
            >
              {t('delete')}
            </Button>
          )}
        </div>
      </form>
    </div>
  )
}
