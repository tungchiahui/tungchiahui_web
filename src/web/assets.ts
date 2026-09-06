import { z } from 'zod'

const absoluteAssetUrlSchema = z.url().superRefine((value, context) => {
  const url = new URL(value)
  if (url.protocol !== 'https:') {
    context.addIssue({ code: 'custom', message: 'Remote public assets must use HTTPS' })
  }
})

function hasOnlySafeLocalAssetCharacters(value: string) {
  for (const character of value) {
    const codePoint = character.codePointAt(0)
    if (codePoint === undefined || codePoint <= 0x20 || `"'<>\`?#`.includes(character)) {
      return false
    }
  }
  return true
}

const localAssetPathSchema = z
  .string()
  .startsWith('/')
  .refine(
    (value) =>
      !value.includes('..') && !/%2e/i.test(value) && hasOnlySafeLocalAssetCharacters(value),
    'Unsafe local asset path',
  )

export type PublicAsset = Readonly<{
  cachePolicy: 'immutable' | 'revalidated'
  origin: 'cdn' | 'external' | 'local'
  url: string
}>

export function resolvePublicAsset(input: unknown): PublicAsset {
  const value = z.string().trim().min(1).parse(input)
  if (value.startsWith('/')) {
    const path = localAssetPathSchema.parse(value)
    if (!/^\/(?:api\/assets|docs\/ros2|images)\//.test(path)) {
      throw new Error(`Unsupported local public asset path: ${path}`)
    }
    return Object.freeze({
      cachePolicy: /[._-][a-f0-9]{8,}(?:\.|-)/i.test(path) ? 'immutable' : 'revalidated',
      origin: 'local',
      url: path,
    })
  }

  const url = new URL(absoluteAssetUrlSchema.parse(value))
  const origin = url.hostname === 'cdn.tungchiahui.cn' ? 'cdn' : 'external'
  return Object.freeze({
    cachePolicy: /[._-][a-f0-9]{8,}(?:\.|-)/i.test(url.pathname) ? 'immutable' : 'revalidated',
    origin,
    url: url.toString(),
  })
}

export function resolveMarkdownAsset(input: string) {
  try {
    return resolvePublicAsset(input)
  } catch {
    return undefined
  }
}
