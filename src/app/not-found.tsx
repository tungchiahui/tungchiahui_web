import Link from 'next/link'
import { getTranslations } from 'next-intl/server'

import { SiteShell } from '@/components/site-shell'

export default async function NotFoundPage() {
  const t = await getTranslations('Web')
  return (
    <SiteShell prefixed={false}>
      <section className="mx-auto max-w-2xl rounded-2xl border bg-card p-8 text-center">
        <h1 className="font-bold text-3xl">{t('notFoundTitle')}</h1>
        <p className="mt-4 text-muted-foreground">{t('notFoundDescription')}</p>
        <Link className="mt-6 inline-block text-primary hover:underline" href="/">
          {t('home')}
        </Link>
      </section>
    </SiteShell>
  )
}
