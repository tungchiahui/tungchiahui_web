import OpenCC from 'opencc-js'
import { contentGlossary } from './content-glossary'
import type { AppLocale } from './locales'

export type ContentLocaleState = 'converted' | 'fallback' | 'source'

const converters = {
  'zh-hk': OpenCC.Converter({ from: 'cn', to: 'hk' }),
  'zh-tw': OpenCC.Converter({ from: 'cn', to: 'twp' }),
} as const

const dynamicProtectedPattern =
  /https?:\/\/[^\s<>()]+|[A-Za-z][A-Za-z0-9]*(?:[._:/#@+-][A-Za-z0-9]+)+/gu

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function protectedPattern() {
  const terms = [
    ...contentGlossary.protectedTerms,
    ...contentGlossary.exceptions.map((entry) => entry.source),
  ]
    .toSorted((left, right) => right.length - left.length)
    .map(escapeRegExp)
  return new RegExp(`${terms.join('|')}|${dynamicProtectedPattern.source}`, 'gu')
}

export function contentLocaleState(locale: AppLocale): ContentLocaleState {
  switch (locale) {
    case 'zh-cn':
      return 'source'
    case 'zh-hk':
    case 'zh-tw':
      return 'converted'
    case 'en-us':
      return 'fallback'
  }
}

export function localizeContentText(value: string, locale: AppLocale) {
  if (locale === 'zh-cn' || locale === 'en-us') return value
  const converter = converters[locale]
  const exceptions = new Map(
    contentGlossary.exceptions.map((entry) => [entry.source, entry.targets[locale]] as const),
  )
  const pattern = protectedPattern()
  let result = ''
  let cursor = 0
  for (const match of value.matchAll(pattern)) {
    const index = match.index
    const protectedValue = match[0]
    result += converter(value.slice(cursor, index))
    result += exceptions.get(protectedValue) ?? protectedValue
    cursor = index + protectedValue.length
  }
  return result + converter(value.slice(cursor))
}
