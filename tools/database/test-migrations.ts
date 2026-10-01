import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { sql } from 'drizzle-orm'
import { Client } from 'pg'
import { z } from 'zod'
import { ownerDigest } from '../../src/control-plane/owner-password'
import { OwnerSessionRepository } from '../../src/control-plane/owner-sessions'
import { createDatabaseClient } from '../../src/database/client'
import { runPostgresMigrations } from '../../src/database/migrate'
import { documents } from '../../src/database/schema'
import { seedDevelopmentDatabase } from '../../src/database/seed'
import { techFootprintPayloadSchema } from '../../src/personal/contracts'
import { legacyRecordIdMap } from '../../src/personal/legacy-migration'
import { assertDockerPrerequisites, ComposeProject } from '../dev/compose'

const journalSchema = z.object({
  version: z.string(),
  dialect: z.literal('postgresql'),
  entries: z.array(
    z.object({
      idx: z.number().int(),
      version: z.string(),
      when: z.number().int(),
      tag: z.string(),
      breakpoints: z.boolean(),
    }),
  ),
})
const policySchema = z.object({
  schemaVersion: z.literal(1),
  migrations: z.array(z.object({ tag: z.string() }).passthrough()),
})
const previousFixtureSchema = z.object({
  schemaVersion: z.literal(1),
  throughMigration: z.string(),
  representativeDocument: z.object({
    id: z.uuid(),
    sourcePath: z.string().min(1),
    routePath: z.string().startsWith('/'),
  }),
})

function databaseUrl(port: number, database = 'tungchiahui') {
  return `postgresql://tungchiahui:local-only-postgres@127.0.0.1:${port}/${database}`
}

function stagePreviousMigrationFixture(
  repositoryRoot: string,
  temporaryRoot: string,
  throughMigration?: string,
) {
  const fixture = previousFixtureSchema.parse(
    JSON.parse(
      readFileSync(resolve(repositoryRoot, 'tests/fixtures/database/previous-schema.json'), 'utf8'),
    ) as unknown,
  )
  const journal = journalSchema.parse(
    JSON.parse(
      readFileSync(resolve(repositoryRoot, 'drizzle/meta/_journal.json'), 'utf8'),
    ) as unknown,
  )
  const policy = policySchema.parse(
    JSON.parse(
      readFileSync(resolve(repositoryRoot, 'drizzle/migration-policy.json'), 'utf8'),
    ) as unknown,
  )
  const fixtureIndex = journal.entries.findIndex(
    (entry) => entry.tag === (throughMigration ?? fixture.throughMigration),
  )

  if (fixtureIndex < 0) {
    throw new Error('Previous-schema fixture references an unknown migration')
  }

  const migrationsDirectory = resolve(
    temporaryRoot,
    throughMigration ? `through-${throughMigration}` : 'previous-migrations',
  )
  const metadataDirectory = resolve(migrationsDirectory, 'meta')
  mkdirSync(metadataDirectory, { recursive: true })
  const entries = journal.entries.slice(0, fixtureIndex + 1)

  for (const entry of entries) {
    copyFileSync(
      resolve(repositoryRoot, `drizzle/${entry.tag}.sql`),
      resolve(migrationsDirectory, `${entry.tag}.sql`),
    )
  }

  writeFileSync(
    resolve(metadataDirectory, '_journal.json'),
    `${JSON.stringify({ ...journal, entries }, null, 2)}\n`,
  )
  const tags = new Set(entries.map((entry) => entry.tag))
  const fixturePolicy = {
    ...policy,
    migrations: policy.migrations.filter((migration) => tags.has(migration.tag)),
  }
  const policyPath = resolve(migrationsDirectory, 'migration-policy.json')
  writeFileSync(policyPath, `${JSON.stringify(fixturePolicy, null, 2)}\n`)

  return Object.freeze({ fixture, migrationsDirectory, policyPath })
}

async function expectQueryFailure(client: Client, statement: string) {
  try {
    await client.query(statement)
  } catch {
    return
  }

  throw new Error(`Expected PostgreSQL statement to fail: ${statement}`)
}

async function assertRoleBoundary(connectionString: string) {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const roles = await client.query<{
      rolcreatedb: boolean
      rolcreaterole: boolean
      rolreplication: boolean
      rolsuper: boolean
    }>(
      "SELECT rolsuper, rolcreatedb, rolcreaterole, rolreplication FROM pg_roles WHERE rolname = 'site_app'",
    )
    const applicationRole = roles.rows[0]
    if (
      !applicationRole ||
      applicationRole.rolsuper ||
      applicationRole.rolcreatedb ||
      applicationRole.rolcreaterole ||
      applicationRole.rolreplication
    ) {
      throw new Error('Application role has administrative PostgreSQL attributes')
    }

    const membership = await client.query<{ elevated: boolean }>(
      `SELECT
        pg_has_role('site_app', 'site_migrator', 'MEMBER')
        OR pg_has_role('site_app', 'site_backup', 'MEMBER')
        OR pg_has_role('site_app', 'site_replication', 'MEMBER') AS elevated`,
    )
    if (membership.rows[0]?.elevated !== false) {
      throw new Error('Application role inherits migration, backup, or replication capability')
    }

    const controlRole = await client.query<{
      can_delete_documents: boolean
      can_insert_jobs: boolean
      can_select_documents: boolean
      can_update_job_status: boolean
      can_update_datasets: boolean
      can_update_jobs: boolean
      can_update_translation_cancel: boolean
      can_update_translation_jobs: boolean
      rolcreatedb: boolean
      rolcreaterole: boolean
      rolreplication: boolean
      rolsuper: boolean
    }>(
      `SELECT
        rolsuper,
        rolcreatedb,
        rolcreaterole,
        rolreplication,
        has_table_privilege('site_control_api', 'app.operational_jobs', 'INSERT') AS can_insert_jobs,
        has_table_privilege('site_control_api', 'app.operational_jobs', 'UPDATE') AS can_update_jobs,
        has_column_privilege('site_control_api', 'app.operational_jobs', 'status', 'UPDATE') AS can_update_job_status,
        has_table_privilege('site_control_api', 'app.translation_jobs', 'UPDATE') AS can_update_translation_jobs,
        has_column_privilege('site_control_api', 'app.translation_jobs', 'cancel_requested_at', 'UPDATE') AS can_update_translation_cancel,
        has_table_privilege('site_control_api', 'app.documents', 'SELECT') AS can_select_documents,
        has_table_privilege('site_control_api', 'app.owner_managed_datasets', 'UPDATE') AS can_update_datasets,
        has_table_privilege('site_control_api', 'app.documents', 'DELETE') AS can_delete_documents
       FROM pg_roles
       WHERE rolname = 'site_control_api'`,
    )
    const control = controlRole.rows[0]
    if (
      !control ||
      control.rolsuper ||
      control.rolcreatedb ||
      control.rolcreaterole ||
      control.rolreplication ||
      !control.can_insert_jobs ||
      control.can_update_jobs ||
      !control.can_update_job_status ||
      control.can_update_translation_jobs ||
      !control.can_update_translation_cancel ||
      !control.can_select_documents ||
      !control.can_update_datasets ||
      control.can_delete_documents
    ) {
      throw new Error('Control API PostgreSQL role violates its declared least-privilege boundary')
    }

    await client.query('SET ROLE site_app')
    await expectQueryFailure(client, 'SELECT * FROM owner_auth.sessions')
    await client.query('SELECT count(*) FROM app.documents')
    await expectQueryFailure(client, 'CREATE EXTENSION hstore')
    await expectQueryFailure(client, "SELECT pg_read_file('postgresql.conf', 0, 1)")
    await client.query('RESET ROLE')
    await client.query('SET ROLE site_content_worker')
    await expectQueryFailure(client, 'SELECT * FROM owner_auth.sessions')
    await expectQueryFailure(
      client,
      "INSERT INTO owner_auth.sessions (token_hash, credential_version, expires_at) VALUES ('forged', 'forged', now())",
    )
    await client.query('RESET ROLE')
    await client.query('SET ROLE site_control_api')
    await client.query('SELECT count(*) FROM owner_auth.sessions')
    await client.query('RESET ROLE')
  } finally {
    await client.end()
  }
}

async function assertOwnerSessionLifecycle(connectionString: string) {
  const repository = new OwnerSessionRepository(connectionString)
  const admin = new Client({ connectionString })
  await admin.connect()
  try {
    const credential = 'disposable-verifier-generation-one'
    const token = await repository.create(credential)
    if (!(await repository.valid(token, credential)))
      throw new Error('Owner session was not persisted')
    if (await repository.valid(token, 'rotated-verifier-generation-two'))
      throw new Error('Password rotation did not invalidate the old session')
    const stored = await admin.query<{ token_hash: string }>(
      'SELECT token_hash FROM owner_auth.sessions',
    )
    if (
      !stored.rows.some((row) => row.token_hash === ownerDigest(token)) ||
      stored.rows.some((row) => row.token_hash === token)
    )
      throw new Error('Owner session must persist only a token digest')
    await admin.query(
      "UPDATE owner_auth.sessions SET expires_at = now() - interval '1 second' WHERE token_hash = $1",
      [ownerDigest(token)],
    )
    if (await repository.valid(token, credential))
      throw new Error('Expired owner session was accepted')
    const next = await repository.create(credential)
    await repository.revoke(next)
    if (await repository.valid(next, credential))
      throw new Error('Revoked owner session was accepted')
    const remaining = await admin.query<{ count: string }>(
      'SELECT count(*) FROM owner_auth.sessions',
    )
    if (remaining.rows[0]?.count !== '0') throw new Error('Expired sessions were not pruned')
  } finally {
    await repository.close()
    await admin.end()
  }
}

async function assertDatabaseConstraints(connectionString: string) {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    await expectQueryFailure(
      client,
      `INSERT INTO app.operational_jobs
        (id, job_type, status, requested_by, idempotency_key, payload, progress)
       VALUES
        ('60000000-0000-4000-8000-000000000001', 'deploy', 'queued', 'test', 'invalid-job', '{}', '{}')`,
    )
    await expectQueryFailure(
      client,
      `INSERT INTO app.operational_jobs
        (id, job_type, status, requested_by, idempotency_key, payload, progress)
       VALUES
        ('60000000-0000-4000-8000-000000000002', 'content_sync', 'queued', 'test', 'invalid-payload', '[]', '{}')`,
    )
    await expectQueryFailure(
      client,
      `INSERT INTO app.document_translations
        (document_id, locale, translated_markdown, translation_hash, translation_version)
       VALUES
        ('10000000-0000-4000-8000-000000000001', 'zh-hant', 'invalid', '${'d'.repeat(64)}', 1)`,
    )
    await client.query(
      `INSERT INTO app.operational_jobs
        (id, job_type, status, requested_by, idempotency_key, payload, progress)
       VALUES
        ('60000000-0000-4000-8000-000000000003', 'translation', 'queued', 'test', 'invalid-translation-count', '{}', '{}')`,
    )
    await expectQueryFailure(
      client,
      `INSERT INTO app.translation_jobs
        (id, scope, requested_by, budget_usd, provider_request_count)
       VALUES
        ('60000000-0000-4000-8000-000000000003', 'pending', 'test', 1, -1)`,
    )
    await client.query(
      "DELETE FROM app.operational_jobs WHERE id = '60000000-0000-4000-8000-000000000003'",
    )
    await client.query(
      `INSERT INTO app.content_aliases (alias_path, document_id, approval_reference)
       SELECT '/blog/phase-18-compatible', id, 'Phase 18 migration test'
         FROM app.documents
        ORDER BY id
        LIMIT 1`,
    )
    await expectQueryFailure(
      client,
      `INSERT INTO app.content_aliases (alias_path, document_id, approval_reference)
       SELECT '/other/forbidden', id, 'invalid namespace'
         FROM app.documents
        ORDER BY id
        LIMIT 1`,
    )
  } finally {
    await client.end()
  }
}

async function assertSearchMigration(connectionString: string) {
  const client = new Client({ connectionString })
  await client.connect()
  try {
    const result = await client.query<{
      extension_available: boolean
      index_valid: boolean
      search_table: string | null
    }>(
      `SELECT
         EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pgroonga') AS extension_available,
         COALESCE((
           SELECT index.indisvalid
             FROM pg_index AS index
             JOIN pg_class AS relation ON relation.oid = index.indexrelid
            WHERE relation.relname = 'search_documents_full_text_idx'
         ), false) AS index_valid,
         to_regclass('app.search_documents')::text AS search_table`,
    )
    if (
      !result.rows[0]?.extension_available ||
      !result.rows[0].index_valid ||
      result.rows[0].search_table !== 'app.search_documents'
    ) {
      throw new Error('Phase 10 PGroonga search table/index migration is incomplete')
    }
    await client.query('REINDEX INDEX app.search_documents_full_text_idx')
  } finally {
    await client.end()
  }
}

async function assertPgBouncerDrizzleCompatibility(connectionString: string) {
  await seedDevelopmentDatabase(connectionString)
  const client = createDatabaseClient({
    applicationName: 'phase3-pgbouncer-test',
    connectionString,
    maxConnections: 2,
  })
  try {
    for (let iteration = 0; iteration < 2; iteration += 1) {
      const rows = await client.database.transaction(async (transaction) => {
        await transaction.execute(sql`SET LOCAL ROLE site_app`)
        return transaction.select({ id: documents.id }).from(documents)
      })
      if (rows.length !== 5) {
        throw new Error('Drizzle query through transaction-mode PgBouncer returned wrong rows')
      }
    }
  } finally {
    await client.close()
  }
}

async function run() {
  assertDockerPrerequisites()
  const repositoryRoot = process.cwd()
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tungchiahui-phase3-'))
  const suffix = basename(temporaryRoot)
    .replaceAll(/[^a-z0-9]/g, '')
    .slice(-12)
  const compose = new ComposeProject(repositoryRoot, `tungchiahui_migration_${suffix}`, 'test', {
    controlStateDirectory: resolve(temporaryRoot, 'control-state'),
    mode: 'test',
    openRestyPort: 18_443,
    s3Bucket: `tungchiahui-test-${suffix}`,
    s3RetainFiles: false,
    webPort: 3000,
  })
  let stackStarted = false

  try {
    mkdirSync(resolve(temporaryRoot, 'control-state'), { recursive: true, mode: 0o700 })
    compose.validateModel()
    stackStarted = true
    compose.up(['postgres', 'pgbouncer'])
    const postgresPort = compose.port('postgres', 5432)
    const pgbouncerPort = compose.port('pgbouncer', 6432)
    const cleanUrl = databaseUrl(postgresPort)
    const expectedMigrationCount = journalSchema.parse(
      JSON.parse(
        readFileSync(resolve(repositoryRoot, 'drizzle/meta/_journal.json'), 'utf8'),
      ) as unknown,
    ).entries.length

    const controlSchema = await runPostgresMigrations(cleanUrl, {
      repositoryRoot,
      scope: 'control-schema',
    })
    if (controlSchema.migrationCount !== 9)
      throw new Error('Control-service bootstrap exceeded its schema scope')
    const clean = await runPostgresMigrations(cleanUrl, {
      repositoryRoot,
      hasFreshRecoverableBackup: true,
      hasTechV3CompatiblePreviousRelease: true,
    })
    if (clean.migrationCount !== expectedMigrationCount) {
      throw new Error('Empty database did not reach the latest migration')
    }
    const repeated = await runPostgresMigrations(cleanUrl, {
      repositoryRoot,
      hasFreshRecoverableBackup: true,
      hasTechV3CompatiblePreviousRelease: true,
    })
    if (repeated.migrationCount !== clean.migrationCount) {
      throw new Error('Repeated migration changed the applied migration count')
    }
    const reconciledControlSchema = await runPostgresMigrations(cleanUrl, {
      repositoryRoot,
      scope: 'control-schema',
    })
    if (reconciledControlSchema.migrationCount !== clean.migrationCount)
      throw new Error('Control-service reconcile changed application migrations')
    await assertPgBouncerDrizzleCompatibility(databaseUrl(pgbouncerPort))
    await assertDatabaseConstraints(cleanUrl)
    await assertSearchMigration(cleanUrl)
    await assertRoleBoundary(cleanUrl)
    await assertOwnerSessionLifecycle(cleanUrl)

    const admin = new Client({ connectionString: cleanUrl })
    await admin.connect()
    try {
      await admin.query('CREATE DATABASE tungchiahui_previous')
      await admin.query('CREATE DATABASE tungchiahui_tech_v2')
    } finally {
      await admin.end()
    }

    if (expectedMigrationCount >= 10) {
      const techV2 = stagePreviousMigrationFixture(
        repositoryRoot,
        temporaryRoot,
        '0008_accounts_and_start_data',
      )
      const techV2Url = databaseUrl(postgresPort, 'tungchiahui_tech_v2')
      await runPostgresMigrations(techV2Url, {
        repositoryRoot,
        migrationsDirectory: techV2.migrationsDirectory,
        policyPath: techV2.policyPath,
      })
      const techClient = new Client({ connectionString: techV2Url })
      await techClient.connect()
      try {
        await techClient.query(
          'UPDATE app.owner_managed_datasets SET payload = \'{"version":2,"records":{"unknown/legacy/id":{}}}\'::jsonb WHERE dataset_key = \'tech_footprint\'',
        )
        let rejectedUnknown = false
        try {
          await runPostgresMigrations(techV2Url, {
            repositoryRoot,
            hasFreshRecoverableBackup: true,
            hasTechV3CompatiblePreviousRelease: true,
          })
        } catch {
          rejectedUnknown = true
        }
        const failedBackfill = await techClient.query<{
          version: string
          revision: number
          count: string
        }>(
          "SELECT payload->>'version' AS version, revision::integer AS revision, (SELECT count(*) FROM drizzle.__drizzle_migrations)::text AS count FROM app.owner_managed_datasets WHERE dataset_key = 'tech_footprint'",
        )
        if (
          !rejectedUnknown ||
          failedBackfill.rows[0]?.version !== '2' ||
          failedBackfill.rows[0].revision !== 0 ||
          failedBackfill.rows[0].count !== '9'
        )
          throw new Error('Rejected V2 backfill changed the original data or migration journal')
        const oldRecord = {
          status: 'doing',
          progress: 45,
          note: 'Preserved across migration',
          updatedAt: '2026-09-26T00:00:00.000Z',
        }
        await techClient.query(
          `UPDATE app.owner_managed_datasets SET payload = $1::jsonb WHERE dataset_key = 'tech_footprint'`,
          [JSON.stringify({ version: 2, records: { 'y1a/cpp-linux/cpp': oldRecord } })],
        )
        await runPostgresMigrations(techV2Url, {
          repositoryRoot,
          hasFreshRecoverableBackup: true,
          hasTechV3CompatiblePreviousRelease: true,
        })
        const migrated = await techClient.query<{ payload: unknown; revision: number }>(
          `SELECT payload, revision::integer AS revision FROM app.owner_managed_datasets WHERE dataset_key = 'tech_footprint'`,
        )
        const row = migrated.rows[0]
        if (!row) throw new Error('Migrated Tech dataset is missing')
        const payload = techFootprintPayloadSchema.parse(row.payload)
        await techClient.query(
          readFileSync(resolve(repositoryRoot, 'drizzle/0009_tech_footprint_v3.sql'), 'utf8'),
        )
        const replay = await techClient.query<{ payload: unknown; revision: number }>(
          "SELECT payload, revision::integer AS revision FROM app.owner_managed_datasets WHERE dataset_key = 'tech_footprint'",
        )
        if (
          JSON.stringify(replay.rows[0]?.payload) !== JSON.stringify(row.payload) ||
          replay.rows[0]?.revision !== row.revision
        )
          throw new Error('V3 backfill replay modified a migrated document')
        const stages = payload.roadmap.stages
        const tasks = stages.flatMap((stage) => stage.tasks)
        const subtasks = tasks.flatMap((task) => task.subtasks)
        if (
          stages.length !== 10 ||
          tasks.length !== 46 ||
          subtasks.length !== 231 ||
          row.revision !== 1 ||
          payload.records[legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? '']?.progress !==
            oldRecord.progress ||
          payload.records[legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? '']?.status !==
            oldRecord.status ||
          payload.records[legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? '']?.note !== oldRecord.note ||
          payload.records[legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? '']?.updatedAt !==
            oldRecord.updatedAt
        ) {
          throw new Error(
            `V2 to V3 Tech migration lost inventory, revision, or execution data (${stages.length}/${tasks.length}/${subtasks.length}, revision ${row.revision})`,
          )
        }
      } finally {
        await techClient.end()
      }
    }

    const previous = stagePreviousMigrationFixture(repositoryRoot, temporaryRoot)
    const previousUrl = databaseUrl(postgresPort, 'tungchiahui_previous')
    await runPostgresMigrations(previousUrl, {
      repositoryRoot,
      migrationsDirectory: previous.migrationsDirectory,
      policyPath: previous.policyPath,
    })
    const previousClient = new Client({ connectionString: previousUrl })
    await previousClient.connect()
    try {
      await previousClient.query(
        `INSERT INTO app.documents
          (id, content_type, source_path, source_commit, title, raw_frontmatter, raw_markdown, source_hash, route_path)
         VALUES ($1, 'blog', $2, $3, 'Previous schema fixture', '{}', '# Previous', $4, $5)`,
        [
          previous.fixture.representativeDocument.id,
          previous.fixture.representativeDocument.sourcePath,
          '2'.repeat(40),
          'e'.repeat(64),
          previous.fixture.representativeDocument.routePath,
        ],
      )
    } finally {
      await previousClient.end()
    }
    await runPostgresMigrations(previousUrl, {
      repositoryRoot,
      hasFreshRecoverableBackup: true,
      hasTechV3CompatiblePreviousRelease: true,
    })
    const upgradedClient = new Client({ connectionString: previousUrl })
    await upgradedClient.connect()
    try {
      const result = await upgradedClient.query<{
        preserved: boolean
        search_table: string | null
        translation_execution: boolean
        translation_table: string | null
      }>(
        `SELECT
          EXISTS (SELECT 1 FROM app.documents WHERE id = $1) AS preserved,
          EXISTS (
            SELECT 1 FROM information_schema.columns
             WHERE table_schema = 'app' AND table_name = 'translation_jobs'
               AND column_name = 'execution_mode'
          ) AS translation_execution,
          to_regclass('app.document_translation_segments')::text AS translation_table,
          to_regclass('app.search_documents')::text AS search_table`,
        [previous.fixture.representativeDocument.id],
      )
      if (
        !result.rows[0]?.preserved ||
        !result.rows[0].translation_execution ||
        result.rows[0].translation_table === null ||
        result.rows[0].search_table === null
      ) {
        throw new Error('Previous production-like schema did not upgrade while preserving data')
      }
    } finally {
      await upgradedClient.end()
    }

    // A matching journal must not hide missing objects in the latest schema.
    const driftClient = new Client({ connectionString: previousUrl })
    await driftClient.connect()
    try {
      await driftClient.query('ALTER TABLE app.start_datasets RENAME TO start_datasets_missing')
      let rejected = false
      try {
        await runPostgresMigrations(previousUrl, {
          repositoryRoot,
          hasFreshRecoverableBackup: true,
          hasTechV3CompatiblePreviousRelease: true,
        })
      } catch (error) {
        if (
          !(error instanceof Error) ||
          !error.message.includes(
            'Required account schema relations are missing: app.start_datasets',
          )
        ) {
          throw error
        }
        rejected = true
      }
      if (!rejected) throw new Error('Latest-schema relation drift was not rejected')
    } finally {
      await driftClient.query('ALTER TABLE app.start_datasets_missing RENAME TO start_datasets')
      await driftClient.end()
    }

    console.log(`PostgreSQL migration suite: PASS (${expectedMigrationCount} migrations)`)
  } finally {
    if (stackStarted) {
      compose.down(true)
      compose.assertRemoved()
    }
    rmSync(temporaryRoot, { force: true, recursive: true })
  }
}

run().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unknown Phase 3 migration failure')
  process.exitCode = 1
})
