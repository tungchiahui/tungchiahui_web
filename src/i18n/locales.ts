export const locales = ['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] as const

export type AppLocale = (typeof locales)[number]

export const defaultLocale: AppLocale = 'zh-cn'
