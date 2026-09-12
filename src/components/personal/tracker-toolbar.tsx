'use client'

import { Dialog } from '@base-ui/react/dialog'
import { LockKeyhole, LogOut } from 'lucide-react'
import { useTranslations } from 'next-intl'
import { useRef, useState } from 'react'
import type { z } from 'zod'
import { Button } from '@/components/ui/button'
import type { useOwnerDataset } from './use-owner-dataset'

export const fieldClass =
  'w-full rounded-lg border bg-background px-3 py-2 text-sm outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:opacity-70'
export const panelClass = 'rounded-2xl border bg-card p-5 sm:p-7'

export function downloadFile(text: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  URL.revokeObjectURL(url)
}

export function TrackerToolbar<T>({
  store,
  schema,
  empty,
  filename,
  importCsv,
  exportCsv,
}: {
  store: ReturnType<typeof useOwnerDataset<T>>
  schema: z.ZodType<T>
  empty: T
  filename: string
  importCsv?: (text: string, current: T) => T
  exportCsv?: (current: T) => string
}) {
  const t = useTranslations('Personal')
  const [open, setOpen] = useState(false)
  const [password, setPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [pendingImport, setPendingImport] = useState<T | null>(null)
  const input = useRef<HTMLInputElement>(null)
  const importing = async (file: File | undefined) => {
    if (!file) return
    try {
      if (file.size > 1024 * 1024) throw new Error('file_too_large')
      const text = await file.text()
      const value: unknown =
        file.name.toLowerCase().endsWith('.csv') && importCsv
          ? importCsv(text, store.payload)
          : JSON.parse(text)
      setPendingImport(schema.parse(value))
      setError('')
    } catch {
      setError(t('importFailed'))
    }
  }
  return (
    <div className={`${panelClass} mb-6`}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-medium">
            {store.checking ? t('checking') : store.authenticated ? t('editable') : t('readOnly')}
          </p>
          <p
            aria-live="polite"
            className="mt-1 text-muted-foreground text-sm"
            data-testid="save-state"
          >
            {t(`state.${store.state}`)}
          </p>
        </div>
        {store.authenticated ? (
          <Button
            disabled={busy || store.state === 'saving'}
            onClick={async () => {
              setBusy(true)
              setError('')
              try {
                await store.logout()
              } catch {
                setError(t('logoutFailed'))
              } finally {
                setBusy(false)
              }
            }}
          >
            <LogOut className="mr-2 size-4" />
            {t('logout')}
          </Button>
        ) : (
          <Button
            disabled={store.checking || !store.enabled}
            onClick={() => {
              setError('')
              setOpen(true)
            }}
          >
            <LockKeyhole className="mr-2 size-4" />
            {t('login')}
          </Button>
        )}
      </div>
      {!store.enabled && <p className="mt-2 text-sm">{t('unavailable')}</p>}
      {store.authenticated && (
        <div className="mt-4 flex flex-wrap gap-2">
          <Button
            disabled={store.state === 'saving' || store.state === 'conflict'}
            onClick={() => void store.save()}
          >
            {t('save')}
          </Button>
          <Button onClick={() => input.current?.click()}>{t('import')}</Button>
          <Button
            onClick={() =>
              downloadFile(
                JSON.stringify(store.payload, null, 2),
                `${filename}.json`,
                'application/json',
              )
            }
          >
            {t('export')}
          </Button>
          {exportCsv && (
            <Button
              onClick={() =>
                downloadFile(exportCsv(store.payload), `${filename}.csv`, 'text/csv;charset=utf-8')
              }
            >
              {t('exportCsv')}
            </Button>
          )}
          <Button
            disabled={store.state === 'saving'}
            className="bg-red-600 text-white hover:bg-red-700"
            onClick={() => {
              if (window.confirm(t('clearConfirm'))) store.change(empty)
            }}
          >
            {t('clear')}
          </Button>
          <input
            ref={input}
            type="file"
            className="hidden"
            accept={importCsv ? '.json,.csv' : '.json'}
            onChange={(event) => {
              void importing(event.target.files?.[0])
              event.target.value = ''
            }}
            aria-label={t('import')}
          />
        </div>
      )}
      {store.draftAvailable && store.authenticated && (
        <Button className="mt-3" onClick={store.restoreDraft}>
          {t('restoreDraft')}
        </Button>
      )}
      {['error', 'conflict', 'expired'].includes(store.state) && (
        <div className="mt-3 flex flex-wrap gap-2">
          <Button
            onClick={() =>
              downloadFile(
                JSON.stringify(store.payload, null, 2),
                `${filename}-draft.json`,
                'application/json',
              )
            }
          >
            {t('exportDraft')}
          </Button>
          <Button
            disabled={store.state === 'saving'}
            onClick={async () => {
              if (window.confirm(t('reloadConfirm'))) {
                try {
                  await store.reload(true)
                } catch {
                  setError(t('reloadFailed'))
                }
              }
            }}
          >
            {t('reload')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="mt-3 text-red-600 dark:text-red-400">
          {error}
        </p>
      )}
      <Dialog.Root
        open={open}
        onOpenChange={(value) => {
          setOpen(value)
          if (!value) setPassword('')
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%_-_2rem)] max-w-md -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6 shadow-xl">
            <Dialog.Title className="font-semibold text-xl">{t('loginTitle')}</Dialog.Title>
            <Dialog.Description className="mt-2 text-muted-foreground text-sm">
              {t('loginDescription')}
            </Dialog.Description>
            <form
              className="mt-5 space-y-4"
              onSubmit={async (event) => {
                event.preventDefault()
                setBusy(true)
                setError('')
                try {
                  await store.login(password)
                  setOpen(false)
                } catch (reason) {
                  setError(
                    t(
                      reason instanceof Error && reason.message === 'limited'
                        ? 'limited'
                        : 'loginFailed',
                    ),
                  )
                } finally {
                  setPassword('')
                  setBusy(false)
                }
              }}
            >
              <label className="block space-y-2">
                <span>{t('password')}</span>
                <input
                  className={fieldClass}
                  type="password"
                  autoComplete="current-password"
                  required
                  maxLength={256}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                />
              </label>
              {error && (
                <p role="alert" className="text-red-600 dark:text-red-400">
                  {error}
                </p>
              )}
              <div className="flex gap-2">
                <Button type="submit" disabled={busy}>
                  {busy ? t('checking') : t('login')}
                </Button>
                <Dialog.Close render={<Button type="button" />}>{t('cancel')}</Dialog.Close>
              </div>
            </form>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={pendingImport !== null}
        onOpenChange={(value) => {
          if (!value) setPendingImport(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 w-[calc(100%_-_2rem)] max-w-xl -translate-x-1/2 -translate-y-1/2 rounded-2xl border bg-background p-6">
            <Dialog.Title className="font-semibold text-xl">{t('importPreview')}</Dialog.Title>
            <Dialog.Description className="my-3 text-sm">
              {t('importDescription')}
            </Dialog.Description>
            <pre className="mb-4 max-h-64 overflow-auto rounded-lg bg-card p-3 text-xs">
              {JSON.stringify(pendingImport, null, 2)}
            </pre>
            <div className="flex gap-2">
              <Button
                disabled={!store.authenticated}
                onClick={() => {
                  if (pendingImport !== null) store.change(pendingImport)
                  setPendingImport(null)
                }}
              >
                {t('confirmImport')}
              </Button>
              <Dialog.Close render={<Button />}>{t('cancel')}</Dialog.Close>
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </div>
  )
}
