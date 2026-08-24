import { renderPublicPage } from '@/web/public-page'

export const dynamic = 'force-dynamic'

export default function HomePage() {
  return renderPublicPage([], false)
}
