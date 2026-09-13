import { readFileSync } from 'node:fs'
import {
  S3ObjectStorageAdapter,
  S3ReadOnlyObjectStorageAdapter,
} from '../../src/storage/s3-adapter'
import { backupAssets } from './asset-backup'
import { parseAssetBackupConfiguration } from './asset-backup-configuration'

type RunAssetBackupOptions = Readonly<{
  envFile: string
  execute: boolean
}>

export async function runProductionAssetBackup(options: RunAssetBackupOptions) {
  const configuration = parseAssetBackupConfiguration(readFileSync(options.envFile, 'utf8'))
  const source = new S3ReadOnlyObjectStorageAdapter(configuration.source)
  const target = new S3ObjectStorageAdapter(configuration.target)
  try {
    const report = await backupAssets(source, target, {
      execute: options.execute,
      onProgress(progress) {
        console.log(JSON.stringify({ event: 'asset_backup_progress', ...progress }))
      },
    })
    console.log(
      JSON.stringify(
        {
          ...report,
          mode: options.execute ? 'executed' : 'dry-run',
          semantics: 'copy-add-update-preserve-target-only',
          status: 'completed',
        },
        null,
        2,
      ),
    )
  } finally {
    source.destroy()
    target.destroy()
  }
}
