import { z } from 'zod'

import { runPostgresMigrations } from '../../src/database/migrate'
import { safeErrorAttributes } from '../../src/observability/telemetry'

const configuration = z
  .object({
    DATABASE_URL: z.string().startsWith('postgresql://'),
    DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP: z.enum(['true', 'false']),
    DEPLOYMENT_TECH_V3_COMPATIBLE_PREVIOUS_RELEASE: z.enum(['true', 'false']).default('false'),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .parse(process.env)

runPostgresMigrations(configuration.DATABASE_URL, {
  allowContract: false,
  bootstrapRoles: false,
  hasFreshRecoverableBackup: configuration.DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP === 'true',
  hasTechV3CompatiblePreviousRelease:
    configuration.DEPLOYMENT_TECH_V3_COMPATIBLE_PREVIOUS_RELEASE === 'true',
  repositoryRoot: '/app/deployment',
  scope: process.argv.includes('--control-schema') ? 'control-schema' : 'application',
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
        ...safeErrorAttributes(error),
      }),
    )
    process.exitCode = 1
  })
