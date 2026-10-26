'use client'

import { Dialog } from '@base-ui/react/dialog'
import { Menu } from '@base-ui/react/menu'
import { Copy, MoreHorizontal, Upload } from 'lucide-react'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { Button } from '@/components/ui/button'
import { accountSessionResponseSchema } from '@/control-plane/account-contracts'
import { browserAudioDuration, browserAudioPlayback } from '@/music/browser-probe'
import {
  type LibraryTrack,
  type MusicCheck,
  maximumMusicBytes,
  musicCheckSchema,
  musicCsv,
  musicFileName,
  musicLibrarySchema,
} from '@/music/library-contracts'

import { filterMusicTracks, isMetingAudioUrl, isMetingServiceFailure } from '@/music/playback-check'

type Library = ReturnType<typeof musicLibrarySchema.parse>
const api = '/api/ops/music'
const button =
  'inline-flex items-center justify-center gap-2 rounded-lg border px-3 py-2 text-sm disabled:opacity-50 hover:bg-muted focus-visible:ring-2'
const menuItem =
  'cursor-pointer rounded-md px-3 py-2 text-sm outline-none data-highlighted:bg-muted'
function ActionsMenu({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <Menu.Root>
      <Menu.Trigger className={button}>
        {label}
        <MoreHorizontal className="size-4" />
      </Menu.Trigger>
      <Menu.Portal>
        <Menu.Positioner sideOffset={6} align="end" className="z-60">
          <Menu.Popup className="min-w-44 rounded-xl border bg-background p-1 shadow-lg">
            {children}
          </Menu.Popup>
        </Menu.Positioner>
      </Menu.Portal>
    </Menu.Root>
  )
}
async function request(path: string, input?: unknown, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${api}${path}`, {
      cache: 'no-store',
      signal: signal
        ? AbortSignal.any([signal, AbortSignal.timeout(20_000)])
        : AbortSignal.timeout(20_000),
      ...(input === undefined
        ? {}
        : {
            method: 'POST',
            headers: { 'content-type': 'application/json' },
            body: JSON.stringify(input),
          }),
    })
    if (response.status === 429 && attempt < 4) {
      const seconds = Math.min(60, Math.max(1, Number(response.headers.get('retry-after')) || 1))
      await response.arrayBuffer()
      await new Promise<void>((resolve, reject) => {
        const abort = () => {
          clearTimeout(timer)
          reject(new DOMException('Aborted', 'AbortError'))
        }
        const timer = setTimeout(() => {
          signal?.removeEventListener('abort', abort)
          resolve()
        }, seconds * 1000)
        if (signal?.aborted) {
          abort()
          return
        }
        signal?.addEventListener('abort', abort, { once: true })
      })
      continue
    }
    if (!response.ok) throw new Error(String(response.status))
    return response.json() as Promise<unknown>
  }
  throw new Error('rate_limit_exceeded')
}

function saveFile(name: string, contents: string, mime: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: mime }))
  const link = document.createElement('a')
  link.href = url
  link.download = name
  link.click()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
export function MusicManageLink({ href }: { href: string }) {
  const t = useTranslations('Web.musicManage')
  const [owner, setOwner] = useState(false)
  useEffect(() => {
    const controller = new AbortController()
    const refresh = () => {
      void fetch('/api/ops/auth/session', { cache: 'no-store', signal: controller.signal })
        .then((r) => r.json())
        .then((data) => {
          const session = accountSessionResponseSchema.parse(data)
          setOwner(session.authenticated && session.account.role === 'owner')
        })
        .catch(() => setOwner(false))
    }
    refresh()
    window.addEventListener('personal-auth-change', refresh)
    window.addEventListener('storage', refresh)
    return () => {
      controller.abort()
      window.removeEventListener('personal-auth-change', refresh)
      window.removeEventListener('storage', refresh)
    }
  }, [])
  return owner ? (
    <Link className={button} href={href}>
      {t('manage')}
    </Link>
  ) : null
}
export function MusicManagement() {
  const t = useTranslations('Web.musicManage')
  const [library, setLibrary] = useState<Library | null>(null)
  const [tab, setTab] = useState<'library' | 'checks' | 'imports'>('library')
  const [filter, setFilter] = useState<'all' | 'cdn' | 'missing' | 'recheck'>('all')
  const [query, setQuery] = useState('')
  const [message, setMessage] = useState('')
  const [activity, setActivity] = useState<'scan' | 'upload' | 'sync' | null>(null)
  const busy = activity !== null
  const running = useRef(false)
  const [uploadOpen, setUploadOpen] = useState(false)
  const [uploadTrack, setUploadTrack] = useState('')
  const [details, setDetails] = useState<string | null>(null)
  const [progress, setProgress] = useState<{ current: number; total: number } | null>(null)
  const [queue, setQueue] = useState<Array<{ file: File; trackId: string }>>([])
  const [source, setSource] = useState<'effective' | 'meting'>('effective')
  const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    setLibrary(musicLibrarySchema.parse(await request('/library')))
  }, [])
  useEffect(() => {
    const load = () => {
      void refresh()
        .then(() => setMessage(''))
        .catch(() => {
          setLibrary(null)
          setMessage(t('ownerOnly'))
        })
    }
    load()
    window.addEventListener('personal-auth-change', load)
    return () => {
      controller.current?.abort()
      window.removeEventListener('personal-auth-change', load)
    }
  }, [refresh, t])
  const run = async (kind: NonNullable<typeof activity>, work: () => Promise<void>) => {
    if (running.current) return
    running.current = true
    setActivity(kind)
    setMessage('')
    try {
      await work()
    } catch (error: unknown) {
      setMessage(
        error instanceof Error && error.name === 'AbortError'
          ? t('stopped')
          : error instanceof Error && error.message === '409'
            ? t('conflict')
            : kind === 'scan'
              ? t('scanFailed')
              : kind === 'sync'
                ? t('syncFailed')
                : t('failed'),
      )
    } finally {
      running.current = false
      setActivity(null)
      setProgress(null)
    }
  }
  const tracks = library?.tracks ?? []
  const checkFor = (track: LibraryTrack, kind: MusicCheck['source']) =>
    library?.checks.find((c) => c.id === track.id && c.source === kind)
  const selectedSource = tab === 'checks' ? source : 'effective'
  const visible = filterMusicTracks(tracks, library?.checks ?? [], selectedSource, filter, query)
  const openUpload = (id = '') => {
    setUploadTrack(id)
    setUploadOpen(true)
  }
  const copy = (value: string) => {
    void navigator.clipboard
      .writeText(value)
      .then(() => setMessage(t('copied')))
      .catch(() => setMessage(t('copyFailed')))
  }
  const detailTrack = tracks.find((track) => track.id === details)
  const scan = () =>
    run('scan', async () => {
      const abort = new AbortController()
      controller.current = abort
      const targets = [...visible].sort(
        (a, b) =>
          Number(isMetingAudioUrl(source === 'effective' ? a.url : a.upstreamUrl)) -
          Number(isMetingAudioUrl(source === 'effective' ? b.url : b.upstreamUrl)),
      )
      let providerFailures = 0
      let skipped = 0
      try {
        for (let i = 0; i < targets.length; i++) {
          abort.signal.throwIfAborted()
          const track = targets[i]
          if (!track) continue
          const audioUrl = source === 'effective' ? track.url : track.upstreamUrl
          if (providerFailures >= 3 && isMetingAudioUrl(audioUrl)) {
            skipped++
            continue
          }
          setProgress({ current: i + 1, total: visible.length })
          setMessage(t('progress', { current: i + 1, total: visible.length }))
          const result = z
            .object({ check: musicCheckSchema })
            .parse(await request('/check', { id: track.id, source }, abort.signal))
          if (!audioUrl) {
            await refresh()
            continue
          }
          // A server-side refusal can still play in the owner's browser (and vice versa).
          const playback = await browserAudioPlayback(audioUrl, abort.signal)
          abort.signal.throwIfAborted()
          const confirmed = z.object({ check: musicCheckSchema }).parse(
            await request(
              '/check/browser',
              {
                id: track.id,
                source,
                urlHash: result.check.urlHash,
                duration: playback.duration,
                playback,
              },
              abort.signal,
            ),
          )
          if (isMetingAudioUrl(audioUrl))
            providerFailures = isMetingServiceFailure(audioUrl, result.check, confirmed.check)
              ? providerFailures + 1
              : 0
          await refresh()
        }
        abort.signal.throwIfAborted()
        setMessage(
          providerFailures >= 3
            ? t('providerPaused', { count: skipped })
            : t(source === 'meting' ? 'scanDoneMeting' : 'scanDone'),
        )
      } finally {
        controller.current = null
      }
    })
  const upload = () =>
    run('upload', async () => {
      for (const item of queue) {
        const track = tracks.find((s) => s.id === item.trackId)
        if (!track) throw new Error('match_required')
        if (!item.file.name.toLowerCase().endsWith('.mp3') || item.file.size > maximumMusicBytes)
          throw new Error('mp3_required')
        const local = URL.createObjectURL(item.file)
        let duration: number | null
        try {
          duration = await browserAudioDuration(local)
        } finally {
          URL.revokeObjectURL(local)
        }
        if (!duration) throw new Error('invalid_audio')
        const bytes = await item.file.arrayBuffer()
        const sha256 = [...new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))]
          .map((b) => b.toString(16).padStart(2, '0'))
          .join('')
        const resume = library?.imports.find(
          (task) =>
            task.status === 'pending' &&
            task.trackId === track.id &&
            task.sha256 === sha256 &&
            task.expectedRevision === track.revision,
        )
        const task = {
          id: resume?.id ?? crypto.randomUUID(),
          trackId: track.id,
          title: track.title,
          artist: track.artist,
          fileName: musicFileName(track.title, track.artist),
          bytes: item.file.size,
          sha256,
          duration,
          expectedRevision: track.revision,
          status: 'pending',
          createdAt: resume?.createdAt ?? new Date().toISOString(),
        }
        await request('/imports', task)
        const response = await fetch(`${api}/imports/${task.id}/audio`, {
          method: 'PUT',
          headers: { 'content-type': 'audio/mpeg' },
          body: item.file,
        })
        if (!response.ok) throw new Error(String(response.status))
        setQueue((current) => current.filter((row) => row.file !== item.file))
        await refresh()
        await request('/check', { id: track.id, source: 'effective' })
      }
      await refresh()
      window.dispatchEvent(new Event('music-library-change'))
      setMessage(t('uploaded'))
      setUploadOpen(false)
    })
  if (!library)
    return (
      <section className="mx-auto max-w-5xl py-10">
        <h1 className="font-bold text-3xl">{t('title')}</h1>
        <p className="mt-5" role="status">
          {message || t('loading')}
        </p>
      </section>
    )
  return (
    <section className="mx-auto max-w-6xl py-8">
      <header className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-primary text-sm">{t('private')}</p>
          <h1 className="font-bold text-3xl">{t('title')}</h1>
          <p className="mt-2 text-muted-foreground text-sm">{t('description')}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            className={button}
            disabled={busy}
            onClick={() =>
              void run('sync', async () => {
                setLibrary(musicLibrarySchema.parse(await request('/sync', {})))
                setMessage(t('synced'))
              })
            }
            type="button"
          >
            {t('sync')}
          </button>
          <Button disabled={busy} onClick={() => openUpload()}>
            <Upload className="mr-2 size-4" />
            {t('uploadMusic')}
          </Button>
        </div>
      </header>
      <div className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <span className="text-muted-foreground">{t('libraryCount', { count: tracks.length })}</span>
        <button
          className="rounded-md px-2 py-1 text-primary underline-offset-4 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={() => {
            setTab('library')
            setSource('effective')
            setFilter('cdn')
            setQuery('')
          }}
          type="button"
        >
          {t('cdnCount', { count: tracks.filter((track) => track.selfHosted).length })}
        </button>
      </div>
      <nav aria-label={t('tabs')} className="mt-6 mb-4 flex gap-5 border-b">
        {(['library', 'checks', 'imports'] as const).map((key) => (
          <button
            aria-pressed={tab === key}
            className={`border-b-2 px-1 py-3 text-sm ${tab === key ? 'border-primary font-semibold text-primary' : 'border-transparent text-muted-foreground hover:text-foreground'}`}
            key={key}
            onClick={() => setTab(key)}
            type="button"
          >
            {t(key)}
          </button>
        ))}
      </nav>
      <p aria-live="polite" className="min-h-6 text-sm" role="status">
        {message}
      </p>
      {activity === 'scan' && progress ? (
        <div className="my-3 flex flex-wrap items-center gap-3 rounded-lg bg-muted p-3">
          <progress
            aria-label={t('checks')}
            className="h-2 min-w-32 flex-1"
            max={progress.total}
            value={progress.current - 1}
          />
          <button className={button} onClick={() => controller.current?.abort()} type="button">
            {t('stop')}
          </button>
        </div>
      ) : null}
      {tab !== 'imports' ? (
        <>
          <div className="my-4 flex flex-wrap gap-3">
            <input
              aria-label={t('search')}
              className="min-w-0 basis-full rounded-lg border bg-background p-2 sm:flex-1 sm:basis-auto"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              value={query}
            />
            <select
              aria-label={t('filter')}
              className="min-w-0 rounded-lg border bg-background p-2"
              disabled={activity === 'scan'}
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              value={filter}
            >
              {(['all', 'cdn', 'missing', 'recheck'] as const).map((key) => (
                <option key={key} value={key}>
                  {t(key === 'missing' && selectedSource === 'meting' ? 'metingProblems' : key)}
                </option>
              ))}
            </select>
            {tab === 'checks' ? (
              <select
                aria-label={t('source')}
                className="min-w-0 rounded-lg border bg-background p-2"
                disabled={busy}
                onChange={(e) => setSource(e.target.value as typeof source)}
                value={source}
              >
                <option value="effective">{t('effectiveCheck')}</option>
                <option value="meting">{t('metingCheck')}</option>
              </select>
            ) : null}
            <ActionsMenu label={t('export')}>
              <Menu.Item
                className={menuItem}
                onClick={() =>
                  saveFile(
                    'music-library.csv',
                    musicCsv(visible, library.checks, selectedSource),
                    'text/csv;charset=utf-8',
                  )
                }
              >
                {t('csv')}
              </Menu.Item>
              <Menu.Item
                className={menuItem}
                onClick={() =>
                  saveFile(
                    'music-library.json',
                    JSON.stringify(
                      {
                        exportedAt: new Date().toISOString(),
                        tracks: visible,
                        checks: library.checks.filter(
                          (check) =>
                            check.source === selectedSource &&
                            visible.some((track) => track.id === check.id),
                        ),
                      },
                      null,
                      2,
                    ),
                    'application/json',
                  )
                }
              >
                {t('json')}
              </Menu.Item>
            </ActionsMenu>
          </div>
          {tab === 'checks' ? (
            <div className="mb-5 space-y-3 rounded-xl border p-4">
              <p className="font-medium text-sm">
                {t(source === 'meting' ? 'metingWarning' : 'effectiveHint')}
              </p>
              <p className="text-muted-foreground text-sm">{t('scanHint')}</p>
              <Button disabled={busy || !visible.length} onClick={() => void scan()}>
                {t('scanCount', { count: visible.length })}
              </Button>
            </div>
          ) : null}
          <div className="rounded-xl border">
            <table className="block w-full text-left text-sm md:table">
              <thead className="hidden bg-muted md:table-header-group">
                <tr>
                  {(['song', 'currentSource', 'status', 'actions'] as const).map((key) => (
                    <th className="p-3" key={key}>
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="block md:table-row-group">
                {visible.map((track) => {
                  const check = checkFor(track, selectedSource)
                  const problematic = check?.status === 'failed' || check?.status === 'preview'
                  const needsAudio =
                    problematic && (selectedSource === 'effective' || !track.selfHosted)
                  const url = track.url
                  const checkedUrl = selectedSource === 'effective' ? track.url : track.upstreamUrl
                  const upstreamIssue =
                    isMetingAudioUrl(checkedUrl) &&
                    check?.status === 'uncertain' &&
                    check.reason === 'not_audio'
                  return (
                    <tr
                      className="grid grid-cols-2 gap-2 border-t p-3 first:border-t-0 md:table-row md:p-0"
                      key={track.id}
                    >
                      <td className="col-span-2 min-w-0 md:table-cell md:p-3">
                        <strong className="break-words">{track.title}</strong>
                        <p className="break-words text-muted-foreground">{track.artist}</p>
                        <button
                          aria-label={t('copyId')}
                          className="mt-1 inline-flex max-w-full items-center gap-1 break-all text-left font-mono text-muted-foreground text-xs hover:text-primary"
                          onClick={() => copy(track.id)}
                          title={t('copyId')}
                          type="button"
                        >
                          <span className="min-w-0 break-all">{track.id}</span>
                          <Copy className="size-3 shrink-0" />
                        </button>
                      </td>
                      <td className="md:table-cell md:p-3">
                        <span className="rounded-full bg-muted px-2 py-1 text-xs">
                          {t(track.selfHosted ? 'cdn' : 'meting')}
                        </span>
                        {tab === 'checks' ? (
                          <p className="mt-2 text-muted-foreground text-xs">
                            {t(
                              selectedSource === 'meting' ? 'checkingMeting' : 'checkingEffective',
                            )}
                          </p>
                        ) : null}
                      </td>
                      <td className="min-w-0 md:table-cell md:p-3">
                        <span
                          className={
                            check?.status === 'reachable'
                              ? 'font-medium text-primary'
                              : problematic
                                ? 'font-medium text-destructive'
                                : ''
                          }
                        >
                          {upstreamIssue
                            ? t('providerNoAudio')
                            : t(
                                check?.status === 'failed'
                                  ? 'checkFailed'
                                  : (check?.status ?? 'unchecked'),
                              )}
                        </span>
                        {check ? (
                          <p className="mt-1 text-muted-foreground text-xs">
                            {t(
                              upstreamIssue
                                ? 'providerNoAudioHint'
                                : check.reason === 'browser_decode' && track.duration === null
                                  ? 'durationUnknown'
                                  : check.reason,
                            )}
                            <br />
                            {new Date(check.checkedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="col-span-2 md:table-cell md:p-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <a
                            className={button}
                            href={url || undefined}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {t('listen')}
                          </a>
                          {needsAudio ? (
                            <button
                              className={`${button} border-primary text-primary`}
                              disabled={busy}
                              onClick={() => openUpload(track.id)}
                              type="button"
                            >
                              {t('supplement')}
                            </button>
                          ) : null}
                          <ActionsMenu label={t('more')}>
                            {selectedSource === 'meting' && checkedUrl && checkedUrl !== url ? (
                              <Menu.LinkItem
                                className={menuItem}
                                closeOnClick
                                href={checkedUrl}
                                rel="noreferrer"
                                target="_blank"
                              >
                                {t('listenMeting')}
                              </Menu.LinkItem>
                            ) : null}
                            <Menu.Item className={menuItem} onClick={() => setDetails(track.id)}>
                              {t('details')}
                            </Menu.Item>
                            {track.selfHosted ? (
                              <Menu.Item className={menuItem} onClick={() => copy(track.url)}>
                                {t('copyUrl')}
                              </Menu.Item>
                            ) : null}
                            <Menu.LinkItem
                              className={menuItem}
                              closeOnClick
                              href={`https://y.qq.com/n/ryqq/songDetail/${track.id.slice(8)}`}
                              rel="noreferrer"
                              target="_blank"
                            >
                              {t('qq')}
                            </Menu.LinkItem>
                            <Menu.Item
                              className={menuItem}
                              disabled={busy}
                              onClick={() => openUpload(track.id)}
                            >
                              {t('replace')}
                            </Menu.Item>
                          </ActionsMenu>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
            {!visible.length ? (
              <p className="p-8 text-center text-muted-foreground">{t('empty')}</p>
            ) : null}
          </div>
          <p className="mt-3 text-muted-foreground text-sm">
            {t('total', { count: visible.length })}
          </p>
        </>
      ) : (
        <div className="space-y-3">
          <h2 className="font-bold text-lg">{t('history')}</h2>
          {!library.imports.length ? (
            <p className="text-muted-foreground text-sm">{t('noImports')}</p>
          ) : null}
          {library.imports.map((task) => (
            <p className="break-all rounded-xl border p-4 text-sm" key={task.id}>
              {task.fileName}
              <br />
              <span className="font-mono text-xs">{task.trackId}</span> ·{' '}
              {t(task.status === 'conflict' ? 'conflictStatus' : task.status)} ·{' '}
              {new Date(task.createdAt).toLocaleString()}
            </p>
          ))}
        </div>
      )}
      <Dialog.Root
        open={uploadOpen}
        onOpenChange={(open) => {
          if (activity !== 'upload') setUploadOpen(open)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl">
            <div className="mb-4 flex items-center justify-between gap-3">
              <Dialog.Title className="font-bold text-xl">{t('uploadMusic')}</Dialog.Title>
              <Dialog.Close className={button} disabled={activity === 'upload'}>
                {t('close')}
              </Dialog.Close>
            </div>
            <Dialog.Description className="sr-only">{t('importHint')}</Dialog.Description>
            <div className="space-y-5">
              <p className="rounded-lg bg-muted p-4 text-sm">{t('importHint')}</p>
              <input
                accept=".mp3,audio/mpeg"
                aria-label={t('chooseFiles')}
                disabled={busy}
                multiple
                onChange={(e) => {
                  setQueue(
                    [...(e.currentTarget.files ?? [])].map((file) => {
                      const matches = tracks.filter(
                        (track) =>
                          file.name === track.fileName ||
                          file.name === musicFileName(track.title, track.artist),
                      )
                      return {
                        file,
                        trackId:
                          matches.length === 1
                            ? (matches[0]?.id ?? '')
                            : (tracks.find((track) => track.id === uploadTrack)?.id ?? ''),
                      }
                    }),
                  )
                }}
                type="file"
              />
              {queue.map((item, index) => (
                <div
                  className="grid gap-2 rounded-lg border p-3 sm:grid-cols-2"
                  key={`${item.file.name}-${item.file.size}-${item.file.lastModified}`}
                >
                  <span className="break-all">{item.file.name}</span>
                  <div>
                    <select
                      aria-label={t('match', { file: item.file.name })}
                      className="w-full rounded border bg-background p-2"
                      disabled={busy}
                      onChange={(e) =>
                        setQueue((current) =>
                          current.map((row, i) =>
                            i === index ? { ...row, trackId: e.target.value } : row,
                          ),
                        )
                      }
                      value={item.trackId}
                    >
                      <option value="">{t('selectSong')}</option>
                      {tracks.map((track) => (
                        <option key={track.id} value={track.id}>
                          {track.title} — {track.artist} ({track.id})
                        </option>
                      ))}
                    </select>
                    <p className="mt-1 break-all text-muted-foreground text-xs">
                      {tracks.find((track) => track.id === item.trackId)
                        ? musicFileName(
                            tracks.find((track) => track.id === item.trackId)?.title ?? '',
                            tracks.find((track) => track.id === item.trackId)?.artist ?? '',
                          )
                        : t('selectSong')}
                    </p>
                  </div>
                </div>
              ))}
              <button
                className={`${button} bg-primary text-primary-foreground`}
                disabled={
                  busy ||
                  !queue.length ||
                  queue.some((q) => !q.trackId) ||
                  new Set(queue.map((q) => q.trackId)).size !== queue.length
                }
                onClick={() => void upload()}
                type="button"
              >
                {t('upload')}
              </button>
              <p className="text-muted-foreground text-sm">{t('conversionHint')}</p>
              <code className="block overflow-x-auto rounded-lg bg-muted p-3">
                ./site music studio
              </code>

              {activity === 'upload' ? (
                <p aria-live="polite">{t('uploading')}</p>
              ) : message ? (
                <p>{message}</p>
              ) : null}
            </div>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
      <Dialog.Root
        open={Boolean(detailTrack)}
        onOpenChange={(open) => {
          if (!open) setDetails(null)
        }}
      >
        <Dialog.Portal>
          <Dialog.Backdrop className="fixed inset-0 z-40 bg-black/50" />
          <Dialog.Popup className="fixed top-1/2 left-1/2 z-50 max-h-[90dvh] w-[calc(100%_-_2rem)] max-w-lg -translate-x-1/2 -translate-y-1/2 overflow-y-auto rounded-2xl border bg-background p-5 shadow-xl">
            <Dialog.Title className="font-bold text-xl">{t('details')}</Dialog.Title>
            <Dialog.Description className="mt-2">
              {detailTrack?.title} · {detailTrack?.artist}
            </Dialog.Description>
            {detailTrack ? (
              <dl className="my-5 space-y-3 break-all text-sm">
                <div>
                  <dt className="text-muted-foreground">{t('id')}</dt>
                  <dd className="font-mono">{detailTrack.id}</dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('file')}</dt>
                  <dd>
                    {detailTrack.fileName ?? '—'}
                    {detailTrack.bytes === null
                      ? ''
                      : ` · ${(detailTrack.bytes / 1024 / 1024).toFixed(1)} MB`}
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('effective')}</dt>
                  <dd>
                    <a
                      className="text-primary"
                      href={detailTrack.url}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {detailTrack.url}
                    </a>
                  </dd>
                </div>
                <div>
                  <dt className="text-muted-foreground">{t('meting')}</dt>
                  <dd>
                    <a
                      className="text-primary"
                      href={detailTrack.upstreamUrl || undefined}
                      rel="noreferrer"
                      target="_blank"
                    >
                      {detailTrack.upstreamUrl || '—'}
                    </a>
                  </dd>
                </div>
              </dl>
            ) : null}
            <Dialog.Close className={button}>{t('close')}</Dialog.Close>
          </Dialog.Popup>
        </Dialog.Portal>
      </Dialog.Root>
    </section>
  )
}
