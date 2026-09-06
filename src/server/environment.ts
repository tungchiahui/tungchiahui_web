import 'server-only'

import { parseEnvironment } from '@/config/environment-schema'

export const environment = parseEnvironment({
  NODE_ENV: process.env.NODE_ENV,
  SITE_BASE_URL: process.env.SITE_BASE_URL,
})
