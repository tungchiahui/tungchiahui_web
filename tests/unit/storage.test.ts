import { describe, expect, it } from 'vitest'
import { GET as getAsset } from '@/app/api/assets/[...key]/route'
import { parseAssetStorageConfiguration } from '@/storage/configuration'
import {
  encodeObjectKeyForUrl,
  storageObjectIdentifierSchema,
  storageObjectKeySchema,
  storageObjectPrefixSchema,
} from '@/storage/contracts'
import {
  assetCachePolicy,
  buildAssetObjectKey,
  buildCdnAssetUrl,
  buildMutableAssetObjectKey,
  resolveAssetResponseCacheControl,
} from '@/storage/policy'
import { parseS3ContractConfiguration } from '../../tools/storage/s3-contract-configuration'

function s3ContractInput() {
  return {
    ASSET_S3_ACCESS_KEY_ID: 'asset-read-key',
    ASSET_S3_BUCKET: 'tungchiahui-assets',
    BACKUP_S3_ACCESS_KEY_ID: 'backup-key',
    BACKUP_S3_BUCKET: 'tungchiahui-backups',
    S3_CONTRACT_ACCESS_KEY_ID: 'contract-key',
    S3_CONTRACT_BUCKET: 'tungchiahui-s3-contract',
    S3_CONTRACT_CDN_BASE_URL: 'https://cdn-test.example.test/contracts/',
    S3_CONTRACT_ENDPOINT: 'https://s3-test.example.test/s3',
    S3_CONTRACT_ENVIRONMENT: 'non-production',
    S3_CONTRACT_FORCE_PATH_STYLE: 'true',
    S3_CONTRACT_REGION: 'us-east-1',
    S3_CONTRACT_SECRET_ACCESS_KEY: 'contract-secret',
  } as const
}

describe('Phase 11 storage boundary', () => {
  it('hides recovery namespaces from the public asset gateway', async () => {
    for (const prefix of ['backups', 'asset-backups', 'control-state', 'database-backups']) {
      const response = await getAsset(new Request(`https://example.test/api/assets/${prefix}/x`), {
        params: Promise.resolve({ key: [prefix, 'x'] }),
      })
      expect(response.status).toBe(404)
      expect(response.headers.get('cache-control')).toBe('no-store')
    }
  })

  it('defines deterministic asset keys and cache policies without canonical Markdown storage', () => {
    expect(buildAssetObjectKey('images', 'a'.repeat(64), '示例.webp')).toBe(
      `images/${'a'.repeat(64)}/示例.webp`,
    )
    expect(buildMutableAssetObjectKey('music', 'playlist.json')).toBe('music/mutable/playlist.json')
    expect(assetCachePolicy.immutable).toContain('immutable')
    expect(assetCachePolicy.mutable).toContain('must-revalidate')
    expect(
      resolveAssetResponseCacheControl(`images/${'a'.repeat(64)}/example.webp`, 'max-age=0'),
    ).toBe(assetCachePolicy.immutable)
    expect(resolveAssetResponseCacheControl('music/mutable/playlist.json', 'max-age=86400')).toBe(
      assetCachePolicy.mutable,
    )
    expect(() => buildAssetObjectKey('images', 'posts/source.md', 'source.md')).toThrow()
  })

  it('validates Unicode object keys and URL encoding while rejecting traversal', () => {
    expect(storageObjectKeySchema.parse('images/中文/示例.webp')).toBe('images/中文/示例.webp')
    expect(encodeObjectKeyForUrl('images/中文/示例.webp')).toBe(
      'images/%E4%B8%AD%E6%96%87/%E7%A4%BA%E4%BE%8B.webp',
    )
    expect(
      buildCdnAssetUrl(
        new URL('https://cdn-test.example.test/contracts'),
        'images/中文/示例.webp',
      ).toString(),
    ).toBe(
      'https://cdn-test.example.test/contracts/images/%E4%B8%AD%E6%96%87/%E7%A4%BA%E4%BE%8B.webp',
    )
    expect(() => storageObjectKeySchema.parse('../canonical/article.md')).toThrow()
    expect(() => storageObjectKeySchema.parse('images//example.webp')).toThrow()
    expect(storageObjectIdentifierSchema.parse('contract/unique-prefix/')).toBe(
      'contract/unique-prefix/',
    )
    expect(storageObjectPrefixSchema.parse('')).toBe('')
    expect(() => storageObjectIdentifierSchema.parse('')).toThrow()
  })

  it('requires HTTPS for production asset storage but permits the isolated local service', () => {
    expect(
      parseAssetStorageConfiguration({
        ASSET_S3_ACCESS_KEY_ID: 'local-only-access-key',
        ASSET_S3_BUCKET: 'tungchiahui-local-assets',
        ASSET_S3_ENDPOINT: 'http://s3mock:9090',
        ASSET_S3_FORCE_PATH_STYLE: 'true',
        ASSET_S3_REGION: 'us-east-1',
        ASSET_S3_SECRET_ACCESS_KEY: 'local-only-secret-key',
        SITE_RUNTIME_MODE: 'local',
      }).endpoint.hostname,
    ).toBe('s3mock')
    expect(() =>
      parseAssetStorageConfiguration({
        ASSET_S3_ACCESS_KEY_ID: 'production-key',
        ASSET_S3_BUCKET: 'assets',
        ASSET_S3_ENDPOINT: 'http://s3.example.test',
        ASSET_S3_SECRET_ACCESS_KEY: 'production-secret',
        SITE_RUNTIME_MODE: 'production',
      }),
    ).toThrow('HTTPS is required')
  })

  it('keeps the contract generic while requiring a non-production target and split credentials', () => {
    const parsed = parseS3ContractConfiguration(s3ContractInput())
    expect(parsed.connection.bucket).toBe('tungchiahui-s3-contract')
    expect(() =>
      parseS3ContractConfiguration({
        ...s3ContractInput(),
        S3_CONTRACT_BUCKET: 'tungchiahui-assets',
      }),
    ).toThrow('must differ from the application asset bucket')
    expect(() =>
      parseS3ContractConfiguration({
        ...s3ContractInput(),
        S3_CONTRACT_ACCESS_KEY_ID: 'backup-key',
      }),
    ).toThrow('must differ from the backup identity')
    expect(() =>
      parseS3ContractConfiguration({
        ...s3ContractInput(),
        S3_CONTRACT_ENVIRONMENT: 'production',
      }),
    ).toThrow('non-production')
  })
})
