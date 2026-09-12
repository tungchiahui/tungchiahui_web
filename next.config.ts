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
  async rewrites() {
    // The hermetic web development port proxies browser operations to the same
    // independent service. Production routing belongs exclusively to OpenResty.
    return process.env.SITE_RUNTIME_MODE === 'local' || process.env.SITE_RUNTIME_MODE === 'test'
      ? [{ source: '/api/ops/:path*', destination: 'http://control-api:8080/api/ops/:path*' }]
      : []
  },
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
