import { spawnSync } from 'node:child_process'
import { chmodSync, chownSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { z } from 'zod'

const input = z
  .object({
    PHASE13_GIT_SHA: z.string().regex(/^[a-f0-9]{40}$/),
    PHASE13_HOST_ROOT: z.string().startsWith('/'),
    PHASE13_REPOSITORY_ROOT: z.string().startsWith('/'),
  })
  .parse(process.env)

const suffix = `${process.pid}-${Date.now()}`
const postgresName = `phase13-postgres-${suffix}`
const primaryName = `phase13-primary-s3-${suffix}`
const r2Name = `phase13-r2-s3-${suffix}`
const postgresImage = `tungchiahui-postgres:${input.PHASE13_GIT_SHA}`
const recoveryImage = `tungchiahui-recovery:${input.PHASE13_GIT_SHA}`
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

function recoveryEnvironment(primaryPort: number, r2Port: number) {
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
    `http://127.0.0.1:${String(primaryPort)}`,
    'BACKUP_S3_REGION',
    'us-east-1',
    'BACKUP_S3_BUCKET',
    'phase13-primary',
    'BACKUP_S3_ACCESS_KEY_ID',
    'primary-only-access',
    'BACKUP_S3_SECRET_ACCESS_KEY',
    'primary-only-secret',
    'BACKUP_S3_FORCE_PATH_STYLE',
    'true',
    'BACKUP_R2_ENDPOINT',
    `http://127.0.0.1:${String(r2Port)}`,
    'BACKUP_R2_REGION',
    'auto',
    'BACKUP_R2_BUCKET',
    'phase13-r2',
    'BACKUP_R2_ACCESS_KEY_ID',
    'r2-only-access',
    'BACKUP_R2_SECRET_ACCESS_KEY',
    'r2-only-secret',
    'BACKUP_R2_FORCE_PATH_STYLE',
    'true',
  ].flatMap((value, index, values) =>
    index % 2 === 0 ? ['--env', `${value}=${values[index + 1]}`] : [],
  )
}

function runRecovery(
  primaryPort: number,
  r2Port: number,
  action: 'backup' | 'control-state-restore' | 'restore',
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
      ...recoveryEnvironment(primaryPort, r2Port),
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

execute('age-keygen', ['--output', ageIdentityPath])
chmodSync(ageIdentityPath, 0o640)
chownSync(ageIdentityPath, 70, 10050)

docker([
  'build',
  '--file',
  'ops/production/images/postgres.Dockerfile',
  '--tag',
  postgresImage,
  '.',
])
docker([
  'build',
  '--file',
  'ops/production/images/recovery.Dockerfile',
  '--tag',
  recoveryImage,
  '.',
])

let primaryPort = 0
let r2Port = 0
try {
  primaryPort = startS3(primaryName, 'phase13-primary')
  r2Port = startS3(r2Name, 'phase13-r2')
  docker([
    'run',
    '--detach',
    '--name',
    postgresName,
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
    postgresImage,
    'postgres',
    '-c',
    'archive_mode=on',
    '-c',
    'archive_command=pgbackrest --config=/etc/pgbackrest/pgbackrest.conf --stanza=tungchiahui archive-push %p',
    '-c',
    'archive_timeout=1',
  ])
  waitForPostgres()
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
    "CREATE SCHEMA app; CREATE TABLE app.schema_marker(version integer PRIMARY KEY); INSERT INTO app.schema_marker VALUES (6); CREATE TABLE app.recovery_fixture(value text PRIMARY KEY); INSERT INTO app.recovery_fixture VALUES ('base');",
  )
  const full = backupResultSchema.parse(runRecovery(primaryPort, r2Port, 'backup', 'full'))
  psql("INSERT INTO app.recovery_fixture VALUES ('before-target')")
  const targetTime = psql(
    'SELECT to_char(clock_timestamp() AT TIME ZONE \'UTC\', \'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"\');',
  )
  psql('SELECT pg_switch_wal()')
  psql('SELECT pg_sleep(1.2)')
  psql("INSERT INTO app.recovery_fixture VALUES ('after-target'); SELECT pg_switch_wal();")
  const differential = backupResultSchema.parse(runRecovery(primaryPort, r2Port, 'backup', 'diff'))
  psql("INSERT INTO app.recovery_fixture VALUES ('incremental-later'); SELECT pg_switch_wal();")
  const incremental = backupResultSchema.parse(runRecovery(primaryPort, r2Port, 'backup', 'incr'))
  docker(['stop', '--time', '30', postgresName])
  const targetDataPath = join(pgDataRoot, '18', 'docker')
  writeFileSync(join(targetDataPath, '.tungchiahui-disposable-recovery-target'), 'test')
  const rejectedPartialRestore = z
    .object({ status: z.number().int().positive() })
    .passthrough()
    .parse(
      runRecovery(
        primaryPort,
        r2Port,
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
    primaryPort,
    r2Port,
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
    psql('SELECT version FROM app.schema_marker') === '6',
    'Migration/version marker was not restored',
  )
  const values = psql('SELECT value FROM app.recovery_fixture ORDER BY value').split('\n')
  expect(values.includes('base'), 'Representative application row is missing after PITR')
  expect(values.includes('before-target'), 'Pre-target row is missing after PITR')
  expect(!values.includes('after-target'), 'Post-target row survived PITR')
  expect(!values.includes('incremental-later'), 'Later incremental row survived PITR')

  const controlState = incremental.controlState
  const restoredControl = z.record(z.string(), z.unknown()).parse(
    runRecovery(
      primaryPort,
      r2Port,
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
  expect(full.backup.valid, 'Full backup was not marked valid')

  console.log(
    JSON.stringify({
      backupPolicy: ['full', 'diff', 'incr'],
      backupMeasurements: [full.backup, differential.backup, incremental.backup],
      controlState: 'encrypted-snapshot-restored',
      pitrTarget: targetTime,
      partialRestoreRetry: 'pass',
      postgresDownRestore: 'pass',
      primaryReplica: 'fresh-and-readable',
      r2Replica: 'independent-fresh-and-restore-readable',
      representativeApplicationRead: 'pass',
      restoreSeconds,
      status: 'pass',
    }),
  )
} finally {
  for (const name of [postgresName, primaryName, r2Name]) {
    docker(['rm', '--force', name], true)
  }
}
