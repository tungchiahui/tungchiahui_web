import { type AssetBackupProgress, backupAssets } from './asset-backup'
import type { S3ConnectionConfiguration } from './contracts'
import { S3ObjectStorageAdapter, S3ReadOnlyObjectStorageAdapter } from './s3-adapter'

export async function executeAssetBackup(
  sourceConfiguration: S3ConnectionConfiguration,
  targetConfiguration: S3ConnectionConfiguration,
  options: Readonly<{ execute: boolean; onProgress?: (progress: AssetBackupProgress) => void }>,
) {
  const source = new S3ReadOnlyObjectStorageAdapter(sourceConfiguration)
  const target = new S3ObjectStorageAdapter(targetConfiguration)
  try {
    return await backupAssets(source, target, options)
  } finally {
    source.destroy()
    target.destroy()
  }
}
