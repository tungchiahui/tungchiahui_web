import { z } from 'zod'

import { encodeObjectKeyForUrl } from './contracts'

export const assetClassSchema = z.enum(['attachments', 'images', 'mirrors', 'music'])
export type AssetClass = z.infer<typeof assetClassSchema>

export const assetCachePolicy = Object.freeze({
  immutable: 'public, max-age=31536000, immutable',
  mutable: 'public, max-age=300, must-revalidate',
})

const immutableIdentitySchema = z
  .string()
  .regex(/^[a-f0-9]{12,64}$/u, 'Immutable asset identity must be a content hash')

export function buildAssetObjectKey(assetClass: AssetClass, identity: string, fileName: string) {
  const safeIdentity = immutableIdentitySchema.parse(identity)
  const safeFileName = z
    .string()
    .min(1)
    .max(255)
    .refine((value) => !value.includes('/') && value !== '.' && value !== '..')
    .parse(fileName)
  return `${assetClassSchema.parse(assetClass)}/${safeIdentity}/${safeFileName}`
}

export function resolveAssetResponseCacheControl(key: string, providerValue?: string) {
  const segments = key.split('/')
  const identity = segments[1]
  if (identity === 'mutable') return assetCachePolicy.mutable
  if (identity !== undefined && immutableIdentitySchema.safeParse(identity).success) {
    return assetCachePolicy.immutable
  }
  return providerValue ?? assetCachePolicy.mutable
}

export function buildMutableAssetObjectKey(assetClass: AssetClass, fileName: string) {
  const safeFileName = z
    .string()
    .min(1)
    .max(255)
    .refine((value) => !value.includes('/') && value !== '.' && value !== '..')
    .parse(fileName)
  return `${assetClassSchema.parse(assetClass)}/mutable/${safeFileName}`
}

export function buildCdnAssetUrl(baseUrl: URL, key: string) {
  if (baseUrl.protocol !== 'https:') throw new Error('CDN asset delivery requires HTTPS')
  const normalizedBase = new URL(baseUrl)
  if (!normalizedBase.pathname.endsWith('/')) normalizedBase.pathname += '/'
  return new URL(encodeObjectKeyForUrl(key), normalizedBase)
}
