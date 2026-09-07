import type { NextConfig } from 'next'
import createNextIntlPlugin from 'next-intl/plugin'

import { browserSecurityHeaders } from './src/observability/security'

const withNextIntl = createNextIntlPlugin('./src/i18n/request.ts')

const nextConfig: NextConfig = {
  allowedDevOrigins: ['127.0.0.1'],
  devIndicators: { position: 'bottom-right' },
  output: 'standalone',
  poweredByHeader: false,
  reactStrictMode: true,
  async headers() {
    return [
      {
        headers: Object.entries(browserSecurityHeaders).map(([key, value]) => ({ key, value })),
        source: '/:path*',
      },
    ]
  },
}

export default withNextIntl(nextConfig)
