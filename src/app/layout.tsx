import type { Metadata } from 'next'
import Script from 'next/script'
import { NextIntlClientProvider } from 'next-intl'
import { getLocale, getMessages, getTranslations } from 'next-intl/server'
import type { ReactNode } from 'react'

import { publicUmamiConfig } from '@/analytics/umami-config'
import { CdnFontAwesome } from '@/components/cdn-font-awesome'
import { GlobalMusicPlayer } from '@/components/global-music-player'
import { MusicPlayerProvider } from '@/components/music-player-provider'

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
        <CdnFontAwesome />
        <NextIntlClientProvider messages={messages}>
          <MusicPlayerProvider>
            {children}
            <GlobalMusicPlayer />
          </MusicPlayerProvider>
        </NextIntlClientProvider>
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
