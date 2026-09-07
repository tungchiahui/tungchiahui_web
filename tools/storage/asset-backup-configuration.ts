import { parseEnv } from 'node:util'

import { z } from 'zod'

import { parseAssetStorageConfiguration } from '../../src/storage/configuration'
import {
  parseS3ConnectionConfiguration,
  type S3ConnectionConfiguration,
  StorageConfigurationError,
} from '../../src/storage/contracts'

const productionSecretSectionsSchema = z
  .object({
    backup_env: z.string().min(1),
    web_env: z.string().min(1),
  })
  .passthrough()

const backupEnvironmentSchema = z.object({
  BACKUP_OFFSITE_S3_ACCESS_KEY_ID: z.string().min(1),
  BACKUP_OFFSITE_S3_BUCKET: z.string().min(3),
  BACKUP_OFFSITE_S3_ENDPOINT: z.url(),
  BACKUP_OFFSITE_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).optional(),
  BACKUP_OFFSITE_S3_REGION: z.string().min(1),
  BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY: z.string().min(1),
})

export type AssetBackupConfiguration = Readonly<{
  source: S3ConnectionConfiguration
  target: S3ConnectionConfiguration
}>

export function parseAssetBackupConfiguration(input: unknown): AssetBackupConfiguration {
  const sections = productionSecretSectionsSchema.parse(input)
  const sourceEnvironment = parseEnv(sections.web_env)
  const backupResult = backupEnvironmentSchema.safeParse(parseEnv(sections.backup_env))
  if (!backupResult.success) {
    throw new StorageConfigurationError(
      backupResult.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  const source = parseAssetStorageConfiguration({
    ...sourceEnvironment,
    SITE_RUNTIME_MODE: 'production',
  })
  const target = parseS3ConnectionConfiguration({
    accessKeyId: backupResult.data.BACKUP_OFFSITE_S3_ACCESS_KEY_ID,
    bucket: backupResult.data.BACKUP_OFFSITE_S3_BUCKET,
    endpoint: backupResult.data.BACKUP_OFFSITE_S3_ENDPOINT,
    forcePathStyle: backupResult.data.BACKUP_OFFSITE_S3_FORCE_PATH_STYLE !== 'false',
    region: backupResult.data.BACKUP_OFFSITE_S3_REGION,
    secretAccessKey: backupResult.data.BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY,
  })
  const issues: string[] = []
  if (target.endpoint.protocol !== 'https:') {
    issues.push('BACKUP_OFFSITE_S3_ENDPOINT: HTTPS is required in production')
  }
  if (source.bucket === target.bucket) {
    issues.push('Asset source and backup target buckets must differ')
  }
  if (source.accessKeyId === target.accessKeyId) {
    issues.push('Asset source and backup target credentials must differ')
  }
  if (issues.length > 0) throw new StorageConfigurationError(issues)

  return Object.freeze({ source, target })
}
