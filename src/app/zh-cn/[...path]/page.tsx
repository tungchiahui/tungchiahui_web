import type { Metadata } from 'next'

import { publicPageMetadata, renderPublicPage } from '@/web/public-page'

export const dynamic = 'force-dynamic'

type PageProperties = Readonly<{ params: Promise<{ path: string[] }> }>

export async function generateMetadata({ params }: PageProperties): Promise<Metadata> {
  return publicPageMetadata((await params).path)
}

export default async function ZhCnPublicRoutePage({ params }: PageProperties) {
  return renderPublicPage((await params).path, true)
}
