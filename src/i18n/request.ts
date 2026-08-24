import { getRequestConfig } from 'next-intl/server'

import zhCnMessages from '../../messages/zh-cn.json'
import { defaultLocale } from './locales'

export default getRequestConfig(() => ({
  locale: defaultLocale,
  messages: zhCnMessages,
}))
