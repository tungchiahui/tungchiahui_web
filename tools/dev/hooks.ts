import { readdirSync } from 'node:fs'
import { resolve } from 'node:path'

import type { ComposeProject } from './compose'

function currentMigrationFiles(repositoryRoot: string) {
  const migrationDirectory = resolve(repositoryRoot, 'drizzle')

  try {
    return readdirSync(migrationDirectory)
      .filter((name) => name.endsWith('.sql'))
      .sort()
  } catch (error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'ENOENT') {
      return []
    }

    throw error
  }
}

export function runInfrastructureHooks(repositoryRoot: string, compose: ComposeProject) {
  compose.exec('postgres', [
    'psql',
    '--dbname',
    'tungchiahui',
    '--set',
    'ON_ERROR_STOP=1',
    '--username',
    'tungchiahui',
    '--command',
    'CREATE EXTENSION IF NOT EXISTS pgroonga;',
  ])

  const migrationFiles = currentMigrationFiles(repositoryRoot)

  if (migrationFiles.length > 0) {
    throw new Error(
      'Phase 2 migration hook found SQL migrations before the Phase 3 runner exists; refusing partial execution',
    )
  }

  console.log('Migration hook: ready (0 versioned migrations; first schema belongs to Phase 3)')
  console.log('Seed hook: ready (0 business fixtures; first schema belongs to Phase 3)')
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
