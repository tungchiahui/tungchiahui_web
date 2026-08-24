import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { ThemeToggle } from './theme-toggle'

export async function SiteShell({
  children,
  prefixed,
}: Readonly<{ children: ReactNode; prefixed: boolean }>) {
  const t = await getTranslations('Web')
  const prefix = prefixed ? '/zh-cn' : ''
  const links = [
    { href: prefix || '/', label: t('home') },
    { href: `${prefix}/blog`, label: t('blog') },
    { href: `${prefix}/wiki`, label: t('wiki') },
    { href: `${prefix}/about`, label: t('about') },
    { href: `${prefix}/more`, label: t('more') },
  ]

  return (
    <div className="min-h-screen">
      <a className="sr-only focus:not-sr-only" href="#main-content">
        {t('skipToContent')}
      </a>
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
          <Link className="mr-auto font-bold text-xl tracking-tight" href={prefix || '/'}>
            {t('siteName')}
          </Link>
          <nav aria-label={t('navigationLabel')} className="hidden items-center gap-4 sm:flex">
            {links.map((link) => (
              <Link className="text-sm hover:text-primary" href={link.href} key={link.href}>
                {link.label}
              </Link>
            ))}
          </nav>
          <ThemeToggle label={t('themeToggle')} />
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-5 py-10" id="main-content">
        {children}
      </main>
      <footer className="border-t">
        <div className="mx-auto grid max-w-6xl gap-3 px-5 py-8 text-sm sm:grid-cols-2">
          <p>{t('footerDescription')}</p>
          <nav aria-label={t('filingLabel')} className="flex flex-wrap gap-x-4 sm:justify-end">
            <a href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">
              {t('icp')}
            </a>
            <a
              href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=37030302001121"
              rel="noreferrer"
              target="_blank"
            >
              {t('publicSecurity')}
            </a>
          </nav>
        </div>
      </footer>
    </div>
  )
}
