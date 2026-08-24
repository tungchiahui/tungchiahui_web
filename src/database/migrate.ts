import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'

import { parseDatabaseConnectionConfig } from './config'
import { validateMigrationPolicy } from './migration-policy'

export type MigrationRunOptions = Readonly<{
  allowContract?: boolean
  hasFreshRecoverableBackup?: boolean
  migrationsDirectory?: string
  policyPath?: string
  repositoryRoot: string
}>

export async function runPostgresMigrations(
  connectionString: string,
  options: MigrationRunOptions,
) {
  const configuration = parseDatabaseConnectionConfig({
    applicationName: 'site-migrator',
    connectionString,
    maxConnections: 1,
  })
  const migrationsDirectory =
    options.migrationsDirectory ?? resolve(options.repositoryRoot, 'drizzle')
  const policyPath =
    options.policyPath ?? resolve(options.repositoryRoot, 'drizzle/migration-policy.json')
  const journalPath = resolve(migrationsDirectory, 'meta/_journal.json')
  const rolesSql = readFileSync(resolve(options.repositoryRoot, 'ops/database/roles.sql'), 'utf8')

  const policy = validateMigrationPolicy(policyPath, journalPath, {
    allowContract: options.allowContract ?? false,
    hasFreshRecoverableBackup: options.hasFreshRecoverableBackup ?? false,
  })
  const client = new Client({
    application_name: configuration.applicationName,
    connectionString: configuration.connectionString,
  })

  await client.connect()
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('tungchiahui-schema-migration'))")
    await client.query(rolesSql)
    await client.query('SET ROLE site_migrator')
    await migrate(drizzle({ client }), {
      migrationsFolder: migrationsDirectory,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    })
    await client.query('RESET ROLE')
    await client.query(rolesSql)
    const result = await client.query<{ created_at: string; hash: string }>(
      'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at',
    )
    const expectedMigrations = readMigrationFiles({ migrationsFolder: migrationsDirectory })
    const count = result.rows.length

    if (count !== policy.migrations.length || count !== expectedMigrations.length) {
      throw new Error(
        `Migration journal mismatch: expected ${policy.migrations.length}, database has ${count}`,
      )
    }

    for (const [index, expected] of expectedMigrations.entries()) {
      const applied = result.rows[index]
      if (
        applied?.hash !== expected?.hash ||
        Number(applied.created_at) !== expected.folderMillis
      ) {
        throw new Error(`Applied migration hash/timestamp drift at journal index ${index}`)
      }
    }

    return Object.freeze({ migrationCount: count })
  } finally {
    try {
      await client.query('RESET ROLE')
      await client.query("SELECT pg_advisory_unlock(hashtext('tungchiahui-schema-migration'))")
    } finally {
      await client.end()
    }
  }
}
