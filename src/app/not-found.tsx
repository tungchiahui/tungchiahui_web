import { headers } from 'next/headers'
import Link from 'next/link'
import { getLocale, getTranslations } from 'next-intl/server'

import { SiteShell } from '@/components/site-shell'
import { appLocalePrefixedHeader, parseAppLocale } from '@/i18n/locales'

export default async function NotFoundPage() {
  const locale = parseAppLocale(await getLocale())
  const prefixed = (await headers()).get(appLocalePrefixedHeader) === '1'
  const context = { locale, prefixed }
  const t = await getTranslations({ locale, namespace: 'Web' })
  return (
    <SiteShell context={context}>
      <section className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center">
        <h1 className="font-bold text-3xl">{t('notFoundTitle')}</h1>
        <p className="mt-4 text-muted-foreground">{t('notFoundDescription')}</p>
        <Link
          className="mt-6 inline-block text-primary hover:underline"
          href={prefixed ? `/${locale}` : '/'}
        >
          {t('home')}
        </Link>
      </section>
    </SiteShell>
  )
}
