import type { MetadataRoute } from 'next'
import { environment } from '@/server/environment'

export const dynamic = 'force-dynamic'

export default function robots(): MetadataRoute.Robots {
  return {
    rules: { userAgent: '*', allow: '/', disallow: ['/api/'] },
    sitemap: new URL('/sitemap.xml', environment.siteBaseUrl).toString(),
  }
}
