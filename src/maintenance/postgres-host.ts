import { createHash } from 'node:crypto'
import {
  chmodSync,
  chownSync,
  closeSync,
  copyFileSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  readSync,
  rmSync,
  statfsSync,
} from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import {
  claimNextInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  getRecoveryBackup,
  heartbeatInfrastructureOperation,
  readDeploymentState,
  startInfrastructureOperation,
  updateInfrastructureOperationPhase,
} from '../control-plane/control-state'
import { pullHostImage } from '../host-release/artifacts'
import { type HostSettings, provisionRequestSchema } from '../host-release/contracts'
import { captureHostConvergence, hostControlPath } from '../host-release/coordinator'
import {
  hostCompose,
  inspectHostContainer,
  readHostEnvironment,
  runHostCommand,
  writeHostFile,
} from '../host-release/provision'
import { convergenceSnapshotSchema } from '../host-release/state'
import { safeErrorAttributes } from '../observability/telemetry'
import {
  type PostgresMaintenanceTarget,
  postgresMaintenanceTargetSchema,
} from './postgres-contracts'
import { executePostgresMaintenance, type PostgresMaintenancePlatform } from './postgres-engine'

const consumers = [
  'content-worker',
  'observability-agent',
  'web-blue',
  'web-green',
  'pgbouncer',
] as const
const timers = ['tungchiahui-backup.timer', 'tungchiahui-retention-cleanup.timer'] as const
const sha256 = (value: string | Buffer) => createHash('sha256').update(value).digest('hex')
const baselineSchema = z
  .object({
    host: convergenceSnapshotSchema,
    environmentSha256: z.string(),
    oldImageId: z.string(),
    newImageId: z.string(),
    containers: z.record(z.string(), z.object({ id: z.string(), running: z.boolean() })),
    timers: z.record(z.string(), z.object({ active: z.boolean(), enabled: z.boolean() })),
    backupManifestSha256: z.string(),
    deployment: z.record(z.string(), z.unknown()),
  })
  .strict()

function hashFile(path: string) {
  const hash = createHash('sha256'),
    buffer = Buffer.alloc(1024 * 1024)
  const fd = openSync(path, 'r')
  try {
    let length = readSync(fd, buffer)
    while (length > 0) {
      hash.update(buffer.subarray(0, length))
      length = readSync(fd, buffer)
    }
    return hash.digest('hex')
  } finally {
    closeSync(fd)
  }
}

function walkPostgresData(path: string): string[] {
  const stat = lstatSync(path)
  if (stat.isSymbolicLink() || (!stat.isFile() && !stat.isDirectory()))
    throw new Error('PostgreSQL maintenance requires regular local data files and directories')
  return stat.isDirectory()
    ? [
        path,
        ...readdirSync(path)
          .sort()
          .flatMap((name) => walkPostgresData(join(path, name))),
      ]
    : [path]
}

function syncPath(path: string) {
  const fd = openSync(path, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
}

const coldManifestSchema = z
  .array(
    z
      .object({
        path: z
          .string()
          .refine(
            (path) =>
              path === '' ||
              path.split('/').every((part) => part !== '' && part !== '.' && part !== '..'),
          ),
        type: z.enum(['directory', 'file']),
        uid: z.number().int().nonnegative(),
        gid: z.number().int().nonnegative(),
        mode: z.number().int().min(0).max(0o777),
        sha256: z
          .string()
          .regex(/^[a-f0-9]{64}$/)
          .nullable(),
      })
      .strict(),
  )
  .min(1)

function verifyColdEntries(data: string, manifest: z.infer<typeof coldManifestSchema>) {
  if (
    JSON.stringify(walkPostgresData(data).map((path) => path.slice(data.length + 1))) !==
    JSON.stringify(manifest.map((entry) => entry.path))
  )
    throw new Error('Cold data path verification failed')
  for (const entry of manifest) {
    const path = join(data, entry.path),
      stat = lstatSync(path)
    if (
      stat.uid !== entry.uid ||
      stat.gid !== entry.gid ||
      (stat.mode & 0o777) !== entry.mode ||
      stat.isDirectory() !== (entry.type === 'directory') ||
      (entry.type === 'file' && hashFile(path) !== entry.sha256)
    )
      throw new Error('Cold data read-back verification failed')
  }
}

export function verifyPostgresColdData(destination: string, expectedSha256: string) {
  const manifestJson = readFileSync(join(destination, 'manifest.json'), 'utf8')
  if (sha256(manifestJson) !== expectedSha256)
    throw new Error('Cold data manifest identity verification failed')
  const manifest = coldManifestSchema.parse(JSON.parse(manifestJson) as unknown)
  verifyColdEntries(join(destination, 'data'), manifest)
}

/** Cold copies are host-local recovery artifacts. They never replace a live data directory. */
export function copyPostgresColdData(source: string, destination: string) {
  if (existsSync(join(source, '18/docker/postmaster.pid')))
    throw new Error('Cold data copy requires PostgreSQL to be stopped')
  const entries = walkPostgresData(source)
  const manifest = coldManifestSchema.parse(
    entries.map((path) => {
      const stat = lstatSync(path)
      return {
        path: path.slice(source.length + 1),
        type: stat.isDirectory() ? 'directory' : 'file',
        uid: stat.uid,
        gid: stat.gid,
        mode: stat.mode & 0o777,
        sha256: stat.isDirectory() ? null : hashFile(path),
      }
    }),
  )
  const manifestJson = JSON.stringify(manifest),
    manifestHash = sha256(manifestJson)
  const marker = join(destination, 'manifest.json'),
    data = join(destination, 'data')
  if (existsSync(marker)) {
    if (readFileSync(marker, 'utf8') !== manifestJson)
      throw new Error('Cold data identity changed after the checkpoint')
  } else {
    // Only the operation-scoped incomplete cold copy can be replaced on retry.
    rmSync(destination, { recursive: true, force: true })
    mkdirSync(data, { recursive: true, mode: 0o700 })
    for (const entry of manifest) {
      const to = join(data, entry.path)
      if (entry.type === 'directory') mkdirSync(to, { recursive: true, mode: 0o700 })
      else copyFileSync(join(source, entry.path), to)
      chownSync(to, entry.uid, entry.gid)
      chmodSync(to, entry.mode)
      if (entry.type === 'file') syncPath(to)
    }
    for (const entry of [...manifest].reverse())
      if (entry.type === 'directory') syncPath(join(data, entry.path))
    syncPath(destination)
    syncPath(join(destination, '..'))
    syncPath(join(destination, '../..'))
  }
  verifyColdEntries(data, manifest)
  const owner = lstatSync(destination)
  writeHostFile(marker, manifestJson, owner.uid, owner.gid, 0o600)
  return manifestHash
}

export function runningPostgresMatchesDigest(
  current: ReturnType<typeof inspectHostContainer>,
  expectedImageId: string,
) {
  return (
    current?.State.Running === true &&
    current.imageId === expectedImageId &&
    current.State.Health?.Status === 'healthy'
  )
}

export class HostPostgresMaintenance implements PostgresMaintenancePlatform {
  private readonly environment: Record<string, string>
  private readonly path: string
  private readonly repository: string
  private readonly postgresName: string
  constructor(
    private readonly settings: HostSettings,
    private readonly operationId: string,
  ) {
    this.environment = readHostEnvironment({ settings })
    this.path = hostControlPath(settings)
    this.repository = `${z
      .string()
      .regex(/^[a-z0-9.-]+(?::[0-9]{2,5})?\/[a-z0-9._/-]+$/)
      .parse(this.environment.TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY)}-postgres`
    this.postgresName = `${settings.projectName}-postgres-1`
  }
  private run(...args: Parameters<typeof runHostCommand>) {
    if (!this.lease) throw new Error('Maintenance execution lease is missing')
    heartbeatInfrastructureOperation(this.path, this.operationId, this.lease, 3600)
    return runHostCommand(...args)
  }
  private image(digest: string) {
    return `${this.repository}@${digest}`
  }
  private sql(sql: string) {
    return this.run('docker', [
      'exec',
      this.postgresName,
      'psql',
      '--no-psqlrc',
      '--set',
      'ON_ERROR_STOP=1',
      '--username',
      z.string().min(1).parse(this.environment.POSTGRES_USER),
      '--dbname',
      z.string().min(1).parse(this.environment.POSTGRES_DB),
      '--tuples-only',
      '--no-align',
      '--quiet',
      '--command',
      `SET statement_timeout='60s'; ${sql}`,
    ]).stdout.trim()
  }
  protected recovery(mode: 'verify' | 'backup', identity: string) {
    const lease = z.object({ leaseOwner: z.string(), fencingToken: z.number() }).parse(this.lease)
    const name = `${this.settings.projectName}-postgres-maintenance-${this.operationId}`
    this.run('docker', ['rm', '--force', name], {}, true)
    try {
      const output = this.compose([
        'run',
        '--rm',
        '--no-deps',
        '--name',
        name,
        'deploy-agent',
        'node',
        'dist/postgres-maintenance-recovery.cjs',
        mode,
        identity,
        this.operationId,
        lease.leaseOwner,
        String(lease.fencingToken),
      ]).stdout
      return z.record(z.string(), z.unknown()).parse(JSON.parse(output.trim()) as unknown)
    } finally {
      // Fencing prevents a stale child from deleting its successor's recovery job.
      this.run('docker', ['rm', '--force', name], {}, true)
    }
  }

  lease: Readonly<{ leaseOwner: string; fencingToken: number }> | undefined
  private imageIdentity(reference: string) {
    const result = this.run('docker', ['image', 'inspect', reference])
    const entry = z
      .array(
        z.object({
          Id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          RepoDigests: z.array(z.string()),
          Config: z.object({ Labels: z.record(z.string(), z.string()).nullable() }),
        }),
      )
      .length(1)
      .parse(JSON.parse(result.stdout) as unknown)[0]
    if (!entry?.RepoDigests.includes(reference))
      throw new Error('Exact registry image identity is unavailable')
    return entry
  }
  async prepare(target: PostgresMaintenanceTarget) {
    for (const reference of [this.image(target.oldDigest), this.image(target.newDigest)]) {
      if (this.run('docker', ['image', 'inspect', reference], {}, true).status !== 0)
        await pullHostImage(this.repository, reference.split('@')[1] ?? '', this.environment)
    }
    const old = this.imageIdentity(this.image(target.oldDigest))
    const candidate = this.imageIdentity(this.image(target.newDigest))
    if (candidate.Config.Labels?.['org.opencontainers.image.revision'] !== target.candidateSha)
      throw new Error('Candidate OCI revision differs from the approved source SHA')
    const current = inspectHostContainer(this.postgresName)
    if (!runningPostgresMatchesDigest(current, old.Id))
      throw new Error('Running PostgreSQL differs from the exact healthy old image')
    for (const reference of [this.image(target.oldDigest), this.image(target.newDigest)]) {
      for (const [command, version] of [
        ['postgres', '18.4'],
        ['pgbackrest', '2.59.1'],
      ] as const) {
        const result = this.run('docker', [
          'run',
          '--rm',
          '--network',
          'none',
          '--read-only',
          '--user',
          '70:70',
          '--cap-drop',
          'ALL',
          '--security-opt',
          'no-new-privileges:true',
          '--entrypoint',
          command,
          reference,
          '--version',
        ]).stdout.trim()
        if (!new RegExp(`\\b${version.replaceAll('.', '\\.')}\\b`, 'u').test(result))
          throw new Error(
            'Maintenance is limited to the rehearsed PostgreSQL and pgBackRest versions',
          )
      }
    }
    const sharedir = this.run('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--user',
      '70:70',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--entrypoint',
      'pg_config',
      this.image(target.newDigest),
      '--sharedir',
    ]).stdout.trim()
    const extension = this.run('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--user',
      '70:70',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--entrypoint',
      'cat',
      this.image(target.newDigest),
      `${z
        .string()
        .regex(/^\/[a-zA-Z0-9/_-]+$/)
        .parse(sharedir)}/extension/pgroonga.control`,
    ]).stdout
    if (!/^default_version\s*=\s*'4\.0\.8'\s*$/mu.test(extension))
      throw new Error('Candidate PGroonga extension differs from the rehearsed version')
    this.verifyTopology(this.image(target.oldDigest))
    this.verifyDatabase()
    const backup = getRecoveryBackup(this.path, target.backupId)
    const maxAge = z.coerce
      .number()
      .int()
      .positive()
      .parse(this.environment.TUNGCHIAHUI_DEPLOYMENT_BACKUP_MAX_AGE_SECONDS)
    if (
      !backup?.valid ||
      backup.backupType !== 'full' ||
      Date.now() - Date.parse(backup.completedAt) > maxAge * 1000 ||
      Date.parse(backup.completedAt) > Date.now()
    )
      throw new Error('Fresh full backup evidence is required')
    this.recovery('verify', target.backupId)
    const files = walkPostgresData(join(this.settings.dataRoot, 'postgres'))
    const size = files.reduce((total, file) => total + lstatSync(file).size, 0)
    const space = statfsSync(this.settings.dataRoot)
    if (space.bavail * space.bsize < size * 2 + 1024 ** 3)
      throw new Error('Insufficient headroom for the cold copy and PostgreSQL maintenance')
    const host = captureHostConvergence(this.settings)
    if (host.deploymentPollingEnabled) throw new Error('Host-supervised deployment is required')
    const containers = Object.fromEntries(
      consumers.map((service) => {
        const container = inspectHostContainer(`${this.settings.projectName}-${service}-1`)
        if (!container) throw new Error('Required database consumer container is missing')
        return [service, { id: container.Id, running: container.State.Running }]
      }),
    )
    let timerState = Object.fromEntries(
      timers.map((unit) => [
        unit,
        {
          active:
            this.settings.manageSystemd &&
            this.run('systemctl', ['is-active', unit], {}, true).status === 0,
          enabled:
            this.settings.manageSystemd &&
            this.run('systemctl', ['is-enabled', unit], {}, true).status === 0,
        },
      ]),
    )
    if (existsSync(this.marker())) {
      const previousId = readFileSync(this.marker(), 'utf8')
      const held = getInfrastructureOperation(this.path, previousId)
      if (held?.status !== 'failed' || held.phase !== 'postgres-image-recovery-required')
        throw new Error('An unresolved maintenance marker requires its audited restore handoff')
      const inherited = baselineSchema.parse(held.result?.baseline)
      for (const service of consumers) {
        const actual = containers[service]
        if (actual) actual.running = inherited.containers[service]?.running ?? false
      }
      timerState = inherited.timers
    }
    return baselineSchema.parse({
      host,
      deployment: readDeploymentState(this.path),
      containers,
      timers: timerState,
      environmentSha256: sha256(readFileSync(join(this.settings.configRoot, '.env'))),
      oldImageId: old.Id,
      newImageId: candidate.Id,
      backupManifestSha256: backup.manifestSha256,
    })
  }
  private verifyTopology(image: string) {
    const rendered = z
      .object({
        services: z.object({
          postgres: z.object({
            image: z.literal(image),
            user: z.literal('70:70'),
            read_only: z.literal(true),
            cap_drop: z.array(z.string()).refine((caps) => caps.includes('ALL')),
            security_opt: z
              .array(z.string())
              .refine((options) => options.includes('no-new-privileges:true')),
            volumes: z.array(
              z.object({
                type: z.enum(['bind', 'volume']),
                source: z.string(),
                target: z.string(),
                read_only: z.boolean().optional(),
              }),
            ),
            networks: z
              .record(z.string(), z.unknown())
              .refine((networks) => Object.keys(networks).join() === 'database'),
          }),
        }),
      })
      .parse(JSON.parse(this.compose(['config', '--format', 'json'], image).stdout) as unknown)
      .services.postgres
    const actual = z
      .array(
        z.object({
          Mounts: z.array(
            z.object({
              Type: z.string(),
              Source: z.string(),
              Destination: z.string(),
              RW: z.boolean(),
            }),
          ),
          HostConfig: z.object({
            ReadonlyRootfs: z.literal(true),
            CapDrop: z.array(z.string()).refine((caps) => caps.includes('ALL')),
          }),
        }),
      )
      .length(1)
      .parse(JSON.parse(this.run('docker', ['inspect', this.postgresName]).stdout) as unknown)[0]
    if (!actual) throw new Error('Current PostgreSQL topology is unavailable')
    const required = [
      {
        source: join(this.settings.dataRoot, 'postgres'),
        target: '/var/lib/postgresql',
        readOnly: false,
      },
      {
        source: join(this.settings.dataRoot, 'backup-repository'),
        target: '/var/lib/pgbackrest',
        readOnly: false,
      },
      {
        source: join(this.settings.configRoot, 'pgbackrest.conf'),
        target: '/etc/pgbackrest/pgbackrest.conf',
        readOnly: true,
      },
    ]
    if (rendered.volumes.length !== 4 || actual.Mounts.length !== 4)
      throw new Error('Unexpected PostgreSQL mount topology')
    for (const mount of required) {
      if (
        !rendered.volumes.some(
          (volume) =>
            volume.type === 'bind' &&
            volume.source === mount.source &&
            volume.target === mount.target &&
            Boolean(volume.read_only) === mount.readOnly,
        ) ||
        !actual.Mounts.some(
          (volume) =>
            volume.Type === 'bind' &&
            volume.Source === mount.source &&
            volume.Destination === mount.target &&
            volume.RW !== mount.readOnly,
        )
      )
        throw new Error('Database maintenance would change a retained data or configuration mount')
    }
    if (
      !rendered.volumes.some(
        (volume) => volume.type === 'volume' && volume.target === '/run/postgresql',
      ) ||
      !actual.Mounts.some(
        (volume) =>
          volume.Type === 'volume' && volume.Destination === '/run/postgresql' && volume.RW,
      )
    )
      throw new Error('Database socket volume is not retained')
  }
  private assertBaseline(input: Readonly<Record<string, unknown>>) {
    const baseline = baselineSchema.parse(input)
    if (
      sha256(readFileSync(join(this.settings.configRoot, '.env'))) !== baseline.environmentSha256 ||
      JSON.stringify(readDeploymentState(this.path)) !== JSON.stringify(baseline.deployment)
    )
      throw new Error('Host configuration or retained Web deployment changed during maintenance')
    for (const [file, contents] of Object.entries(baseline.host.files))
      if (readFileSync(join(this.settings.configRoot, file), 'utf8') !== contents)
        throw new Error('Reviewed Compose or proxy topology changed during maintenance')
    return baseline
  }
  private marker() {
    return join(this.settings.configRoot, 'deployment/postgres-maintenance')
  }
  async quiesce(input: Readonly<Record<string, unknown>>) {
    const baseline = this.assertBaseline(input)
    writeHostFile(this.marker(), this.operationId, 70, 10050, 0o640)
    if (this.settings.manageSystemd)
      for (const unit of timers) this.run('systemctl', ['stop', unit])
    for (const service of consumers) {
      const current = inspectHostContainer(`${this.settings.projectName}-${service}-1`)
      if (!current || current.Id !== baseline.containers[service]?.id)
        throw new Error('Database consumer identity changed during maintenance')
      if (current.State.Running) this.run('docker', ['stop', '--time', '60', current.Id])
    }
  }
  async drain() {
    const deadline = Date.now() + 60_000
    while (
      Number(
        this.sql(
          `SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND pid<>pg_backend_pid() AND (backend_type IN ('client backend','walsender') OR xact_start IS NOT NULL);`,
        ),
      ) > 0
    ) {
      if (Date.now() >= deadline) throw new Error('Database transactions did not drain')
      await delay(500)
    }
    if (this.sql('SELECT count(*) FROM pg_prepared_xacts;') !== '0')
      throw new Error('Prepared transactions block maintenance')
    this.verifyDatabase()
    return this.fingerprint()
  }
  private fingerprint() {
    const tables = z.array(z.object({ schema: z.string(), name: z.string() })).parse(
      JSON.parse(
        this.sql(`
      SELECT coalesce(json_agg(json_build_object('schema',schemaname,'name',tablename) ORDER BY schemaname,tablename),'[]'::json)
      FROM pg_tables WHERE schemaname IN ('app','health','account_auth','owner_auth','drizzle');`),
      ) as unknown,
    )
    const hash = createHash('sha256')
    for (const table of tables) {
      const relation = [table.schema, table.name]
        .map((part) => `"${part.replaceAll('"', '""')}"`)
        .join('.')
      hash
        .update(relation)
        .update(
          this.sql(
            `SELECT md5(coalesce(jsonb_agg(to_jsonb(r) ORDER BY to_jsonb(r)::text)::text,'[]')) FROM ${relation} r;`,
          ),
        )
    }
    const catalog = this.sql(`SELECT md5(jsonb_build_object(
      'roles',(SELECT jsonb_agg(jsonb_build_array(rolname,rolsuper,rolinherit,rolcreaterole,rolcreatedb,rolcanlogin,rolreplication,rolbypassrls) ORDER BY rolname) FROM pg_roles),
      'membership',(SELECT jsonb_agg(to_jsonb(m) ORDER BY to_jsonb(m)::text) FROM pg_auth_members m),
      'relations',(SELECT jsonb_agg(jsonb_build_array(n.nspname,c.relname,c.relacl,c.relrowsecurity,c.relforcerowsecurity) ORDER BY n.nspname,c.relname) FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname IN ('app','health','account_auth','owner_auth','drizzle')),
      'policies',(SELECT jsonb_agg(to_jsonb(p) ORDER BY to_jsonb(p)::text) FROM pg_policies p),
      'extensions',(SELECT jsonb_agg(jsonb_build_array(extname,extversion) ORDER BY extname) FROM pg_extension)
    )::text);`)
    return { tablesSha256: hash.digest('hex'), catalogMd5: catalog }
  }
  private verifyDatabase() {
    if (
      this.sql(
        "SELECT current_setting('server_version_num')::integer = 180004 AND NOT pg_is_in_recovery() AND (SELECT extversion='4.0.8' FROM pg_extension WHERE extname='pgroonga');",
      ) !== 't'
    )
      throw new Error('Database binary or extension version differs from rehearsal')
    if (
      this.sql(
        'SELECT count(*) FROM pg_collation WHERE collversion IS NOT NULL AND collversion IS DISTINCT FROM pg_collation_actual_version(oid);',
      ) !== '0'
    )
      throw new Error('Collation version mismatch requires separate index maintenance')
    if (
      this.sql("SELECT has_table_privilege('site_app','app.body_measurements','SELECT');") !== 'f'
    )
      throw new Error('Private health role boundary failed')
    if (
      this.sql(
        "SET ROLE site_app; SELECT count(*) FROM app.owner_managed_datasets WHERE dataset_key='weight_loss'; RESET ROLE;",
      ) !== '0' ||
      this.sql(
        "SELECT bool_and(has_table_privilege('site_control_api','app.body_measurements',privilege)) FROM unnest(ARRAY['SELECT','INSERT','UPDATE','DELETE']) privilege;",
      ) !== 't'
    )
      throw new Error('Owner and public role read/write boundaries failed')

    const query = z
      .string()
      .min(1)
      .max(200)
      .parse(this.environment.TUNGCHIAHUI_DEPLOYMENT_SEARCH_QUERY)
      .replaceAll("'", "''")
    for (const locale of ['zh-cn', 'zh-hk', 'zh-tw', 'en-us']) {
      const search = `SELECT count(*) FROM app.search_documents WHERE locale='${locale}' AND ARRAY[title,headings,body,metadata] &@ ('${query}',ARRAY[16,8,2,4],'search_documents_full_text_idx')::pgroonga_full_text_search_condition`
      const prefix = 'SET search_path TO app,public; SET enable_seqscan=off; '
      if (
        Number(this.sql(prefix + search)) < 1 ||
        !this.sql(`${prefix}EXPLAIN ${search}`).includes('search_documents_full_text_idx')
      )
        throw new Error('Four-locale index-backed search verification failed')
    }
  }
  async stop() {
    this.run('docker', ['stop', '--time', '120', this.postgresName])
    const current = inspectHostContainer(this.postgresName)
    if (
      !current ||
      current.State.Running ||
      existsSync(join(this.settings.dataRoot, 'postgres/18/docker/postmaster.pid'))
    )
      throw new Error('PostgreSQL did not stop cleanly')
    const control = this.run('docker', [
      'run',
      '--rm',
      '--network',
      'none',
      '--read-only',
      '--user',
      '70:70',
      '--cap-drop',
      'ALL',
      '--security-opt',
      'no-new-privileges:true',
      '--mount',
      `type=bind,source=${this.settings.dataRoot}/postgres,target=/var/lib/postgresql,readonly`,
      '--entrypoint',
      'pg_controldata',
      current.Config.Image,
      '/var/lib/postgresql/18/docker',
    ]).stdout
    if (!/Database cluster state:\s+shut down\s*$/mu.test(control))
      throw new Error('PostgreSQL control data does not confirm clean shutdown')
  }
  async coldCopy(operationId: string) {
    return copyPostgresColdData(
      join(this.settings.dataRoot, 'postgres'),
      join(this.settings.dataRoot, 'postgres-maintenance', operationId),
    )
  }
  async verifyColdCopy(operationId: string, expectedSha256: string) {
    verifyPostgresColdData(
      join(this.settings.dataRoot, 'postgres-maintenance', operationId),
      expectedSha256,
    )
  }
  async start(digest: string) {
    const progress = getInfrastructureOperation(this.path, this.operationId)?.result
    this.assertBaseline(z.record(z.string(), z.unknown()).parse(progress?.baseline))
    this.compose(['config', '--quiet'], this.image(digest))
    this.compose(['up', '--detach', '--no-deps', '--wait', 'postgres'], this.image(digest))
  }
  private compose(args: readonly string[], postgresImage?: string) {
    if (!this.lease) throw new Error('Maintenance execution lease is missing')
    heartbeatInfrastructureOperation(this.path, this.operationId, this.lease, 3600)
    const host = captureHostConvergence(this.settings)
    const request = provisionRequestSchema.parse({
      settings: this.settings,
      sourceRoot: this.settings.configRoot,
      sha: host.sha,
      webImage: host.webImage,
      webDigest: host.webDigest,
      serviceImage: host.serviceImage,
      recoveryImage: host.recoveryImage,
      postgresImage: postgresImage ?? host.postgresImage,
      mode: 'configuration',
    })
    return hostCompose(request, args)
  }
  async verify(digest: string, database: Readonly<Record<string, unknown>>) {
    const actual = inspectHostContainer(this.postgresName)
    if (
      !actual?.State.Running ||
      actual.Config.Image !== this.image(digest) ||
      actual.imageId !== this.imageIdentity(this.image(digest)).Id ||
      actual.State.Health?.Status !== 'healthy'
    )
      throw new Error('PostgreSQL running image verification failed')
    this.verifyDatabase()
    if (JSON.stringify(this.fingerprint()) !== JSON.stringify(database))
      throw new Error('Database rows, migration ledger or permissions changed during maintenance')
    this.sql(`BEGIN; CREATE TEMP TABLE postgres_maintenance_probe(value text);
      INSERT INTO postgres_maintenance_probe VALUES ('${this.operationId}');
      DO $probe$ BEGIN IF (SELECT value FROM postgres_maintenance_probe)<>'${this.operationId}' THEN
        RAISE EXCEPTION 'Maintenance write/read-back failed'; END IF; END $probe$; ROLLBACK;`)
    const restorePointLsn = this.sql(
      `SELECT pg_create_restore_point('postgres-image-${this.operationId}');`,
    )
    if (!/^[A-F0-9]+\/[A-F0-9]+$/u.test(restorePointLsn))
      throw new Error('Maintenance WAL write verification failed')
    // amcheck may be absent on an existing host. A rolled-back extension transaction
    // checks supported relations without leaving a new production catalog dependency.
    this.sql(`BEGIN; CREATE EXTENSION IF NOT EXISTS amcheck WITH SCHEMA public;
      DO $check$ DECLARE item record; BEGIN
        FOR item IN SELECT c.oid FROM pg_class c JOIN pg_am a ON a.oid=c.relam
          WHERE a.amname='heap' AND c.relkind IN ('r','m','t') AND c.relpersistence<>'t' LOOP
          IF EXISTS(SELECT 1 FROM public.verify_heapam(item.oid,true,true)) THEN
            RAISE EXCEPTION 'Heap integrity verification failed';
          END IF;
        END LOOP;
        FOR item IN SELECT c.oid FROM pg_index i JOIN pg_class c ON c.oid=i.indexrelid
          JOIN pg_am a ON a.oid=c.relam WHERE a.amname='btree' AND c.relkind='i'
          AND c.relpersistence<>'t' AND i.indisvalid AND i.indisready LOOP
          PERFORM public.bt_index_check(item.oid,true,true);
        END LOOP;
      END $check$; ROLLBACK;`)
    if (!this.lease) throw new Error('Maintenance execution lease is missing')
    const operation = getInfrastructureOperation(this.path, this.operationId)
    updateInfrastructureOperationPhase(
      this.path,
      this.operationId,
      this.lease,
      operation?.phase ?? 'database-verification',
      {
        verifiedPostgresDigest: digest,
        imageId: actual.imageId,
        restorePointLsn,
        integrity: 'amcheck-heaps-and-btree',
        search: 'four-locale-index-backed',
      },
    )
  }
  async backup(operationId: string) {
    return this.recovery('backup', operationId)
  }
  async resume(input: Readonly<Record<string, unknown>>) {
    const baseline = this.assertBaseline(input)
    for (const service of ['pgbouncer', 'web-blue', 'web-green']) {
      const before = baseline.containers[service]
      if (before?.running)
        this.run('docker', ['start', `${this.settings.projectName}-${service}-1`])
    }
    const runtime = readDeploymentState(this.path)
    if (
      runtime.currentSha !== baseline.host.sha ||
      runtime.currentDigest !== baseline.host.webDigest
    )
      throw new Error('Web deployment identity changed during PostgreSQL maintenance')
    const active = `${this.settings.projectName}-web-${runtime.activeSlot}-1`
    this.run('docker', [
      'exec',
      active,
      'node',
      '-e',
      `async function verifyReadiness() {
        for (let attempt = 0; attempt < 60; attempt += 1) {
          try {
            for (const path of ['/api/health', '/api/ready']) {
              const response = await fetch('http://127.0.0.1:3000' + path)
              if (!response.ok) throw new Error('Readiness check failed')
            }
            return
          } catch {
            await new Promise((resolveDelay) => setTimeout(resolveDelay, 1000))
          }
        }
        process.exit(1)
      }
      void verifyReadiness()`,
    ])
    for (const service of ['observability-agent', 'content-worker'])
      if (baseline.containers[service]?.running)
        this.run('docker', ['start', `${this.settings.projectName}-${service}-1`])
    if (this.settings.manageSystemd)
      for (const unit of timers)
        if (baseline.timers[unit]?.active) this.run('systemctl', ['start', unit])
    if (existsSync(this.marker())) {
      if (readFileSync(this.marker(), 'utf8') !== this.operationId)
        throw new Error('Maintenance marker ownership changed')
      rmSync(this.marker())
      syncPath(join(this.settings.configRoot, 'deployment'))
    }
  }
}

export async function coordinateNextPostgresMaintenance(settings: HostSettings, owner: string) {
  const path = hostControlPath(settings)
  const claimed = claimNextInfrastructureOperation(
    path,
    owner,
    3600,
    new Date(),
    ['server-migration'],
    'postgres-image-upgrade',
  )
  if (!claimed) return false
  const lease = { leaseOwner: owner, fencingToken: claimed.fencingToken }
  const operation = startInfrastructureOperation(path, claimed.id, lease)
  try {
    postgresMaintenanceTargetSchema.parse(operation.target)
    const platform = new HostPostgresMaintenance(settings, operation.id)
    platform.lease = lease
    await executePostgresMaintenance(path, operation, lease, platform)
  } catch (error: unknown) {
    heartbeatInfrastructureOperation(path, operation.id, lease, 3600)
    const current = getInfrastructureOperation(path, operation.id)
    if (current?.status !== 'running') throw error
    updateInfrastructureOperationPhase(
      path,
      operation.id,
      lease,
      'maintenance-initialization-failed',
      { failure: safeErrorAttributes(error) },
    )
    finishInfrastructureOperation(path, operation.id, lease, {
      status: current.result ? 'needs-attention' : 'failed',
      phase: current.result ? 'postgres-image-recovery-required' : 'postgres-image-rejected',
      result: current.result ? { ...current.result, phase: 'recovery-required' } : null,
      errorSummary: 'Host maintenance initialization failed. Inspect the fenced diagnostic audit.',
    })
  }
  return true
}
