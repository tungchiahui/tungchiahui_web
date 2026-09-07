import { z } from 'zod'

import {
  parseS3ConnectionConfiguration,
  type S3ConnectionConfiguration,
  StorageConfigurationError,
} from '../../src/storage/contracts'

const booleanStringSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value !== 'false')

const rawS3ContractSchema = z.object({
  ASSET_S3_ACCESS_KEY_ID: z.string().optional(),
  ASSET_S3_BUCKET: z.string().optional(),
  BACKUP_S3_ACCESS_KEY_ID: z.string().optional(),
  BACKUP_S3_BUCKET: z.string().optional(),
  BACKUP_OFFSITE_S3_ACCESS_KEY_ID: z.string().optional(),
  BACKUP_OFFSITE_S3_BUCKET: z.string().optional(),
  S3_CONTRACT_ACCESS_KEY_ID: z.string().min(1),
  S3_CONTRACT_BUCKET: z.string().min(3),
  S3_CONTRACT_CDN_BASE_URL: z.url(),
  S3_CONTRACT_ENDPOINT: z.url(),
  S3_CONTRACT_ENVIRONMENT: z.literal('non-production'),
  S3_CONTRACT_FORCE_PATH_STYLE: booleanStringSchema,
  S3_CONTRACT_REGION: z.string().min(1).default('us-east-1'),
  S3_CONTRACT_SECRET_ACCESS_KEY: z.string().min(1),
})

export type S3ContractConfiguration = Readonly<{
  cdnBaseUrl: URL
  connection: S3ConnectionConfiguration
}>

export function parseS3ContractConfiguration(
  input: Readonly<Record<string, string | undefined>>,
): S3ContractConfiguration {
  const result = rawS3ContractSchema.safeParse(input)
  if (!result.success) {
    throw new StorageConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }
  const data = result.data
  const issues: string[] = []
  const endpoint = new URL(data.S3_CONTRACT_ENDPOINT)
  const cdnBaseUrl = new URL(data.S3_CONTRACT_CDN_BASE_URL)
  if (endpoint.protocol !== 'https:') issues.push('S3_CONTRACT_ENDPOINT: HTTPS is required')
  if (cdnBaseUrl.protocol !== 'https:') issues.push('S3_CONTRACT_CDN_BASE_URL: HTTPS is required')
  if (data.S3_CONTRACT_BUCKET === data.ASSET_S3_BUCKET) {
    issues.push('S3_CONTRACT_BUCKET: must differ from the application asset bucket')
  }
  if (data.S3_CONTRACT_BUCKET === data.BACKUP_S3_BUCKET) {
    issues.push('S3_CONTRACT_BUCKET: must differ from the backup bucket')
  }
  if (data.S3_CONTRACT_BUCKET === data.BACKUP_OFFSITE_S3_BUCKET) {
    issues.push('S3_CONTRACT_BUCKET: must differ from the off-site backup bucket')
  }
  if (data.S3_CONTRACT_ACCESS_KEY_ID === data.ASSET_S3_ACCESS_KEY_ID) {
    issues.push('S3_CONTRACT_ACCESS_KEY_ID: must differ from the application identity')
  }
  if (data.S3_CONTRACT_ACCESS_KEY_ID === data.BACKUP_S3_ACCESS_KEY_ID) {
    issues.push('S3_CONTRACT_ACCESS_KEY_ID: must differ from the backup identity')
  }
  if (data.S3_CONTRACT_ACCESS_KEY_ID === data.BACKUP_OFFSITE_S3_ACCESS_KEY_ID) {
    issues.push('S3_CONTRACT_ACCESS_KEY_ID: must differ from the off-site backup identity')
  }
  if (issues.length > 0) throw new StorageConfigurationError(issues)

  return Object.freeze({
    cdnBaseUrl,
    connection: parseS3ConnectionConfiguration({
      accessKeyId: data.S3_CONTRACT_ACCESS_KEY_ID,
      bucket: data.S3_CONTRACT_BUCKET,
      endpoint: endpoint.toString(),
      forcePathStyle: data.S3_CONTRACT_FORCE_PATH_STYLE,
      region: data.S3_CONTRACT_REGION,
      secretAccessKey: data.S3_CONTRACT_SECRET_ACCESS_KEY,
    }),
  })
}
