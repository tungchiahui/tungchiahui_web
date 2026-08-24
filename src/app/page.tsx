import { getTranslations } from 'next-intl/server'

export default async function HomePage() {
  const t = await getTranslations('Baseline')

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-6 py-16">
      <section className="w-full rounded-lg border bg-card p-8 text-card-foreground shadow-sm">
        <p className="font-medium text-primary text-sm tracking-[0.2em] uppercase">
          {t('eyebrow')}
        </p>
        <h1 className="mt-4 font-semibold text-4xl tracking-tight">{t('heading')}</h1>
        <p className="mt-4 max-w-2xl text-base/7 opacity-80">{t('description')}</p>
        <dl className="mt-8 grid gap-2 border-t pt-6 sm:grid-cols-[9rem_1fr]">
          <dt className="font-medium">{t('statusLabel')}</dt>
          <dd className="opacity-80">{t('statusValue')}</dd>
        </dl>
      </section>
    </main>
  )
}
