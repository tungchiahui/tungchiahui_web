import type { MetadataRoute } from 'next'
import { listCachedDocuments } from '@/server/cached-content'
import { environment } from '@/server/environment'
import { publicSitemap } from '@/web/seo'

// Request-time XML uses the existing content-list tags, so sync/deletion is
// reflected without rebuilding the application or adding another cache layer.
export const dynamic = 'force-dynamic'

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  const [blogs, wikis] = await Promise.all([
    listCachedDocuments('blog', 'zh-cn'),
    listCachedDocuments('wiki', 'zh-cn'),
  ])
  return publicSitemap(environment.siteBaseUrl, [...blogs, ...wikis])
}
