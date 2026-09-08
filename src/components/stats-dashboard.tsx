'use client'

import { BarChart3, RefreshCw } from 'lucide-react'
import { useLocale, useTranslations } from 'next-intl'
import { useCallback, useEffect, useState } from 'react'

import {
  type PublicMetricRow,
  type PublicOverview,
  publicOverviewSchema,
} from '@/analytics/public-overview'

const publicShareUrl = 'https://umami.tungchiahui.cn/share/rCG6EZoHmlCmNnWn'
const metricTypes = [
  'path',
  'referrer',
  'channel',
  'country',
  'region',
  'city',
  'browser',
  'os',
  'device',
  'event',
] as const

export function StatsDashboard() {
  const t = useTranslations('Web.stats')
  const locale = useLocale()
  const [overview, setOverview] = useState<PublicOverview | null>(null)
  const [loading, setLoading] = useState(true)
  const [failed, setFailed] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)
    setFailed(false)
    try {
      const response = await fetch('/api/stats', { cache: 'no-store' })
      if (!response.ok) throw new Error('stats unavailable')
      setOverview(publicOverviewSchema.parse(await response.json()))
    } catch {
      setFailed(true)
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => void load(), [load])

  const numberLocale = locale === 'en-us' ? 'en-US' : 'zh-CN'
  const formatNumber = (value: number) => Math.round(value).toLocaleString(numberLocale)
  const formatDuration = (value: number) => {
    const seconds = Math.max(0, Math.round(value))
    const hours = Math.floor(seconds / 3600)
    const minutes = Math.floor((seconds % 3600) / 60)
    const remainder = seconds % 60
    if (hours) return `${hours}${t('hour')} ${minutes}${t('minute')} ${remainder}${t('second')}`
    if (minutes) return `${minutes}${t('minute')} ${remainder}${t('second')}`
    return `${remainder}${t('second')}`
  }

  const summary = overview?.summary
  const cards = summary
    ? [
        [t('visitors'), formatNumber(summary.visitors)],
        [t('visits'), formatNumber(summary.visits)],
        [t('pageviews'), formatNumber(summary.pageviews)],
        [t('bounces'), formatNumber(summary.bounces)],
        [t('bounceRate'), `${Math.round(summary.bounceRate * 100)}%`],
        [t('averageVisit'), formatDuration(summary.averageVisitSeconds)],
        [t('pagesPerVisit'), summary.pagesPerVisit.toFixed(2)],
        [t('totalTime'), formatDuration(summary.totalTime)],
      ]
    : []

  return (
    <div className="stats-page">
      <header className="stats-hero">
        <p className="legacy-kicker">ANALYTICS</p>
        <h1>
          <BarChart3 aria-hidden="true" /> {t('title')}
        </h1>
        <p>{t('description')}</p>
        <button
          className="legacy-secondary-link"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw aria-hidden="true" className={loading ? 'animate-spin' : ''} size={16} />
          {loading ? t('refreshing') : t('refresh')}
        </button>
      </header>

      {failed ? <p className="stats-status">{t('unavailable')}</p> : null}
      {loading && !overview ? <p className="stats-status">{t('loading')}</p> : null}
      {cards.length ? (
        <section aria-label={t('overview')} className="stats-summary-grid">
          {cards.map(([label, value]) => (
            <article className="stats-summary-card" key={label}>
              <span>{label}</span>
              <strong>{value}</strong>
            </article>
          ))}
        </section>
      ) : null}

      {overview ? (
        <section className="stats-panel-grid">
          {metricTypes.map((type) => (
            <MetricPanel
              key={type}
              rows={overview.top[type] ?? []}
              title={t(`section.${type}`)}
              type={type}
            />
          ))}
        </section>
      ) : null}

      <section aria-label={t('publicDashboard')} className="stats-frame-wrap">
        <iframe
          className="stats-frame"
          loading="lazy"
          referrerPolicy="no-referrer-when-downgrade"
          src={publicShareUrl}
          title={t('publicDashboard')}
        />
      </section>
    </div>
  )
}

function MetricPanel({
  rows,
  title,
  type,
}: Readonly<{
  rows: readonly PublicMetricRow[]
  title: string
  type: (typeof metricTypes)[number]
}>) {
  const t = useTranslations('Web.stats')
  const metricValue = (row: PublicMetricRow) => {
    if (type === 'path')
      return `${Math.round(row.pageviews)} ${t('pageviewsUnit')} · ${Math.round(row.visits)} ${t('visitsUnit')}`
    if (type === 'country' || type === 'region' || type === 'city')
      return `${Math.round(row.visitors)} ${t('visitorsUnit')}`
    if (type === 'event') return `${Math.round(row.pageviews)} ${t('timesUnit')}`
    return `${Math.round(row.visits)} ${t('visitsUnit')}`
  }
  return (
    <article className="stats-panel">
      <h2>{title}</h2>
      {rows.length ? (
        <ol>
          {rows.map((row, index) => (
            <li key={`${row.name}-${row.visits}-${row.pageviews}`}>
              <b>{index + 1}</b>
              <span>{row.name || t('direct')}</span>
              <small>{metricValue(row)}</small>
            </li>
          ))}
        </ol>
      ) : (
        <p>{t('empty')}</p>
      )}
    </article>
  )
}
