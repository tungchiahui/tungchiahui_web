import type { Metadata } from 'next'

import { publicPageMetadata, renderPublicPage } from '@/web/public-page'

export const dynamic = 'force-dynamic'

type PageProperties = Readonly<{
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}>

export async function generateMetadata({ params }: PageProperties): Promise<Metadata> {
  return publicPageMetadata((await params).path, 'zh-cn')
}

export default async function ZhCnPublicRoutePage({ params, searchParams }: PageProperties) {
  return renderPublicPage(
    (await params).path,
    { locale: 'zh-cn', prefixed: true },
    await searchParams,
  )
}
