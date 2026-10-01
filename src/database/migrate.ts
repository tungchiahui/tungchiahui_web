import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'
import { readMigrationFiles } from 'drizzle-orm/migrator'
import { drizzle } from 'drizzle-orm/node-postgres'
import { migrate } from 'drizzle-orm/node-postgres/migrator'
import { Client } from 'pg'
import { z } from 'zod'

import { parseDatabaseConnectionConfig } from './config'
import { validateMigrationPolicy } from './migration-policy'

export type MigrationRunOptions = Readonly<{
  allowContract?: boolean
  bootstrapRoles?: boolean
  hasFreshRecoverableBackup?: boolean
  hasTechV3CompatiblePreviousRelease?: boolean
  migrationsDirectory?: string
  policyPath?: string
  repositoryRoot: string
  scope?: 'application' | 'control-schema'
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
  const bootstrapRoles = options.bootstrapRoles ?? true
  const rolesSql = bootstrapRoles
    ? readFileSync(resolve(options.repositoryRoot, 'ops/database/roles.sql'), 'utf8')
    : null
  const runtimeGrantsSql = bootstrapRoles
    ? null
    : readFileSync(resolve(options.repositoryRoot, 'ops/database/runtime-grants.sql'), 'utf8')

  const policy = validateMigrationPolicy(policyPath, journalPath, {
    allowContract: options.allowContract ?? false,
    hasFreshRecoverableBackup: options.hasFreshRecoverableBackup ?? false,
    hasTechV3CompatiblePreviousRelease: options.hasTechV3CompatiblePreviousRelease ?? false,
    ...(options.scope === 'control-schema'
      ? { throughMigration: '0008_accounts_and_start_data' }
      : {}),
  })
  const client = new Client({
    application_name: configuration.applicationName,
    connectionTimeoutMillis: configuration.connectionTimeoutMilliseconds,
    connectionString: configuration.connectionString,
    query_timeout: configuration.queryTimeoutMilliseconds,
  })

  await client.connect()
  let scopedDirectory: string | null = null
  try {
    await client.query("SELECT pg_advisory_lock(hashtext('tungchiahui-schema-migration'))")
    if (rolesSql !== null) await client.query(rolesSql)
    await client.query('SET ROLE site_migrator')
    if (options.scope === 'control-schema') {
      scopedDirectory = mkdtempSync(resolve(tmpdir(), 'site-control-schema-'))
      mkdirSync(resolve(scopedDirectory, 'meta'))
      const journal = z
        .object({ entries: z.array(z.object({ tag: z.string() }).passthrough()) })
        .passthrough()
        .parse(JSON.parse(readFileSync(journalPath, 'utf8')) as unknown)
      const tags = new Set(policy.migrations.map((entry) => entry.tag))
      writeFileSync(
        resolve(scopedDirectory, 'meta/_journal.json'),
        JSON.stringify({
          ...journal,
          entries: journal.entries.filter((entry) => tags.has(entry.tag)),
        }),
      )
      for (const entry of policy.migrations)
        copyFileSync(
          resolve(migrationsDirectory, `${entry.tag}.sql`),
          resolve(scopedDirectory, `${entry.tag}.sql`),
        )
    }
    await migrate(drizzle({ client }), {
      migrationsFolder: scopedDirectory ?? migrationsDirectory,
      migrationsSchema: 'drizzle',
      migrationsTable: '__drizzle_migrations',
    })
    if (runtimeGrantsSql !== null) await client.query(runtimeGrantsSql)
    await client.query('RESET ROLE')
    if (rolesSql !== null) await client.query(rolesSql)
    const result = await client.query<{ created_at: string; hash: string }>(
      'SELECT hash, created_at::text FROM drizzle.__drizzle_migrations ORDER BY created_at',
    )
    const expectedMigrations = readMigrationFiles({ migrationsFolder: migrationsDirectory })
    const count = result.rows.length

    if (
      count < policy.migrations.length ||
      count > expectedMigrations.length ||
      (options.scope !== 'control-schema' && count !== expectedMigrations.length)
    ) {
      throw new Error(
        `Migration journal mismatch: expected ${policy.migrations.length}, database has ${count}`,
      )
    }

    for (const [index, expected] of expectedMigrations.slice(0, count).entries()) {
      const applied = result.rows[index]
      if (
        applied?.hash !== expected?.hash ||
        Number(applied.created_at) !== expected.folderMillis
      ) {
        throw new Error(`Applied migration hash/timestamp drift at journal index ${index}`)
      }
    }

    if (policy.migrations.some((migration) => migration.tag === '0008_accounts_and_start_data')) {
      const requiredRelations = await client.query<{ name: string; relation: string | null }>(
        `SELECT value AS name, to_regclass(value) AS relation
       FROM unnest(ARRAY['app.accounts', 'app.start_datasets', 'account_auth.sessions']) AS required(value)`,
      )
      const missingRelations = requiredRelations.rows
        .filter((row) => row.relation === null)
        .map((row) => row.name)
      if (missingRelations.length > 0) {
        throw new Error(
          `Required account schema relations are missing: ${missingRelations.join(', ')}`,
        )
      }
    }

    return Object.freeze({ migrationCount: count })
  } finally {
    if (scopedDirectory !== null) rmSync(scopedDirectory, { recursive: true, force: true })
    try {
      await client.query('RESET ROLE')
      await client.query("SELECT pg_advisory_unlock(hashtext('tungchiahui-schema-migration'))")
    } finally {
      await client.end()
    }
  }
}
