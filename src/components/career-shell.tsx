import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'
import { type AppLocale, locales } from '@/i18n/locales'
import { localeSwitchPath, type PublicRouteContext, withLocalePrefix } from '@/web/routes'

// A plain document presentation for recruiting pages, independent of the blog theme.
export async function CareerShell({
  children,
  context,
  logicalPath,
}: Readonly<{
  children: ReactNode
  context: PublicRouteContext
  logicalPath: string
}>) {
  const t = await getTranslations({ locale: context.locale, namespace: 'Web' })
  const names: Record<AppLocale, string> = {
    'zh-cn': t('locale.zhCn'),
    'zh-hk': t('locale.zhHk'),
    'zh-tw': t('locale.zhTw'),
    'en-us': t('locale.enUs'),
  }
  const links = [
    { path: '/cv', label: t('special.cvTitle') },
    { path: '/projects', label: t('project') },
    { path: '/contact', label: t('portfolio.contact') },
  ]
  return (
    <div className="career-shell">
      <a className="sr-only focus:not-sr-only" href="#main-content">
        {t('skipToContent')}
      </a>
      <header className="career-header" data-site-header>
        <div className="career-header-inner">
          <Link className="career-name" href={withLocalePrefix('/', context)}>
            {t('siteName')}
          </Link>
          <nav aria-label={t('navigationLabel')}>
            {links.map(({ path, label }) => (
              <Link
                href={withLocalePrefix(path, context)}
                key={path}
                aria-current={
                  logicalPath === path || logicalPath.startsWith(`${path}/`) ? 'page' : undefined
                }
              >
                {label}
              </Link>
            ))}
          </nav>
        </div>
      </header>
      <main id="main-content" className="career-main">
        <nav className="career-languages" aria-label={t('languageSwitcher')} data-locale-switch>
          {locales.map((locale) => (
            <Link
              href={localeSwitchPath(logicalPath, locale)}
              hrefLang={locale}
              key={locale}
              aria-current={locale === context.locale ? 'page' : undefined}
            >
              {names[locale]}
            </Link>
          ))}
        </nav>
        {children}
      </main>
      <footer className="site-footer career-footer">
        <p>{t('footerCopyright', { year: new Date().getFullYear() })}</p>
        <nav aria-label={t('filingLabel')}>
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
      </footer>
    </div>
  )
}
