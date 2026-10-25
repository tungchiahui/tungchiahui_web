'use client'

import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { useCallback, useEffect, useRef, useState } from 'react'
import { z } from 'zod'
import { accountSessionResponseSchema } from '@/control-plane/account-contracts'
import { browserAudioDuration } from '@/music/browser-probe'
import {
  type LibraryTrack,
  type MusicCheck,
  maximumMusicBytes,
  musicCheckSchema,
  musicCsv,
  musicFileName,
  musicLibrarySchema,
} from '@/music/library-contracts'

type Library = ReturnType<typeof musicLibrarySchema.parse>
const api = '/api/ops/music'
const button = 'rounded-lg border px-3 py-2 text-sm disabled:opacity-50 hover:bg-muted'
async function request(path: string, input?: unknown, signal?: AbortSignal) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const response = await fetch(`${api}${path}`, {
      cache: 'no-store',
      signal: signal ?? AbortSignal.timeout(20_000),
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
  const [busy, setBusy] = useState(false)
  const [queue, setQueue] = useState<Array<{ file: File; trackId: string }>>([])
  const [source, setSource] = useState<'effective' | 'meting'>('effective')
  const controller = useRef<AbortController | null>(null)
  const refresh = useCallback(async () => {
    setLibrary(musicLibrarySchema.parse(await request('/library')))
    setMessage('')
  }, [])
  useEffect(() => {
    const load = () => {
      void refresh().catch(() => {
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
  const run = async (work: () => Promise<void>) => {
    setBusy(true)
    setMessage('')
    try {
      await work()
    } catch (error: unknown) {
      setMessage(
        error instanceof Error && error.name === 'AbortError'
          ? t('stopped')
          : error instanceof Error && error.message === '409'
            ? t('conflict')
            : t('failed'),
      )
    } finally {
      setBusy(false)
    }
  }
  const tracks = library?.tracks ?? []
  const checkFor = (track: LibraryTrack, kind: MusicCheck['source']) =>
    library?.checks.find((c) => c.id === track.id && c.source === kind)
  const visible = tracks.filter((track) => {
    const check = checkFor(track, 'effective')
    return (
      (filter !== 'cdn' || track.selfHosted) &&
      (filter !== 'missing' || check?.status === 'failed' || check?.status === 'preview') &&
      (filter !== 'recheck' || !check || check.status === 'uncertain') &&
      `${track.id} ${track.title} ${track.artist} ${track.fileName ?? ''}`
        .toLowerCase()
        .includes(query.toLowerCase())
    )
  })
  const scan = () =>
    run(async () => {
      const abort = new AbortController()
      controller.current = abort
      try {
        for (let i = 0; i < visible.length; i++) {
          if (abort.signal.aborted) break
          const track = visible[i]
          if (!track) continue
          setMessage(t('progress', { current: i + 1, total: visible.length }))
          const result = z
            .object({ check: musicCheckSchema })
            .parse(await request('/check', { id: track.id, source }, abort.signal))
          if (result.check.status === 'reachable' && !abort.signal.aborted) {
            const duration = await browserAudioDuration(
              source === 'effective' ? track.url : track.upstreamUrl,
              abort.signal,
            )
            if (!abort.signal.aborted)
              await request(
                '/check/browser',
                { id: track.id, source, urlHash: result.check.urlHash, duration },
                abort.signal,
              )
          }
          await refresh()
        }
        if (!abort.signal.aborted) setMessage(t('scanDone'))
      } finally {
        controller.current = null
      }
    })
  const upload = () =>
    run(async () => {
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
        <button
          className={button}
          disabled={busy}
          onClick={() =>
            void run(async () => {
              setLibrary(musicLibrarySchema.parse(await request('/sync', {})))
              setMessage(t('synced'))
            })
          }
          type="button"
        >
          {t('sync')}
        </button>
      </header>
      <nav aria-label={t('tabs')} className="my-6 flex flex-wrap gap-2">
        {(['library', 'checks', 'imports'] as const).map((key) => (
          <button
            aria-pressed={tab === key}
            className={`${button} ${tab === key ? 'bg-primary text-primary-foreground' : ''}`}
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
      {tab !== 'imports' ? (
        <>
          <div className="my-4 flex flex-wrap gap-3">
            <input
              aria-label={t('search')}
              className="min-w-0 flex-1 rounded-lg border bg-background p-2"
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t('search')}
              value={query}
            />
            <select
              aria-label={t('filter')}
              className="rounded-lg border bg-background p-2"
              onChange={(e) => setFilter(e.target.value as typeof filter)}
              value={filter}
            >
              {(['all', 'cdn', 'missing', 'recheck'] as const).map((key) => (
                <option key={key} value={key}>
                  {t(key)}
                </option>
              ))}
            </select>
            <button
              className={button}
              onClick={() =>
                saveFile(
                  'music-library.csv',
                  musicCsv(visible, library.checks, tab === 'checks' ? source : 'effective'),
                  'text/csv;charset=utf-8',
                )
              }
              type="button"
            >
              {t('csv')}
            </button>
            <button
              className={button}
              onClick={() =>
                saveFile(
                  'music-library.json',
                  JSON.stringify(
                    {
                      exportedAt: new Date().toISOString(),
                      tracks: visible,
                      checks: library.checks.filter((check) =>
                        visible.some((track) => track.id === check.id),
                      ),
                    },
                    null,
                    2,
                  ),
                  'application/json',
                )
              }
              type="button"
            >
              {t('json')}
            </button>
          </div>
          {tab === 'checks' ? (
            <div className="mb-5 flex flex-wrap items-center gap-3">
              <select
                aria-label={t('source')}
                className="rounded-lg border bg-background p-2"
                disabled={busy}
                onChange={(e) => setSource(e.target.value as typeof source)}
                value={source}
              >
                <option value="effective">{t('effective')}</option>
                <option value="meting">{t('meting')}</option>
              </select>
              <button className={button} disabled={busy} onClick={() => void scan()} type="button">
                {t('scan')}
              </button>
              <button
                className={button}
                disabled={!busy}
                onClick={() => controller.current?.abort()}
                type="button"
              >
                {t('stop')}
              </button>
              <p className="text-muted-foreground text-xs">{t('scanHint')}</p>
            </div>
          ) : null}
          <div className="overflow-x-auto rounded-xl border">
            <table className="w-full text-left text-sm">
              <thead className="bg-muted">
                <tr>
                  {(['song', 'id', 'file', 'source', 'status', 'actions'] as const).map((key) => (
                    <th className="p-3" key={key}>
                      {t(key)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visible.map((track) => {
                  const check = checkFor(track, tab === 'checks' ? source : 'effective')
                  return (
                    <tr className="border-t" key={track.id}>
                      <td className="p-3">
                        <strong>{track.title}</strong>
                        <p className="text-muted-foreground">{track.artist}</p>
                      </td>
                      <td className="p-3 font-mono text-xs">
                        <button
                          onClick={() =>
                            void navigator.clipboard
                              .writeText(track.id)
                              .then(() => setMessage(t('copied')))
                          }
                          title={t('copyId')}
                          aria-label={t('copyId')}
                          type="button"
                        >
                          {track.id}
                        </button>
                      </td>
                      <td className="max-w-64 break-words p-3">
                        {track.fileName ?? '—'}
                        <details className="mt-1 text-xs">
                          <summary>{t('url')}</summary>
                          <a
                            className="break-all text-primary"
                            href={track.url}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {track.url}
                          </a>
                        </details>
                        <p className="text-muted-foreground text-xs">
                          {track.bytes === null
                            ? ''
                            : `${(track.bytes / 1024 / 1024).toFixed(1)} MB`}
                        </p>
                      </td>
                      <td className="p-3">{t(track.selfHosted ? 'cdn' : 'meting')}</td>
                      <td className="p-3">
                        <span>
                          {t(
                            check?.status === 'failed'
                              ? 'checkFailed'
                              : (check?.status ?? 'unchecked'),
                          )}
                        </span>
                        {check ? (
                          <p className="text-muted-foreground text-xs">
                            {t(check.reason)}
                            <br />
                            {new Date(check.checkedAt).toLocaleString()}
                          </p>
                        ) : null}
                      </td>
                      <td className="p-3">
                        <div className="flex flex-wrap gap-2">
                          <a href={track.url} rel="noreferrer" target="_blank">
                            {t('listen')}
                          </a>
                          {track.selfHosted ? (
                            <button
                              onClick={() =>
                                void navigator.clipboard
                                  .writeText(track.url)
                                  .then(() => setMessage(t('copied')))
                              }
                              type="button"
                            >
                              {t('copyUrl')}
                            </button>
                          ) : null}
                          <a
                            href={`https://y.qq.com/n/ryqq/songDetail/${track.id.slice(8)}`}
                            rel="noreferrer"
                            target="_blank"
                          >
                            {t('qq')}
                          </a>
                          <button
                            onClick={() => {
                              setTab('imports')
                              setQuery(track.id)
                            }}
                            type="button"
                          >
                            {t('replace')}
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-3 text-muted-foreground text-sm">
            {t('total', { count: visible.length })}
          </p>
        </>
      ) : (
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
                        : (tracks.find((track) => track.id === query)?.id ?? ''),
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
            className={button}
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
          <code className="block overflow-x-auto rounded-lg bg-muted p-3">./site music studio</code>
          <h2 className="font-bold text-lg">{t('history')}</h2>
          {library.imports.map((task) => (
            <p className="break-all rounded border p-3 text-sm" key={task.id}>
              {task.fileName} · {task.trackId} ·{' '}
              {t(task.status === 'conflict' ? 'conflictStatus' : task.status)} ·{' '}
              {new Date(task.createdAt).toLocaleString()}
            </p>
          ))}
        </div>
      )}
    </section>
  )
}
