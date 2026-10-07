import { publicPageMetadata, renderPublicPage } from '@/web/public-page'

export const dynamic = 'force-dynamic'

export function generateMetadata() {
  return publicPageMetadata([], 'zh-cn')
}

export default function ZhCnHomePage() {
  return renderPublicPage([], { locale: 'zh-cn', prefixed: true })
}
