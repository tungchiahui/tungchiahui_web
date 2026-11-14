'use client'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import { Button } from '@/components/ui/button'
import {
  type HealthExchange,
  type HealthSnapshot,
  healthExchangeSchema,
  healthImportPreviewSchema,
  healthTimeZone,
} from '@/health/contracts'
import { downloadFile, fieldClass, panelClass } from './tracker-toolbar'
import { healthRequest } from './use-health-data'

export function HealthExchangePanel({
  snapshot,
  saved,
  open,
  setOpen,
}: {
  snapshot: HealthSnapshot
  saved: () => Promise<void>
  open: boolean
  setOpen: (open: boolean) => void
}) {
  const t = useTranslations('Health')
  const generation = useRef(0)
  const [pending, setPending] = useState<{
    file: HealthExchange
    preview: ReturnType<typeof healthImportPreviewSchema.parse>
  } | null>(null)
  const [exchangeError, setExchangeError] = useState('')
  const [importing, setImporting] = useState(false)
  return (
    <details
      id="health-management"
      className={`${panelClass} space-y-4 scroll-mt-28`}
      open={open}
      onToggle={(event) => setOpen(event.currentTarget.open)}
    >
      <summary className="cursor-pointer font-semibold text-lg">{t('exchange')}</summary>
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
                  measurements: snapshot.measurements,
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
              const current = ++generation.current
              setPending(null)
              setExchangeError('')
              try {
                const file = event.target.files?.[0]
                if (!file) return
                if (file.size > 32 * 1024 * 1024) throw new Error('too_large')
                const parsed = healthExchangeSchema.parse(JSON.parse(await file.text()) as unknown)
                const preview = healthImportPreviewSchema.parse(
                  await healthRequest('import', 'POST', { file: parsed }),
                )
                if (current === generation.current) setPending({ file: parsed, preview })
              } catch {
                if (current === generation.current) setExchangeError(t('invalid'))
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
    </details>
  )
}
