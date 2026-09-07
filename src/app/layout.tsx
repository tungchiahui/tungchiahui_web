import type { Metadata } from 'next'
import Script from 'next/script'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { publicUmamiConfig } from '@/analytics/umami-config'

import './globals.css'

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Web')

  return {
    title: t('metadataTitle'),
    description: t('metadataDescription'),
  }
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale()
  const messages = await getMessages()

  return (
    <html lang={locale} suppressHydrationWarning>
      <body>
        <NextIntlClientProvider messages={messages}>{children}</NextIntlClientProvider>
        {process.env.NODE_ENV === 'production' ? (
          <Script
            data-domains={publicUmamiConfig.allowedDomains}
            data-website-id={publicUmamiConfig.websiteId}
            defer
            src={`${publicUmamiConfig.origin}/script.js`}
            strategy="afterInteractive"
          />
        ) : null}
      </body>
    </html>
  )
}
