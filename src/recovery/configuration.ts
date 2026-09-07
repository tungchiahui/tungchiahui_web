import { z } from 'zod'

import {
  parseS3ConnectionConfiguration,
  type S3ConnectionConfiguration,
  StorageConfigurationError,
} from '../storage/contracts'

const booleanStringSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value !== 'false')

const recoveryEnvironmentSchema = z.object({
  ASSET_S3_ACCESS_KEY_ID: z.string().optional(),
  ASSET_S3_BUCKET: z.string().optional(),
  BACKUP_AGE_IDENTITY_PATH: z.string().min(1),
  BACKUP_AGE_RECIPIENT: z.string().startsWith('age1'),
  BACKUP_LOCAL_REPOSITORY_PATH: z.string().startsWith('/'),
  BACKUP_PGBACKREST_CONFIG_PATH: z.string().startsWith('/'),
  BACKUP_PGBACKREST_STANZA: z.string().regex(/^[a-z][a-z0-9-]{0,62}$/),
  BACKUP_POSTGRES_DATA_PATH: z.string().startsWith('/'),
  BACKUP_REPLICATION_CONCURRENCY: z.coerce.number().int().min(1).max(32).default(8),
  BACKUP_WORK_DIRECTORY: z.string().startsWith('/'),
  BACKUP_S3_ACCESS_KEY_ID: z.string().min(1),
  BACKUP_S3_BUCKET: z.string().min(3),
  BACKUP_S3_ENDPOINT: z.url(),
  BACKUP_S3_FORCE_PATH_STYLE: booleanStringSchema,
  BACKUP_S3_REGION: z.string().min(1).default('us-east-1'),
  BACKUP_S3_SECRET_ACCESS_KEY: z.string().min(1),
  BACKUP_OFFSITE_S3_ACCESS_KEY_ID: z.string().min(1),
  BACKUP_OFFSITE_S3_BUCKET: z.string().min(3),
  BACKUP_OFFSITE_S3_ENDPOINT: z.url(),
  BACKUP_OFFSITE_S3_FORCE_PATH_STYLE: booleanStringSchema,
  BACKUP_OFFSITE_S3_REGION: z.string().min(1).default('us-east-1'),
  BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY: z.string().min(1),
  CONTROL_STATE_PATH: z.string().startsWith('/'),
  SITE_RUNTIME_MODE: z.enum(['local', 'test', 'production']),
})

export type RecoveryConfiguration = Readonly<{
  ageIdentityPath: string
  ageRecipient: string
  controlStatePath: string
  localRepositoryPath: string
  mode: 'local' | 'production' | 'test'
  pgBackRestConfigPath: string
  postgresDataPath: string
  offsite: S3ConnectionConfiguration
  primary: S3ConnectionConfiguration
  replicationConcurrency: number
  stanza: string
  workDirectory: string
}>

export function parseRecoveryConfiguration(
  input: Readonly<Record<string, string | undefined>>,
): RecoveryConfiguration {
  const result = recoveryEnvironmentSchema.safeParse(input)
  if (!result.success) {
    throw new StorageConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }
  const data = result.data
  const primary = parseS3ConnectionConfiguration({
    accessKeyId: data.BACKUP_S3_ACCESS_KEY_ID,
    bucket: data.BACKUP_S3_BUCKET,
    endpoint: data.BACKUP_S3_ENDPOINT,
    forcePathStyle: data.BACKUP_S3_FORCE_PATH_STYLE,
    region: data.BACKUP_S3_REGION,
    secretAccessKey: data.BACKUP_S3_SECRET_ACCESS_KEY,
  })
  const offsite = parseS3ConnectionConfiguration({
    accessKeyId: data.BACKUP_OFFSITE_S3_ACCESS_KEY_ID,
    bucket: data.BACKUP_OFFSITE_S3_BUCKET,
    endpoint: data.BACKUP_OFFSITE_S3_ENDPOINT,
    forcePathStyle: data.BACKUP_OFFSITE_S3_FORCE_PATH_STYLE,
    region: data.BACKUP_OFFSITE_S3_REGION,
    secretAccessKey: data.BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY,
  })
  const issues: string[] = []
  if (primary.accessKeyId === offsite.accessKeyId) {
    issues.push('Primary and off-site backup credentials must differ')
  }
  if (primary.bucket === offsite.bucket) {
    issues.push('Primary and off-site backup buckets must differ')
  }
  if (
    data.SITE_RUNTIME_MODE === 'production' &&
    (primary.endpoint.protocol !== 'https:' || offsite.endpoint.protocol !== 'https:')
  ) {
    issues.push('Primary and off-site backup endpoints require HTTPS in production')
  }
  if (issues.length > 0) throw new StorageConfigurationError(issues)

  return Object.freeze({
    ageIdentityPath: data.BACKUP_AGE_IDENTITY_PATH,
    ageRecipient: data.BACKUP_AGE_RECIPIENT,
    controlStatePath: data.CONTROL_STATE_PATH,
    localRepositoryPath: data.BACKUP_LOCAL_REPOSITORY_PATH,
    mode: data.SITE_RUNTIME_MODE,
    offsite,
    pgBackRestConfigPath: data.BACKUP_PGBACKREST_CONFIG_PATH,
    postgresDataPath: data.BACKUP_POSTGRES_DATA_PATH,
    primary,
    replicationConcurrency: data.BACKUP_REPLICATION_CONCURRENCY,
    stanza: data.BACKUP_PGBACKREST_STANZA,
    workDirectory: data.BACKUP_WORK_DIRECTORY,
  })
}
