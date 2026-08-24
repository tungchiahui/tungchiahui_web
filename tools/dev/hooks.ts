import { runPostgresMigrations } from '../../src/database/migrate'
import { seedDevelopmentDatabase } from '../../src/database/seed'
import type { ComposeProject } from './compose'

const localDatabaseCredentials = 'tungchiahui:local-only-postgres'

export function databaseUrl(compose: ComposeProject, service: 'postgres' | 'pgbouncer') {
  const port = compose.port(service, service === 'postgres' ? 5432 : 6432)
  return `postgresql://${localDatabaseCredentials}@127.0.0.1:${port}/tungchiahui`
}

export async function runInfrastructureHooks(repositoryRoot: string, compose: ComposeProject) {
  const migrationResult = await runPostgresMigrations(databaseUrl(compose, 'postgres'), {
    repositoryRoot,
  })
  await seedDevelopmentDatabase(databaseUrl(compose, 'pgbouncer'))

  console.log(`Migration hook: ready (${migrationResult.migrationCount} versioned migrations)`)
  console.log('Seed hook: ready (deterministic Phase 3 development fixture)')
}

export function verifyPostgresAndPgBouncer(compose: ComposeProject) {
  const postgresVersion = compose.exec('postgres', [
    'psql',
    '--dbname',
    'tungchiahui',
    '--tuples-only',
    '--no-align',
    '--username',
    'tungchiahui',
    '--command',
    "SELECT current_setting('server_version');",
  ]).stdout

  if (!postgresVersion.trim().startsWith('18.')) {
    throw new Error('Disposable PostgreSQL is not major version 18')
  }

  const extensionVersion = compose.exec('postgres', [
    'psql',
    '--dbname',
    'tungchiahui',
    '--tuples-only',
    '--no-align',
    '--username',
    'tungchiahui',
    '--command',
    "SELECT extversion FROM pg_extension WHERE extname = 'pgroonga';",
  ]).stdout

  if (extensionVersion.trim().length === 0) {
    throw new Error('PGroonga extension is not available in the disposable PostgreSQL')
  }

  const pooledResult = compose.exec(
    'postgres',
    [
      'psql',
      '--host',
      'pgbouncer',
      '--port',
      '6432',
      '--dbname',
      'tungchiahui',
      '--tuples-only',
      '--no-align',
      '--username',
      'tungchiahui',
      '--command',
      "SELECT 'pgbouncer-ready';",
    ],
    { PGPASSWORD: 'local-only-postgres' },
  ).stdout

  if (pooledResult.trim() !== 'pgbouncer-ready') {
    throw new Error('PgBouncer did not proxy the disposable PostgreSQL query')
  }
}
