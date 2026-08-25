import { z } from 'zod'

import { runPostgresMigrations } from '../../src/database/migrate'

const configuration = z
  .object({
    DATABASE_URL: z.string().startsWith('postgresql://'),
    DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP: z.enum(['true', 'false']),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .parse(process.env)

runPostgresMigrations(configuration.DATABASE_URL, {
  allowContract: false,
  bootstrapRoles: false,
  hasFreshRecoverableBackup: configuration.DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP === 'true',
  repositoryRoot: '/app/deployment',
})
  .then((result) => {
    console.log(
      JSON.stringify({
        event: 'database_migrations_completed',
        migrationCount: result.migrationCount,
      }),
    )
  })
  .catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'database_migrations_failed',
        message: error instanceof Error ? error.message : 'unknown migration failure',
      }),
    )
    process.exitCode = 1
  })
