import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { type AppLocale, locales } from '@/i18n/locales'
import { localeSwitchPath, type PublicRouteContext, withLocalePrefix } from '@/web/routes'

import { ThemeToggle } from './theme-toggle'

export async function SiteShell({
  children,
  context,
  logicalPath = '/',
}: Readonly<{ children: ReactNode; context: PublicRouteContext; logicalPath?: string }>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const links = [
    { path: '/', label: t('home') },
    { path: '/blog', label: t('blog') },
    { path: '/wiki', label: t('wiki') },
    { path: '/search', label: t('search') },
    { path: '/about', label: t('about') },
    { path: '/more', label: t('more') },
  ]
  const localeLabels: Record<AppLocale, string> = {
    'en-us': t('locale.enUs'),
    'zh-cn': t('locale.zhCn'),
    'zh-hk': t('locale.zhHk'),
    'zh-tw': t('locale.zhTw'),
  }

  return (
    <div className="min-h-screen">
      <a className="sr-only focus:not-sr-only" href="#main-content">
        {t('skipToContent')}
      </a>
      <header className="sticky top-0 z-20 border-b bg-background/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-5 px-5 py-3">
          <Link
            className="mr-auto font-bold text-xl tracking-tight"
            href={withLocalePrefix('/', context)}
          >
            {t('siteName')}
          </Link>
          <nav aria-label={t('navigationLabel')} className="hidden items-center gap-4 sm:flex">
            {links.map((link) => (
              <Link
                className="text-sm hover:text-primary"
                href={withLocalePrefix(link.path, context)}
                key={link.path}
              >
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
          <div>
            <p>{t('footerDescription')}</p>
            <nav
              aria-label={t('languageSwitcher')}
              className="mt-3 flex flex-wrap gap-x-3"
              data-locale-switch
            >
              {locales.map((locale) => (
                <Link
                  aria-current={locale === context.locale ? 'page' : undefined}
                  className={locale === context.locale ? 'font-semibold text-primary' : undefined}
                  href={localeSwitchPath(logicalPath, locale)}
                  hrefLang={locale}
                  key={locale}
                >
                  {localeLabels[locale]}
                </Link>
              ))}
            </nav>
          </div>
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
