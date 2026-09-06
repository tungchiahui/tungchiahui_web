import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import {
  appLocaleHeader,
  appLocalePrefixedHeader,
  localeFromPathname,
  locales,
} from '@/i18n/locales'
import { emitTelemetry, requestIdFromHeaders } from '@/observability/telemetry'

export function proxy(request: NextRequest) {
  const requestId = requestIdFromHeaders(request.headers)
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-request-id', requestId)
  requestHeaders.set(appLocaleHeader, localeFromPathname(request.nextUrl.pathname))
  requestHeaders.set(
    appLocalePrefixedHeader,
    locales.some((locale) => request.nextUrl.pathname.match(new RegExp(`^/${locale}(?:/|$)`, 'u')))
      ? '1'
      : '0',
  )
  emitTelemetry({
    attributes: {
      method: request.method,
      route: request.nextUrl.pathname.slice(0, 500),
      slot: process.env.SITE_SLOT ?? null,
    },
    component: 'nextjs',
    event: 'request_received',
    level: 'info',
    requestId,
  })
  const response = NextResponse.next({ request: { headers: requestHeaders } })
  response.headers.set('x-request-id', requestId)
  return response
}

export const config = {
  matcher: ['/((?!api|_next|docs|.*\\..*).*)'],
}
