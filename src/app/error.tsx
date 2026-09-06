'use client'

import { useTranslations } from 'next-intl'

import { Button } from '@/components/ui/button'

export default function ErrorPage({ reset }: Readonly<{ error: Error; reset: () => void }>) {
  const t = useTranslations('Web')
  return (
    <main className="mx-auto grid min-h-screen max-w-2xl place-content-center px-5 text-center">
      <h1 className="font-bold text-3xl">{t('errorTitle')}</h1>
      <p className="mt-4 text-muted-foreground">{t('errorDescription')}</p>
      <Button className="mx-auto mt-6" onClick={reset} type="button">
        {t('retry')}
      </Button>
    </main>
  )
}
