const developmentEvalSource = process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''
const approvedAnalyticsOrigin = 'https://umami.tungchiahui.cn'

export const browserSecurityHeaders = Object.freeze({
  'content-security-policy': [
    "default-src 'self'",
    "base-uri 'self'",
    `connect-src 'self' ${approvedAnalyticsOrigin}`,
    "font-src 'self' data:",
    "form-action 'self'",
    "frame-ancestors 'none'",
    "img-src 'self' data: https:",
    "media-src 'self' https:",
    "object-src 'none'",
    `script-src 'self' 'unsafe-inline'${developmentEvalSource} ${approvedAnalyticsOrigin}`,
    "style-src 'self' 'unsafe-inline'",
    'upgrade-insecure-requests',
  ].join('; '),
  'cross-origin-opener-policy': 'same-origin',
  'permissions-policy': 'camera=(), geolocation=(), microphone=(), payment=(), usb=()',
  'referrer-policy': 'strict-origin-when-cross-origin',
  'strict-transport-security': 'max-age=31536000; includeSubDomains',
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
})

export const apiSecurityHeaders = Object.freeze({
  'cache-control': 'no-store',
  'content-security-policy': "default-src 'none'; frame-ancestors 'none'",
  'permissions-policy': browserSecurityHeaders['permissions-policy'],
  'referrer-policy': 'no-referrer',
  'strict-transport-security': browserSecurityHeaders['strict-transport-security'],
  'x-content-type-options': 'nosniff',
  'x-frame-options': 'DENY',
})
