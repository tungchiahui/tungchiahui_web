import { z } from 'zod'

import {
  parseS3ConnectionConfiguration,
  type S3ConnectionConfiguration,
  StorageConfigurationError,
} from './contracts'

const booleanStringSchema = z
  .enum(['true', 'false'])
  .optional()
  .transform((value) => value !== 'false')

const assetEnvironmentSchema = z.object({
  ASSET_S3_ACCESS_KEY_ID: z.string().min(1),
  ASSET_S3_BUCKET: z.string().min(3),
  ASSET_S3_ENDPOINT: z.url(),
  ASSET_S3_FORCE_PATH_STYLE: booleanStringSchema,
  ASSET_S3_REGION: z.string().min(1).default('us-east-1'),
  ASSET_S3_SECRET_ACCESS_KEY: z.string().min(1),
  SITE_RUNTIME_MODE: z.enum(['local', 'test', 'production']),
})

export function parseAssetStorageConfiguration(
  input: Readonly<Record<string, string | undefined>>,
): S3ConnectionConfiguration {
  const result = assetEnvironmentSchema.safeParse(input)
  if (!result.success) {
    throw new StorageConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }
  const endpoint = new URL(result.data.ASSET_S3_ENDPOINT)
  if (result.data.SITE_RUNTIME_MODE === 'production' && endpoint.protocol !== 'https:') {
    throw new StorageConfigurationError(['ASSET_S3_ENDPOINT: HTTPS is required in production'])
  }
  return parseS3ConnectionConfiguration({
    accessKeyId: result.data.ASSET_S3_ACCESS_KEY_ID,
    bucket: result.data.ASSET_S3_BUCKET,
    endpoint: endpoint.toString(),
    forcePathStyle: result.data.ASSET_S3_FORCE_PATH_STYLE,
    region: result.data.ASSET_S3_REGION,
    secretAccessKey: result.data.ASSET_S3_SECRET_ACCESS_KEY,
  })
}
