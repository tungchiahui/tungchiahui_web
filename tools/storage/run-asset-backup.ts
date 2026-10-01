import { readFileSync } from 'node:fs'
import { executeAssetBackup } from '../../src/storage/production-asset-backup'
import { parseAssetBackupConfiguration } from './asset-backup-configuration'

type RunAssetBackupOptions = Readonly<{
  envFile: string
  execute: boolean
}>

export async function runProductionAssetBackup(options: RunAssetBackupOptions) {
  const configuration = parseAssetBackupConfiguration(readFileSync(options.envFile, 'utf8'))
  const report = await executeAssetBackup(configuration.source, configuration.target, {
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
}
