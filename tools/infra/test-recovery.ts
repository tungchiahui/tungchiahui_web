import { spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { chmodSync, chownSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'
import { initializeControlState } from '../../src/control-plane/control-state'
import { runPostgresMigrations } from '../../src/database/migrate'
import { seedDevelopmentDatabase } from '../../src/database/seed'
import {
  commitHostGeneration,
  initializeHostReleaseState,
  readHostGeneration,
  readHostRuntime,
  stageHostGeneration,
} from '../../src/host-release/state'
import { techFootprintPayloadSchema } from '../../src/personal/contracts'
import { legacyRecordIdMap, migrateLegacyTechPayload } from '../../src/personal/legacy-migration'
import { dailyProtectionProgressSchema } from '../../src/recovery/daily-protection'
import { parseS3ConnectionConfiguration } from '../../src/storage/contracts'
import { S3ObjectStorageAdapter } from '../../src/storage/s3-adapter'
import { verifyUnifiedHealth } from '../health/verify-health'

const input = z
  .object({
    PHASE13_GIT_SHA: z.string().regex(/^[a-f0-9]{40}$/),
    PHASE13_HOST_ROOT: z.string().startsWith('/'),
    PHASE13_REPOSITORY_ROOT: z.string().startsWith('/'),
    PHASE13_SOURCE_POSTGRES_IMAGE: z
      .string()
      .regex(/^ghcr\.io\/tungchiahui\/tungchiahui_web-postgres@sha256:[a-f0-9]{64}$/)
      .optional(),
    PHASE13_RECOVERY_IMAGE: z
      .string()
      .regex(/^ghcr\.io\/tungchiahui\/tungchiahui_web-recovery@sha256:[a-f0-9]{64}$/)
      .optional(),
  })
  .parse(process.env)

const suffix = `${process.pid}-${Date.now()}`
const postgresName = `phase13-postgres-${suffix}`
const backupName = `phase13-offsite-s3-${suffix}`
const postgresImage = `tungchiahui-postgres:${input.PHASE13_GIT_SHA}`
const recoveryImage =
  input.PHASE13_RECOVERY_IMAGE ?? `tungchiahui-recovery-test:${input.PHASE13_GIT_SHA}`
const pgDataRoot = join(input.PHASE13_HOST_ROOT, 'postgres')
const repositoryPath = join(input.PHASE13_HOST_ROOT, 'repository')
const socketPath = join(input.PHASE13_HOST_ROOT, 'socket')
const controlStatePath = join(input.PHASE13_HOST_ROOT, 'control-state')
const workPath = join(input.PHASE13_HOST_ROOT, 'work')
const ageIdentityPath = join(input.PHASE13_HOST_ROOT, 'age-identity.txt')
const pgBackRestConfig = join(input.PHASE13_REPOSITORY_ROOT, 'ops/production/pgbackrest.conf')
const cipher = `phase13-disposable-cipher-${'x'.repeat(48)}`
const s3Image =
  'adobe/s3mock:5.1.0@sha256:65cf60155a2e235fe7d5bf6c633747d6fc7ed93f9f5a6727d86470026b83c2a2'
const backupResultSchema = z
  .object({
    backup: z.object({
      backupId: z.string(),
      measuredBytes: z.number().int().nonnegative(),
      measuredSeconds: z.number().nonnegative(),
      repositoryGeneration: z.string().min(1),
      valid: z.literal(true),
      walArchiveMax: z.string().nullable(),
    }),
    controlState: z.object({ artifact: z.record(z.string(), z.unknown()) }).passthrough(),
  })
  .passthrough()

for (const directory of [pgDataRoot, repositoryPath, socketPath, controlStatePath, workPath]) {
  mkdirSync(directory, { mode: 0o770, recursive: true })
  chownSync(directory, 70, 10050)
}
chmodSync(input.PHASE13_HOST_ROOT, 0o755)

function execute(executable: string, arguments_: readonly string[], allowFailure = false) {
  const result = spawnSync(executable, arguments_, { encoding: 'utf8' })
  if (result.error) throw result.error
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `${executable} ${arguments_.join(' ')} failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`,
    )
  }
  return result
}

function docker(arguments_: readonly string[], allowFailure = false) {
  return execute('docker', arguments_, allowFailure)
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function ensureImmutableImage(reference: string) {
  let inspection = docker(['image', 'inspect', reference], true)
  if (inspection.status !== 0) {
    expect(inspection.stderr.includes('No such image'), 'Cannot inspect the local pinned image')
    docker(['pull', reference])
    inspection = docker(['image', 'inspect', reference])
  }
  const images = z
    .array(z.object({ RepoDigests: z.array(z.string()).nullable() }))
    .length(1)
    .parse(JSON.parse(inspection.stdout) as unknown)
  expect(
    images[0]?.RepoDigests?.includes(reference) === true,
    'Local image does not retain the requested registry digest',
  )
}

function startS3(name: string, bucket: string) {
  docker([
    'run',
    '--detach',
    '--name',
    name,
    '--publish',
    '127.0.0.1::9090',
    '--env',
    `COM_ADOBE_TESTING_S3MOCK_STORE_INITIAL_BUCKETS=${bucket}`,
    '--env',
    'COM_ADOBE_TESTING_S3MOCK_STORE_REGION=us-east-1',
    '--env',
    'COM_ADOBE_TESTING_S3MOCK_STORE_RETAIN_FILES_ON_EXIT=false',
    s3Image,
  ])
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = execute(
      'curl',
      ['--fail', '--silent', `http://127.0.0.1:${publishedPort(name, 9090)}/favicon.ico`],
      true,
    )
    if (result.status === 0) return publishedPort(name, 9090)
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  throw new Error(`${name} did not become healthy`)
}

function publishedPort(name: string, port: number) {
  const output = docker(['port', name, `${String(port)}/tcp`]).stdout.trim()
  const match = /:(\d+)$/.exec(output)
  if (!match?.[1]) throw new Error(`Unable to resolve published port for ${name}`)
  return Number(match[1])
}

function waitForPostgres() {
  for (let attempt = 0; attempt < 60; attempt += 1) {
    const result = docker(
      [
        'exec',
        postgresName,
        'psql',
        '--username',
        'tungchiahui',
        '--dbname',
        'tungchiahui',
        '--command',
        'SELECT 1',
      ],
      true,
    )
    if (result.status === 0) return
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500)
  }
  throw new Error('Disposable recovery PostgreSQL did not become ready')
}

function psql(sql: string) {
  return docker([
    'exec',
    postgresName,
    'psql',
    '--set',
    'ON_ERROR_STOP=1',
    '--username',
    'tungchiahui',
    '--dbname',
    'tungchiahui',
    '--tuples-only',
    '--no-align',
    '--command',
    sql,
  ]).stdout.trim()
}

function applicationFingerprint() {
  const tables = z.array(z.object({ schema: z.string(), name: z.string() })).parse(
    JSON.parse(
      psql(`SELECT json_agg(json_build_object('schema', schemaname, 'name', tablename)
      ORDER BY schemaname, tablename) FROM pg_tables
      WHERE schemaname IN ('app', 'health', 'account_auth', 'drizzle')
        AND tablename NOT IN ('recovery_fixture', 'schema_marker')`),
    ) as unknown,
  )
  const hash = createHash('sha256')
  for (const table of tables) {
    const relation = [table.schema, table.name]
      .map((part) => `"${part.replaceAll('"', '""')}"`)
      .join('.')
    hash.update(relation)
    hash.update(
      psql(`SELECT md5(COALESCE(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,
      '[]')) FROM ${relation} r`),
    )
  }
  return hash.digest('hex')
}

function verifySearchAndPrivacy() {
  const settings = 'SET search_path TO app, public; SET enable_seqscan=off;'
  for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en-us']) {
    const query = `SELECT count(*) FROM app.search_documents
      WHERE locale = '${locale}' AND ARRAY[title, headings, body, metadata] &@
      ('Seed', ARRAY[16, 8, 2, 4], 'search_documents_full_text_idx')::pgroonga_full_text_search_condition`
    expect(
      Number(psql(`${settings} ${query}`).split('\n').at(-1)) > 0,
      `Restored ${locale} PGroonga search returned no seeded document`,
    )
    expect(
      psql(`${settings} EXPLAIN ${query}`).includes('search_documents_full_text_idx'),
      `${locale} search did not use the PGroonga index`,
    )
  }
  expect(
    psql("SELECT has_table_privilege('site_app', 'app.body_measurements', 'SELECT')") === 'f',
    'Public role gained access to private body measurements',
  )
  expect(
    psql(
      "SET ROLE site_app; SELECT count(*) FROM app.owner_managed_datasets WHERE dataset_key='weight_loss'",
    )
      .split('\n')
      .at(-1) === '0',
    'Public role can read the frozen legacy weight dataset',
  )
}

function startPostgres(image: string) {
  docker([
    'run',
    '--detach',
    '--name',
    postgresName,
    '--publish',
    '127.0.0.1::5432',
    '--read-only',
    '--cap-drop',
    'ALL',
    '--security-opt',
    'no-new-privileges:true',
    '--tmpfs',
    '/tmp:size=32m,mode=1777,noexec,nosuid,nodev',
    '--env',
    'POSTGRES_DB=tungchiahui',
    '--env',
    'POSTGRES_USER=tungchiahui',
    '--env',
    'POSTGRES_PASSWORD=phase13-disposable-password',
    '--env',
    `PGBACKREST_REPO1_CIPHER_PASS=${cipher}`,
    '--mount',
    `type=bind,source=${pgDataRoot},target=/var/lib/postgresql`,
    '--mount',
    `type=bind,source=${repositoryPath},target=/var/lib/pgbackrest`,
    '--mount',
    `type=bind,source=${socketPath},target=/run/postgresql`,
    '--mount',
    `type=bind,source=${pgBackRestConfig},target=/etc/pgbackrest/pgbackrest.conf,readonly`,
    image,
    'postgres',
    '-c',
    'archive_mode=on',
    '-c',
    'archive_command=pgbackrest --config=/etc/pgbackrest/pgbackrest.conf --stanza=tungchiahui archive-push %p',
    '-c',
    'archive_timeout=1',
  ])
  waitForPostgres()
}

function switchPostgres(image: string) {
  docker(['stop', '--time', '30', postgresName])
  docker(['rm', postgresName])
  startPostgres(image)
}

function recoveryEnvironment(backupPort: number) {
  return [
    'PGBACKREST_REPO1_CIPHER_PASS',
    cipher,
    'BACKUP_AGE_RECIPIENT',
    execute('age-keygen', ['--y', ageIdentityPath]).stdout.trim(),
    'BACKUP_AGE_IDENTITY_PATH',
    '/run/secrets/age-identity.txt',
    'BACKUP_LOCAL_REPOSITORY_PATH',
    '/var/lib/pgbackrest',
    'BACKUP_PGBACKREST_CONFIG_PATH',
    '/etc/pgbackrest/pgbackrest.conf',
    'BACKUP_PGBACKREST_STANZA',
    'tungchiahui',
    'BACKUP_POSTGRES_DATA_PATH',
    '/var/lib/postgresql/18/docker',
    'BACKUP_WORK_DIRECTORY',
    '/var/lib/backup-work',
    'CONTROL_STATE_PATH',
    '/control-state/control.db',
    'SITE_RUNTIME_MODE',
    'test',
    'BACKUP_S3_ENDPOINT',
    `http://127.0.0.1:${String(backupPort)}`,
    'BACKUP_S3_REGION',
    'us-east-1',
    'BACKUP_S3_BUCKET',
    'phase13-primary',
    'BACKUP_S3_ACCESS_KEY_ID',
    'backup-only-access',
    'BACKUP_S3_SECRET_ACCESS_KEY',
    'backup-only-secret',
    'BACKUP_S3_FORCE_PATH_STYLE',
    'true',
    'BACKUP_OFFSITE_S3_ENDPOINT',
    `http://127.0.0.1:${String(backupPort)}`,
    'BACKUP_OFFSITE_S3_REGION',
    'us-east-1',
    'BACKUP_OFFSITE_S3_BUCKET',
    'phase13-offsite',
    'BACKUP_OFFSITE_S3_ACCESS_KEY_ID',
    'offsite-backup-only-access',
    'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY',
    'offsite-backup-only-secret',
    'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE',
    'true',
    'ASSET_S3_ENDPOINT',
    `http://127.0.0.1:${String(backupPort)}`,
    'ASSET_S3_BUCKET',
    'phase13-primary',
    'ASSET_S3_ACCESS_KEY_ID',
    'asset-read-only-access',
    'ASSET_S3_SECRET_ACCESS_KEY',
    'asset-read-only-secret',
  ].flatMap((value, index, values) =>
    index % 2 === 0 ? ['--env', `${value}=${values[index + 1]}`] : [],
  )
}

function runRecovery(
  backupPort: number,
  action: 'backup' | 'control-state-restore' | 'offsite-retry' | 'restore' | 'daily-protection',
  argument: string,
  allowFailure = false,
) {
  const result = docker(
    [
      'run',
      '--rm',
      '--network',
      'host',
      '--user',
      '70:10050',
      ...recoveryEnvironment(backupPort),
      '--mount',
      `type=bind,source=${pgDataRoot},target=/var/lib/postgresql`,
      '--mount',
      `type=bind,source=${repositoryPath},target=/var/lib/pgbackrest`,
      '--mount',
      `type=bind,source=${socketPath},target=/run/postgresql`,
      '--mount',
      `type=bind,source=${controlStatePath},target=/control-state`,
      '--mount',
      `type=bind,source=${workPath},target=/var/lib/backup-work`,
      '--mount',
      `type=bind,source=${ageIdentityPath},target=/run/secrets/age-identity.txt,readonly`,
      '--mount',
      `type=bind,source=${pgBackRestConfig},target=/etc/pgbackrest/pgbackrest.conf,readonly`,
      recoveryImage,
      'node',
      'dist/recovery-drill.cjs',
      action,
      argument,
    ],
    allowFailure,
  )
  if (result.status !== 0) {
    return Object.freeze({ status: result.status, stderr: result.stderr.trim() })
  }
  const lines = result.stdout.trim().split('\n')
  return JSON.parse(lines.at(-1) ?? '{}') as unknown
}

async function removeOffsiteBackupGeneration(backupPort: number, generation: string) {
  const storage = new S3ObjectStorageAdapter(
    parseS3ConnectionConfiguration({
      accessKeyId: 'offsite-backup-only-access',
      bucket: 'phase13-offsite',
      endpoint: `http://127.0.0.1:${String(backupPort)}`,
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'offsite-backup-only-secret',
    }),
  )
  const prefix = `backups/database-backups/${generation}/`
  try {
    const keys = await storage.listObjects(prefix)
    expect(keys.length > 0, 'Off-site backup generation was not created')
    for (const key of keys) await storage.deleteObject(key)
    expect(
      (await storage.listObjects(prefix)).length === 0,
      'Off-site backup generation deletion failed',
    )
  } finally {
    storage.destroy()
  }
}

async function removePrimaryReplica(backupPort: number) {
  const storage = new S3ObjectStorageAdapter(
    parseS3ConnectionConfiguration({
      accessKeyId: 'backup-only-access',
      bucket: 'phase13-primary',
      endpoint: `http://127.0.0.1:${String(backupPort)}`,
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: 'backup-only-secret',
    }),
  )
  try {
    const keys = await storage.listObjects('')
    for (const key of keys) await storage.deleteObject(key)
    expect((await storage.listObjects('')).length === 0, 'Primary replica deletion failed')
  } finally {
    storage.destroy()
  }
}

async function main() {
  const hostRelease = {
    sha: input.PHASE13_GIT_SHA,
    webDigest: `sha256:${'a'.repeat(64)}`,
    serviceDigest: `sha256:${'b'.repeat(64)}`,
    recoveryDigest: `sha256:${'c'.repeat(64)}`,
  }
  const controlDatabase = join(controlStatePath, 'control.db')
  initializeControlState(controlDatabase, 'test')
  initializeHostReleaseState(controlDatabase)
  stageHostGeneration(controlDatabase, hostRelease)
  commitHostGeneration(controlDatabase, hostRelease.sha)
  chownSync(controlDatabase, 70, 10050)
  chmodSync(controlDatabase, 0o660)

  execute('age-keygen', ['--output', ageIdentityPath])
  chmodSync(ageIdentityPath, 0o640)
  chownSync(ageIdentityPath, 70, 10050)

  docker([
    'build',
    '--file',
    'ops/production/images/postgres.Dockerfile',
    '--build-arg',
    `SITE_DEPLOYMENT_SHA=${input.PHASE13_GIT_SHA}`,
    '--tag',
    postgresImage,
    '.',
  ])
  if (input.PHASE13_RECOVERY_IMAGE) {
    ensureImmutableImage(recoveryImage)
  } else {
    docker([
      'build',
      '--file',
      'ops/production/images/recovery.Dockerfile',
      '--build-arg',
      `SITE_DEPLOYMENT_SHA=${input.PHASE13_GIT_SHA}`,
      '--build-arg',
      `SITE_PGBOUNCER_IMAGE=tungchiahui-pgbouncer:${input.PHASE13_GIT_SHA}`,
      '--build-arg',
      `SITE_PGBOUNCER_SHA=${input.PHASE13_GIT_SHA}`,
      '--tag',
      recoveryImage,
      '.',
    ])
  }

  let backupPort = 0
  try {
    backupPort = startS3(backupName, 'phase13-primary,phase13-offsite')
    const sourceImage = input.PHASE13_SOURCE_POSTGRES_IMAGE ?? postgresImage
    if (input.PHASE13_SOURCE_POSTGRES_IMAGE) ensureImmutableImage(sourceImage)
    startPostgres(sourceImage)
    const sourceVersion = psql('SHOW server_version')
    const databaseUrl = `postgresql://tungchiahui:phase13-disposable-password@127.0.0.1:${publishedPort(postgresName, 5432)}/tungchiahui`
    const migrations = await runPostgresMigrations(databaseUrl, {
      repositoryRoot: process.cwd(),
      hasFreshRecoverableBackup: true,
      hasTechV3CompatiblePreviousRelease: true,
      hasHealthCompatiblePreviousRelease: true,
    })
    await seedDevelopmentDatabase(databaseUrl, { includeProjects: false })
    await verifyUnifiedHealth(databaseUrl)
    const extensionVersion = psql("SELECT extversion FROM pg_extension WHERE extname='pgroonga'")
    const backupVersion = docker(['exec', postgresName, 'pgbackrest', 'version']).stdout.trim()
    verifySearchAndPrivacy()
    docker([
      'exec',
      postgresName,
      'pgbackrest',
      '--config=/etc/pgbackrest/pgbackrest.conf',
      '--stanza=tungchiahui',
      'stanza-create',
    ])
    docker([
      'exec',
      postgresName,
      'pgbackrest',
      '--config=/etc/pgbackrest/pgbackrest.conf',
      '--stanza=tungchiahui',
      'check',
    ])
    psql(
      `CREATE TABLE app.schema_marker(version integer PRIMARY KEY); INSERT INTO app.schema_marker VALUES (${migrations.migrationCount}); CREATE TABLE app.recovery_fixture(value text PRIMARY KEY); INSERT INTO app.recovery_fixture VALUES ('base');`,
    )
    const migratedTech = migrateLegacyTechPayload({
      version: 2,
      records: {
        'y1a/cpp-linux/cpp': {
          status: 'doing',
          progress: 65,
          note: 'PITR retained note',
          updatedAt: '2026-09-26T00:00:00.000Z',
        },
      },
    })
    const representativeStage = migratedTech.roadmap.stages[0]
    const representativeTask = representativeStage?.tasks[0]
    const representativeSubtask = representativeTask?.subtasks[0]
    if (!representativeStage || !representativeTask || !representativeSubtask)
      throw new Error('Tech V3 recovery fixture is incomplete')
    const techFixture = techFootprintPayloadSchema.parse({
      ...migratedTech,
      roadmap: {
        stages: [
          {
            ...representativeStage,
            tasks: [{ ...representativeTask, subtasks: [representativeSubtask] }],
          },
        ],
      },
    })
    const techJson = JSON.stringify(techFixture).replaceAll("'", "''")
    psql(`UPDATE app.owner_managed_datasets SET payload = '${techJson}'::jsonb, revision = 7
      WHERE dataset_key = 'tech_footprint';`)
    const baseline = applicationFingerprint()
    const full = backupResultSchema.parse(runRecovery(backupPort, 'backup', 'full'))
    if (input.PHASE13_SOURCE_POSTGRES_IMAGE) {
      switchPostgres(postgresImage)
      expect(
        psql('SHOW server_version') === sourceVersion,
        'Library-only maintenance changed PostgreSQL version',
      )
      expect(
        psql("SELECT extversion FROM pg_extension WHERE extname='pgroonga'") === extensionVersion &&
          docker(['exec', postgresName, 'pgbackrest', 'version']).stdout.trim() === backupVersion,
        'Library-only maintenance changed the extension or backup version',
      )
      expect(applicationFingerprint() === baseline, 'Forward image switch changed application data')
      verifySearchAndPrivacy()
      psql("INSERT INTO app.recovery_fixture VALUES ('candidate-write')")
      switchPostgres(sourceImage)
      expect(
        psql("SELECT count(*) FROM app.recovery_fixture WHERE value='candidate-write'") === '1',
        'Old image rollback lost a candidate write',
      )
      expect(applicationFingerprint() === baseline, 'Old image rollback changed application data')
      verifySearchAndPrivacy()
      switchPostgres(postgresImage)
    }

    await removeOffsiteBackupGeneration(backupPort, full.backup.repositoryGeneration)
    const offsiteRetry = z
      .object({
        backup: z.string(),
        offsite: z.object({ files: z.number().int().positive() }).passthrough(),
        primary: z.object({ files: z.number().int().positive() }).passthrough(),
      })
      .passthrough()
      .parse(runRecovery(backupPort, 'offsite-retry', full.backup.backupId))
    expect(
      offsiteRetry.backup === full.backup.backupId,
      'Off-site retry changed the backup identity',
    )
    psql("INSERT INTO app.recovery_fixture VALUES ('before-target')")
    const targetTime = psql(
      'SELECT to_char(clock_timestamp() AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\');',
    )
    psql('SELECT pg_switch_wal()')
    psql('SELECT pg_sleep(1.2)')
    psql("INSERT INTO app.recovery_fixture VALUES ('after-target'); SELECT pg_switch_wal();")
    const differential = backupResultSchema.parse(runRecovery(backupPort, 'backup', 'diff'))
    const dailyInput = {
      date: new Intl.DateTimeFormat('en-CA', {
        timeZone: 'Asia/Hong_Kong',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(new Date()),
      databaseBackupType: 'diff',
    }
    const daily = dailyProtectionProgressSchema.parse(
      runRecovery(backupPort, 'daily-protection', JSON.stringify(dailyInput)),
    )
    expect(
      daily.database?.backupId === differential.backup.backupId,
      'Daily protection created a duplicate database backup',
    )
    expect(
      Boolean(daily.controlState && daily.assets && daily.manifestSha256),
      'Daily protection did not verify all components',
    )
    const dailyReplay = dailyProtectionProgressSchema.parse(
      runRecovery(backupPort, 'daily-protection', JSON.stringify({ ...dailyInput, prior: daily })),
    )
    expect(
      dailyReplay.database?.backupId === daily.database?.backupId &&
        dailyReplay.assets?.manifestKey === daily.assets?.manifestKey &&
        dailyReplay.controlState?.objectKey === daily.controlState?.objectKey,
      'Daily protection replay repeated a completed component',
    )
    psql("INSERT INTO app.recovery_fixture VALUES ('incremental-later'); SELECT pg_switch_wal();")
    const incremental = backupResultSchema.parse(runRecovery(backupPort, 'backup', 'incr'))
    docker(['stop', '--time', '30', postgresName])
    const targetDataPath = join(pgDataRoot, '18', 'docker')
    if (input.PHASE13_SOURCE_POSTGRES_IMAGE) {
      writeFileSync(join(targetDataPath, '.tungchiahui-disposable-recovery-target'), 'test')
      runRecovery(
        backupPort,
        'restore',
        JSON.stringify({
          confirmation: 'RESTORE-TEST',
          environment: 'test',
          selector: { backupId: full.backup.backupId },
        }),
      )
      docker(['start', postgresName])
      waitForPostgres()
      expect(applicationFingerprint() === baseline, 'Old full backup changed application data')
      expect(
        psql("SELECT count(*) FROM app.recovery_fixture WHERE value='before-target'") === '0',
        'Old full backup restore included later writes',
      )
      verifySearchAndPrivacy()
      docker(['stop', '--time', '30', postgresName])
    }
    await removePrimaryReplica(backupPort)
    writeFileSync(join(targetDataPath, '.tungchiahui-disposable-recovery-target'), 'test')
    const rejectedPartialRestore = z
      .object({ status: z.number().int().positive() })
      .passthrough()
      .parse(
        runRecovery(
          backupPort,
          'restore',
          JSON.stringify({
            confirmation: 'RESTORE-TEST',
            environment: 'test',
            selector: { targetTime: '2000-01-01T00:00:00.000Z' },
          }),
          true,
        ),
      )
    expect(rejectedPartialRestore.status > 0, 'Invalid PITR target unexpectedly restored')
    expect(
      !existsSync(join(targetDataPath, 'PG_VERSION')),
      'Failed partial restore unexpectedly left a bootable PostgreSQL target',
    )
    writeFileSync(join(targetDataPath, '.tungchiahui-disposable-recovery-target'), 'test')
    const restoreStartedAt = performance.now()
    runRecovery(
      backupPort,
      'restore',
      JSON.stringify({
        confirmation: 'RESTORE-TEST',
        environment: 'test',
        selector: { targetTime },
      }),
    )
    docker(['start', postgresName])
    waitForPostgres()
    const restoreSeconds = (performance.now() - restoreStartedAt) / 1_000
    expect(
      psql('SHOW server_version_num').startsWith('18'),
      'Restored PostgreSQL major version is not 18',
    )
    expect(
      psql('SELECT version FROM app.schema_marker') === String(migrations.migrationCount),
      'Migration/version marker was not restored',
    )
    const values = psql('SELECT value FROM app.recovery_fixture ORDER BY value').split('\n')
    expect(values.includes('base'), 'Representative application row is missing after PITR')
    expect(values.includes('before-target'), 'Pre-target row is missing after PITR')
    expect(!values.includes('after-target'), 'Post-target row survived PITR')
    expect(!values.includes('incremental-later'), 'Later incremental row survived PITR')
    expect(
      applicationFingerprint() === baseline,
      'PITR changed application data or migration ledger',
    )
    verifySearchAndPrivacy()
    if (input.PHASE13_SOURCE_POSTGRES_IMAGE) {
      switchPostgres(sourceImage)
      expect(applicationFingerprint() === baseline, 'Candidate backup cannot run on the old image')
      expect(
        psql("SELECT count(*) FROM app.recovery_fixture WHERE value='before-target'") === '1',
        'Old image lost pre-target data after candidate backup restore',
      )
      verifySearchAndPrivacy()
      switchPostgres(postgresImage)
    }
    docker([
      'exec',
      postgresName,
      'pg_amcheck',
      '--all',
      '--install-missing',
      '--username',
      'tungchiahui',
    ])
    const restoredTech = techFootprintPayloadSchema.parse(
      JSON.parse(
        psql(
          "SELECT payload::text FROM app.owner_managed_datasets WHERE dataset_key = 'tech_footprint'",
        ),
      ) as unknown,
    )
    const restoredTasks = restoredTech.roadmap.stages.flatMap((stage) => stage.tasks)
    const restoredSubtasks = restoredTasks.flatMap((task) => task.subtasks)
    const restoredIds = [
      ...restoredTech.roadmap.stages.map((stage) => stage.id),
      ...restoredTasks.map((task) => task.id),
      ...restoredSubtasks.map((subtask) => subtask.id),
    ]
    expect(
      restoredTech.version === 3 &&
        restoredTech.roadmap.stages.length > 0 &&
        restoredTasks.length > 0 &&
        restoredSubtasks.length > 0 &&
        new Set(restoredIds).size === restoredIds.length,
      'Tech V3 hierarchy was not recovered consistently',
    )
    expect(
      restoredTasks[0]?.title.zhCN === representativeTask.title.zhCN,
      'Representative Tech task title changed during PITR',
    )
    const techRecord = restoredTech.records[legacyRecordIdMap['y1a/cpp-linux/cpp'] ?? '']
    expect(
      techRecord?.progress === 65 &&
        techRecord.note === 'PITR retained note' &&
        psql(
          "SELECT revision FROM app.owner_managed_datasets WHERE dataset_key = 'tech_footprint'",
        ) === '7',
      'Tech progress, note, or revision was not recovered',
    )

    const controlState = incremental.controlState
    const restoredControl = z.record(z.string(), z.unknown()).parse(
      runRecovery(
        backupPort,
        'control-state-restore',
        JSON.stringify({
          targetPath: '/control-state/restored-control.db',
        }),
      ),
    )
    expect(
      restoredControl.auditDigest === controlState.artifact.auditDigest,
      'Control-state audit continuity was not preserved',
    )
    expect(
      readHostRuntime(join(controlStatePath, 'restored-control.db')).current_sha ===
        hostRelease.sha,
      'Encrypted offsite restore lost the server release generation',
    )
    expect(
      JSON.stringify(
        readHostGeneration(join(controlStatePath, 'restored-control.db'), hostRelease.sha),
      ) === JSON.stringify(hostRelease),
      'Encrypted restore changed immutable host release digests',
    )
    expect(full.backup.valid, 'Full backup was not marked valid')

    console.log(
      JSON.stringify({
        sourceImage,
        recoveryImage,
        candidateImageId: docker([
          'image',
          'inspect',
          '--format',
          '{{.Id}}',
          postgresImage,
        ]).stdout.trim(),
        sourceVersion,
        extensionVersion,
        backupVersion,
        migrationCount: migrations.migrationCount,
        applicationFingerprint: baseline,
        searchAndPrivacy: 'four-locales-index-backed-and-private-roles-preserved',
        imageCompatibility: input.PHASE13_SOURCE_POSTGRES_IMAGE
          ? 'forward-rollback-old-full-to-candidate-candidate-pitr-to-old-pass'
          : 'same-image',
        backupPolicy: ['full', 'diff', 'incr'],
        backupMeasurements: [full.backup, differential.backup, incremental.backup],
        controlState: 'encrypted-snapshot-restored',
        hostReleaseRecovery: 'generation-preserved',
        pitrTarget: targetTime,
        partialRestoreRetry: 'pass',
        offsiteOnlyRetry: 'pass',
        postgresDownRestore: 'pass',
        replicas: 'primary-and-offsite-fresh-with-offsite-fallback-restore',
        representativeApplicationRead: 'pass',
        techRoadmapV3Restore: 'pass',
        dailyProtectionVerifiedComponentsAndReplay: 'pass',
        restoreSeconds,
        status: 'pass',
      }),
    )
  } finally {
    for (const name of [postgresName, backupName]) {
      docker(['rm', '--force', name], true)
    }
  }
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unknown recovery test failure')
  process.exitCode = 1
})
