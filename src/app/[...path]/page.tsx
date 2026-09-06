import type { Metadata } from 'next'

import { publicPageMetadata, renderPublicPage } from '@/web/public-page'
import { parsePublicRoute } from '@/web/routes'

export const dynamic = 'force-dynamic'

type PageProperties = Readonly<{
  params: Promise<{ path: string[] }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}>

export async function generateMetadata({ params }: PageProperties): Promise<Metadata> {
  const route = parsePublicRoute((await params).path)
  return publicPageMetadata(route.segments, route.context.locale)
}

export default async function PublicRoutePage({ params, searchParams }: PageProperties) {
  const route = parsePublicRoute((await params).path)
  const query = (await searchParams).q
  return renderPublicPage(
    route.segments,
    route.context,
    typeof query === 'string' ? query : undefined,
  )
}
