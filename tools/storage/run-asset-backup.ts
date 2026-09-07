import { spawnSync } from 'node:child_process'
import {
  S3ObjectStorageAdapter,
  S3ReadOnlyObjectStorageAdapter,
} from '../../src/storage/s3-adapter'
import { backupAssets } from './asset-backup'
import { parseAssetBackupConfiguration } from './asset-backup-configuration'

type RunAssetBackupOptions = Readonly<{
  execute: boolean
  secretFile: string
}>

function decryptSecretDocument(path: string) {
  const result = spawnSync('sops', ['--decrypt', '--output-type', 'json', path], {
    encoding: 'utf8',
  })
  if (result.status !== 0) {
    throw new Error('Unable to decrypt the production secret document')
  }
  return JSON.parse(result.stdout) as unknown
}

export async function runProductionAssetBackup(options: RunAssetBackupOptions) {
  const configuration = parseAssetBackupConfiguration(decryptSecretDocument(options.secretFile))
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
