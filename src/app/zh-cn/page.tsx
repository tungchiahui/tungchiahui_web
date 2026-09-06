import { renderPublicPage } from '@/web/public-page'

export const dynamic = 'force-dynamic'

export default function ZhCnHomePage() {
  return renderPublicPage([], { locale: 'zh-cn', prefixed: true })
}
