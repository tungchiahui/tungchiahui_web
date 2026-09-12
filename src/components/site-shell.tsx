import { Search } from 'lucide-react'
import Link from 'next/link'
import { getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { type AppLocale, locales } from '@/i18n/locales'
import { localeSwitchPath, type PublicRouteContext, withLocalePrefix } from '@/web/routes'
import { MobileNavigation } from './mobile-navigation'
import { ThemeToggle } from './theme-toggle'

const socialLinks = [
  ['Website', 'https://www.tungchiahui.cn', 'fas fa-link'],
  ['E-Mail', 'mailto:tungchiahui@gmail.com', 'fas fa-envelope'],
  ['GitHub', 'https://github.com/tungchiahui', 'fab fa-github'],
  ['QQ', 'https://qm.qq.com/q/JRhksaNK82?from=qq', 'fab fa-qq'],
  ['Telegram', 'https://t.me/tungchiahui', 'fab fa-telegram'],
  ['Bilibili', 'https://space.bilibili.com/141482453', 'fa-brands fa-bilibili'],
  ['YouTube', 'https://www.youtube.com/@Chia-huiTung', 'fab fa-youtube'],
  ['Twitter', 'https://twitter.com/tungchiahui', 'fab fa-twitter'],
  ['Instagram', 'https://www.instagram.com/tungchiahui', 'fab fa-instagram'],
  ['Facebook', 'https://www.facebook.com/tungchiahui', 'fab fa-facebook'],
  [
    'Douyin',
    'https://www.douyin.com/user/MS4wLjABAAAA3V6NoUIGPi3_EjzGc4Uxb-JZHOwWtuclAlrKF6SJTM7SET0PseLNV1bcDYwmcu9T',
    'fab fa-tiktok',
  ],
  ['TikTok', 'https://www.tiktok.com/@tungchiahui', 'fab fa-tiktok'],
  ['CoolAPK', 'http://www.coolapk.com/u/3224578', 'fab fa-android'],
] as const

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
    { path: '/about', label: t('about') },
    { path: '/more', label: t('more') },
  ]
  const footerLinks = [
    { path: '/blog', label: t('blog'), icon: 'fas fa-newspaper' },
    { path: '/wiki', label: t('wiki'), icon: 'fas fa-book-open' },
    { path: '/stats', label: t('special.statsTitle'), icon: 'fas fa-chart-line' },
    { path: '/friend', label: t('special.friendTitle'), icon: 'fas fa-handshake' },
    { path: '/about', label: t('about'), icon: 'fas fa-circle-info' },
    { path: '/more', label: t('more'), icon: 'fas fa-table-cells-large' },
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
            aria-label={t('siteName')}
            className="site-brand-mark mr-auto"
            href={withLocalePrefix('/', context)}
            title={t('siteName')}
          >
            {/* biome-ignore lint/performance/noImgElement: the exact Legacy ICO is also the browser favicon and is intentionally reused as the site mark. */}
            <img alt="" height="34" src="/favicon.ico" width="34" />
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
          <div className="flex items-center gap-2">
            <MobileNavigation
              buttonLabel={t('menu')}
              closeLabel={t('close')}
              links={links.map((link) => ({
                href: withLocalePrefix(link.path, context),
                label: link.label,
              }))}
              navigationLabel={t('navigationLabel')}
            />
            <Link
              aria-label={t('search')}
              className="grid size-10 place-items-center rounded-full border bg-card shadow-sm transition hover:border-primary hover:text-primary"
              href={withLocalePrefix('/search', context)}
              title={t('search')}
            >
              <Search aria-hidden size={18} />
            </Link>
            <ThemeToggle
              labels={{
                dark: t('themeDark'),
                light: t('themeLight'),
                menu: t('themeToggle'),
                system: t('themeSystem'),
              }}
            />
          </div>
        </div>
      </header>
      <main className="mx-auto w-full max-w-[112rem] px-5 py-10" id="main-content">
        {children}
      </main>
      <footer className="site-footer">
        <div className="site-footer-shell">
          <section className="site-footer-intro" aria-label={t('footerSiteInfo')}>
            <Link className="site-footer-mark" href={withLocalePrefix('/', context)}>
              <span aria-hidden="true" className="site-footer-mark-icon">
                <i className="fas fa-compass" />
              </span>
              <span className="site-footer-mark-copy">
                <strong>{t('siteName')}</strong>
                <small>{t('footerLabNotes')}</small>
              </span>
            </Link>
            <p>{t('footerDescription')}</p>
            <a
              className="site-footer-powered"
              href="https://nextjs.org"
              rel="noreferrer"
              target="_blank"
            >
              <span aria-hidden="true">N</span>
              {t('footerPoweredBy')}
            </a>
          </section>

          <nav className="site-footer-nav" aria-label={t('footerNavigation')}>
            <h2>{t('footerNavigation')}</h2>
            <div>
              {footerLinks.map((link) => (
                <Link href={withLocalePrefix(link.path, context)} key={link.path}>
                  <i aria-hidden="true" className={link.icon} />
                  <span>{link.label}</span>
                </Link>
              ))}
            </div>
          </nav>

          <section className="site-footer-language" aria-label={t('languageSwitcher')}>
            <h2>{t('footerLanguage')}</h2>
            <nav data-locale-switch>
              {locales.map((locale) => (
                <Link
                  aria-current={locale === context.locale ? 'page' : undefined}
                  href={localeSwitchPath(logicalPath, locale)}
                  hrefLang={locale}
                  key={locale}
                >
                  {localeLabels[locale]}
                </Link>
              ))}
            </nav>
          </section>

          <section className="site-footer-connect" aria-label={t('footerContact')}>
            <h2>{t('footerContact')}</h2>
            <div>
              {socialLinks.map(([label, href, icon]) => (
                <a aria-label={label} href={href} key={label} rel="noreferrer" target="_blank">
                  <i aria-hidden="true" className={icon} />
                  <span className="sr-only">{label}</span>
                </a>
              ))}
            </div>
          </section>

          <div className="site-footer-bottom">
            <p>{t('footerCopyright', { year: new Date().getFullYear() })}</p>
            <nav aria-label={t('filingLabel')}>
              <a href="https://beian.miit.gov.cn/" rel="noreferrer" target="_blank">
                {/* biome-ignore lint/performance/noImgElement: small approved public CDN filing mark */}
                <img
                  alt={t('footerMiitIconAlt')}
                  src="https://cdn.tungchiahui.cn/tungwebsite/assets/images/footer/favicon-miit.webp"
                />
                {t('icp')}
              </a>
              <a
                href="http://www.beian.gov.cn/portal/registerSystemInfo?recordcode=37030302001121"
                rel="noreferrer"
                target="_blank"
              >
                {/* biome-ignore lint/performance/noImgElement: small approved public CDN filing mark */}
                <img
                  alt={t('footerMpsIconAlt')}
                  src="https://cdn.tungchiahui.cn/tungwebsite/assets/images/footer/favicon-mps.webp"
                />
                {t('publicSecurity')}
              </a>
            </nav>
          </div>
        </div>
      </footer>
    </div>
  )
}
