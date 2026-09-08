'use client'

import {
  Activity,
  ArrowDown,
  ArrowRight,
  ChartNoAxesCombined,
  Check,
  Clipboard,
  Cloud,
  CodeXml,
  Compass,
  Database,
  ExternalLink,
  FileUser,
  FolderOpen,
  Handshake,
  type LucideIcon,
  MessageCircle,
  Music2,
  Shapes,
  TriangleAlert,
  Weight,
} from 'lucide-react'
import Link from 'next/link'
import { useLocale, useTranslations } from 'next-intl'
import { useEffect, useState } from 'react'

type Entry = Readonly<{
  id: string
  descriptionKey: string
  href: string
  icon: LucideIcon
  titleKey: string
  external?: boolean
}>

const resources: readonly Entry[] = [
  {
    id: 'weightLoss',
    titleKey: 'weightLossTitle',
    descriptionKey: 'weightLossDescription',
    href: '/weight-loss',
    icon: Weight,
  },
  {
    id: 'music',
    titleKey: 'musicTitle',
    descriptionKey: 'musicDescription',
    href: '/music',
    icon: Music2,
  },
  {
    id: 'friends',
    titleKey: 'friendsTitle',
    descriptionKey: 'friendsDescription',
    href: '/friend',
    icon: Handshake,
  },
  {
    id: 'footprint',
    titleKey: 'footprintTitle',
    descriptionKey: 'footprintDescription',
    href: '/tech-footprint',
    icon: CodeXml,
  },
  { id: 'cv', titleKey: 'cvTitle', descriptionKey: 'cvDescription', href: '/cv', icon: FileUser },
  {
    id: 'start',
    titleKey: 'startTitle',
    descriptionKey: 'startDescription',
    href: '/start',
    icon: Compass,
  },
  {
    id: 'logo',
    titleKey: 'logoTitle',
    descriptionKey: 'logoDescription',
    href: '/mylogo',
    icon: Shapes,
  },
  {
    id: 'chat',
    titleKey: 'chatTitle',
    descriptionKey: 'chatDescription',
    href: 'https://chat.tungchiahui.cn',
    icon: MessageCircle,
    external: true,
  },
]

const storage = [
  {
    id: 'alist',
    titleKey: 'alistTitle',
    descriptionKey: 'alistDescription',
    endpoint: 'https://alist.tungchiahui.cn',
    badge: 'WEBUI',
    icon: FolderOpen,
    canOpen: true,
  },
  {
    id: 's3',
    titleKey: 's3Title',
    descriptionKey: 's3Description',
    endpoint: 'https://s3.tungchiahui.cn',
    badge: 'S3 API',
    icon: Database,
    canOpen: false,
  },
  {
    id: 'primaryCdn',
    titleKey: 'primaryCdnTitle',
    descriptionKey: 'primaryCdnDescription',
    endpoint: 'https://cdn.tungchiahui.cn',
    badge: 'PRIMARY',
    icon: Cloud,
    canOpen: false,
  },
  {
    id: 'globalCdn',
    titleKey: 'globalCdnTitle',
    descriptionKey: 'globalCdnDescription',
    endpoint: 'https://global.cdn.tungchiahui.cn',
    badge: 'R2 BACKUP',
    icon: Cloud,
    canOpen: false,
  },
] as const

export function MoreDirectory() {
  const t = useTranslations('Web.moreDirectory')
  const message = (key: string) => t(key as Parameters<typeof t>[0])
  const locale = useLocale()
  const [feedback, setFeedback] = useState<Readonly<{ id: string; ok: boolean }> | null>(null)

  useEffect(() => {
    if (!feedback) return
    const timer = window.setTimeout(() => setFeedback(null), 2000)
    return () => window.clearTimeout(timer)
  }, [feedback])

  const local = (path: string) => (locale === 'zh-cn' ? path : `/${locale}${path}`)

  async function copy(id: string, endpoint: string) {
    try {
      await navigator.clipboard.writeText(endpoint)
      setFeedback({ id, ok: true })
    } catch {
      setFeedback({ id, ok: false })
    }
  }

  return (
    <div className="more-directory">
      <section className="more-hero" aria-labelledby="more-title">
        <div>
          <p className="font-black text-primary text-sm tracking-[0.18em]">{t('kicker')}</p>
          <h1 className="mt-3 font-black text-4xl sm:text-6xl" id="more-title">
            {t('title')}
          </h1>
          <p className="mt-5 max-w-2xl text-lg text-muted-foreground">{t('description')}</p>
        </div>
        <nav aria-label={t('directoryLabel')} className="more-jump-nav">
          {[
            ['analytics', '02', t('analytics')],
            ['storage', '04', t('storage')],
            ['resources', '08', t('explore')],
          ].map(([id, count, label]) => (
            <a className="more-jump" href={`#${id}`} key={id}>
              <strong>{count}</strong>
              <span>{label}</span>
              <ArrowDown size={16} />
            </a>
          ))}
        </nav>
      </section>

      <DirectorySection
        description={t('analyticsDescription')}
        eyebrow="01 / INSIGHT"
        id="analytics"
        title={t('analytics')}
      >
        <div className="grid gap-4 md:grid-cols-2">
          <DirectoryCard
            description={t('statsDescription')}
            href={local('/stats')}
            icon={ChartNoAxesCombined}
            label={t('internal')}
            title={t('statsTitle')}
          />
          <DirectoryCard
            description={t('umamiDescription')}
            external
            href="https://umami.tungchiahui.cn/share/rCG6EZoHmlCmNnWn"
            icon={Activity}
            label={t('external')}
            title={t('umamiTitle')}
          />
        </div>
      </DirectorySection>

      <DirectorySection
        description={t('storageDescription')}
        eyebrow="02 / STORAGE"
        id="storage"
        title={t('storage')}
      >
        <div className="mb-5 hidden items-center justify-center gap-3 rounded-xl border bg-card p-4 font-mono text-sm md:flex">
          <span>AList WebUI</span>
          <ArrowRight size={15} />
          <span>S3 API</span>
          <ArrowRight size={15} />
          <span>Primary CDN · R2 Backup</span>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          {storage.map((service) => {
            const Icon = service.icon
            const result = feedback?.id === service.id ? feedback : null
            return (
              <article
                className="rounded-2xl border bg-gradient-to-br from-card to-primary/5 p-5 transition hover:border-primary hover:shadow-md"
                key={service.id}
              >
                <header className="flex items-center justify-between">
                  <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
                    <Icon size={20} />
                  </span>
                  <span className="rounded-full border px-2.5 py-1 font-bold text-[0.68rem] tracking-wider">
                    {service.badge}
                  </span>
                </header>
                <h3 className="mt-5 font-bold text-lg">{message(service.titleKey)}</h3>
                <p className="mt-2 min-h-12 text-muted-foreground text-sm">
                  {message(service.descriptionKey)}
                </p>
                <code className="mt-4 block overflow-x-auto rounded-lg bg-background p-2 text-xs">
                  {service.endpoint}
                </code>
                <div className="mt-4 flex flex-wrap gap-2">
                  {service.canOpen ? (
                    <a
                      className="more-action"
                      href={service.endpoint}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={15} />
                      {t('open')}
                    </a>
                  ) : null}
                  <button
                    aria-label={`${t('copy')}：${message(service.titleKey)}`}
                    className="more-action"
                    onClick={() => void copy(service.id, service.endpoint)}
                    type="button"
                  >
                    {result ? (
                      result.ok ? (
                        <Check size={15} />
                      ) : (
                        <TriangleAlert size={15} />
                      )
                    ) : (
                      <Clipboard size={15} />
                    )}
                    {result ? (result.ok ? t('copied') : t('copyFailed')) : t('copy')}
                  </button>
                </div>
              </article>
            )
          })}
        </div>
      </DirectorySection>

      <DirectorySection
        description={t('exploreDescription')}
        eyebrow="03 / EXPLORE"
        id="resources"
        title={t('explore')}
      >
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {resources.map((entry) => (
            <DirectoryCard
              description={message(entry.descriptionKey)}
              external={entry.external ?? false}
              href={entry.external ? entry.href : local(entry.href)}
              icon={entry.icon}
              key={entry.id}
              label={entry.external ? t('external') : t('internal')}
              title={message(entry.titleKey)}
            />
          ))}
        </div>
      </DirectorySection>
    </div>
  )
}

function DirectorySection({
  children,
  description,
  eyebrow,
  id,
  title,
}: Readonly<{
  children: React.ReactNode
  description: string
  eyebrow: string
  id: string
  title: string
}>) {
  return (
    <section className="scroll-mt-24 py-10" id={id}>
      <header className="mb-6 grid gap-3 border-b pb-5 md:grid-cols-[1fr_1fr]">
        <div>
          <p className="font-mono text-primary text-xs">{eyebrow}</p>
          <h2 className="mt-2 font-black text-3xl">{title}</h2>
        </div>
        <p className="self-end text-muted-foreground">{description}</p>
      </header>
      {children}
    </section>
  )
}

function DirectoryCard({
  description,
  external = false,
  href,
  icon: Icon,
  label,
  title,
}: Readonly<{
  description: string
  external?: boolean
  href: string
  icon: LucideIcon
  label: string
  title: string
}>) {
  const content = (
    <>
      <span className="grid size-11 place-items-center rounded-xl bg-primary/10 text-primary">
        <Icon size={21} />
      </span>
      <span className="absolute top-5 right-5 font-bold text-[0.65rem] text-muted-foreground tracking-widest">
        {label}
      </span>
      <h3 className="mt-5 font-bold text-xl">{title}</h3>
      <p className="mt-2 text-muted-foreground text-sm">{description}</p>
      <span className="mt-6 inline-flex items-center text-primary">
        <ArrowRight size={18} />
      </span>
    </>
  )
  const className =
    'relative block rounded-2xl border bg-gradient-to-br from-card to-primary/5 p-5 transition hover:-translate-y-1 hover:border-primary hover:shadow-lg'
  return external ? (
    <a className={className} href={href} rel="noreferrer" target="_blank">
      {content}
    </a>
  ) : (
    <Link className={className} href={href}>
      {content}
    </Link>
  )
}
