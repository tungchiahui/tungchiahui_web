import { Client } from 'pg'
import { z } from 'zod'
import { migrateLegacyHealth } from '../../src/health/migrate'
import { HealthRepository } from '../../src/health/repository'
import { readSmartscaleFile } from '../../src/health/smartscale'

async function main() {
  const config = z
    .object({
      DATABASE_URL: z.url(),
      HEALTH_SYNC_FILE: z.string().default('/health-data/s400.json'),
      HEALTH_SYNC_USER: z.string().optional(),
    })
    .parse(process.env)
  if (process.argv.includes('--migrate-legacy')) {
    const client = new Client({ connectionString: config.DATABASE_URL })
    await client.connect()
    try {
      await client.query('SET ROLE site_migrator')
      console.log(
        JSON.stringify({
          event: 'health_legacy_migration',
          ...(await migrateLegacyHealth(client, process.argv.includes('--dry-run'))),
        }),
      )
    } finally {
      await client.end()
    }
    return
  }
  const file = await readSmartscaleFile(
    config.HEALTH_SYNC_FILE,
    config.HEALTH_SYNC_USER || undefined,
  )
  if (process.argv.includes('--dry-run')) {
    console.log(JSON.stringify({ event: 'health_import_dry_run', validRecords: file.rows.length }))
    return
  }
  const repository = new HealthRepository(config.DATABASE_URL, 'site_content_worker')
  try {
    console.log(
      JSON.stringify({
        event: 'health_import_completed',
        ...(await repository.importSmartscale(file)),
      }),
    )
  } finally {
    await repository.close()
  }
}
main().catch(() => {
  console.error(JSON.stringify({ event: 'health_import_failed' }))
  process.exitCode = 1
})
