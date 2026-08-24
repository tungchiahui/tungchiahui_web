import type { NextRequest } from 'next/server'
import { NextResponse } from 'next/server'

import {
  appLocaleHeader,
  appLocalePrefixedHeader,
  localeFromPathname,
  locales,
} from '@/i18n/locales'

export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set(appLocaleHeader, localeFromPathname(request.nextUrl.pathname))
  requestHeaders.set(
    appLocalePrefixedHeader,
    locales.some((locale) => request.nextUrl.pathname.match(new RegExp(`^/${locale}(?:/|$)`, 'u')))
      ? '1'
      : '0',
  )
  return NextResponse.next({ request: { headers: requestHeaders } })
}

export const config = {
  matcher: ['/((?!api|_next|docs|.*\\..*).*)'],
}
