import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  chownSync,
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  renameSync,
  statSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'
import { z } from 'zod'
import { validateProductionEnvironmentContents } from '../../tools/production/initialize-secrets'
import {
  independentServices,
  type ProvisionRequest,
  provisionRequestSchema,
  topologyFiles,
} from './contracts'
import { bindPgBouncerImage, pgbouncerImagePlaceholder } from './pgbouncer-image'

const environmentSchema = z.record(z.string(), z.string())
const containerSchema = z
  .array(
    z.object({
      Id: z.string(),
      Config: z.object({
        Image: z.string(),
        Labels: z.record(z.string(), z.string()).nullable(),
        Env: z.array(z.string()).optional(),
      }),
      State: z.object({
        Running: z.boolean(),
        StartedAt: z.string(),
        Health: z.object({ Status: z.string() }).optional(),
      }),
    }),
  )
  .length(1)

const knownHostServices = new Set([
  ...independentServices,
  'database-migrate',
  'database-role-bootstrap',
  'postgres',
  'pgbouncer',
  'openresty',
  'web-blue',
  'web-green',
])
const knownHostActions = new Set([
  'config',
  'create',
  'exec',
  'up',
  'run',
  'pull',
  'inspect',
  'logs',
  'rm',
  'version',
  'enable',
  'disable',
  'is-active',
  'is-enabled',
  'daemon-reload',
  'restart',
  'start',
  'stop',
  'group',
])

/**
 * Produce a bounded diagnostic without reproducing child output, arbitrary
 * arguments, production environment values or secrets.
 */
export function describeHostActionFailure(
  command: 'docker' | 'systemctl' | 'getent' | 'groupadd',
  args: readonly string[],
  result: Readonly<{
    status: number | null
    stdout: string | null
    stderr: string | null
    timedOut?: boolean
  }>,
) {
  const action = args.find((arg) => knownHostActions.has(arg)) ?? 'unknown'
  const kind = command === 'docker' && args[0] === 'compose' ? 'docker compose' : command
  const services = [...new Set(args.filter((arg) => knownHostServices.has(arg)))]
  const output = [result.stderr ?? '', result.stdout ?? ''].join('\n')
  const category = result.timedOut
    ? 'timeout'
    : /unhealthy|healthcheck|health check|dependency failed/iu.test(output)
      ? 'healthcheck-or-dependency'
      : /permission denied|access denied|unauthorized|forbidden/iu.test(output)
        ? 'permission'
        : /no such file|not found|invalid mount|bind source path/iu.test(output)
          ? 'resource-or-mount'
          : /context canceled|context cancelled|timed out|timeout|connection refused|network is unreachable/iu.test(
                output,
              )
            ? 'network-or-timeout'
            : /conflict|already in use/iu.test(output)
              ? 'resource-conflict'
              : /exited with|exit code|exit status/iu.test(output)
                ? 'child-exit'
                : 'unclassified'
  const code = result.status === null ? 'unknown' : String(result.status)
  return [
    'Host action failed: ',
    kind,
    ' ',
    action,
    '; exit_code=',
    code,
    '; category=',
    category,
    services.length > 0 ? '; services=' + services.join(',') : '',
  ].join('')
}

// Never report a child environment or raw output: Compose and bootstrap see production secrets.
export function runHostCommand(
  command: 'docker' | 'systemctl' | 'getent' | 'groupadd',
  args: readonly string[],
  environment: Readonly<Record<string, string>> = {},
  allowFailure = false,
) {
  const executable = command === 'groupadd' ? '/usr/sbin/groupadd' : `/usr/bin/${command}`
  const result = spawnSync(executable, args, {
    encoding: 'utf8',
    env: { ...process.env, ...environment },
    maxBuffer: 16 * 1024 * 1024,
    timeout: 1_200_000,
  })
  if (result.error || (result.status !== 0 && !allowFailure))
    throw new Error(
      describeHostActionFailure(command, args, {
        status: result.status,
        stdout: result.stdout,
        stderr: result.stderr,
        timedOut: result.error?.message.includes('ETIMEDOUT') ?? false,
      }),
    )
  return { status: result.status ?? 1, stdout: result.stdout, stderr: result.stderr }
}

export function readHostEnvironment(request: Pick<ProvisionRequest, 'settings'>) {
  const file = join(request.settings.configRoot, '.env')
  const metadata = lstatSync(file)
  if (
    !metadata.isFile() ||
    metadata.uid !== 0 ||
    metadata.gid !== 0 ||
    (metadata.mode & 0o7777) !== 0o600
  )
    throw new Error('Production env must be a root:root regular file with mode 0600')
  const contents = readFileSync(file, 'utf8')
  validateProductionEnvironmentContents(contents)
  return environmentSchema.parse(parseEnv(contents))
}

function ensureDirectory(path: string, uid: number, gid: number, mode: number) {
  if (resolve(path) !== path) throw new Error('Host path is not canonical')
  if (!existsSync(path)) mkdirSync(path, { recursive: true, mode })
  if (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink())
    throw new Error('Host directory is not a regular directory')
  if (statSync(path).uid !== uid || statSync(path).gid !== gid) chownSync(path, uid, gid)
  if ((statSync(path).mode & 0o7777) !== mode) chmodSync(path, mode)
}

/**
 * Only rebind a service for atomically replaced config files.
 * Compose tracks changes to its own service definition without --force-recreate.
 */
export function requiresHostConfigRebind(
  service: 'pgbouncer' | 'openresty',
  rewrittenFiles: ReadonlySet<string>,
) {
  return rewrittenFiles.has(service === 'pgbouncer' ? 'pgbouncer.ini' : 'openresty.conf')
}

/**
 * An atomic config replacement changes the bound inode without changing the running process.
 * A process started at or before the file's modification time may still hold the prior config.
 */
export function containerConfigRebindRequired(startedAt: string, configModifiedAt: number) {
  const started = Date.parse(startedAt)
  return !Number.isFinite(started) || started <= configModifiedAt
}

function hostServiceConfigStale(
  settings: ProvisionRequest['settings'],
  service: 'pgbouncer' | 'openresty',
) {
  const container = inspectHostContainer(`${settings.projectName}-${service}-1`)
  if (!container) return true
  const files =
    service === 'pgbouncer'
      ? ['pgbouncer.ini', 'secrets/pgbouncer-userlist.txt']
      : ['openresty.conf']
  return files.some((file) =>
    containerConfigRebindRequired(
      container.startedAt,
      statSync(join(settings.configRoot, file)).mtimeMs,
    ),
  )
}

/** Read-only view of the topology services whose running process predates its config. */
export function hostTopologyConfigStale(settings: ProvisionRequest['settings']) {
  return {
    openresty: hostServiceConfigStale(settings, 'openresty'),
    pgbouncer: hostServiceConfigStale(settings, 'pgbouncer'),
  }
}

export function writeHostFile(
  path: string,
  contents: string | Buffer,
  uid: number,
  gid: number,
  mode: number,
) {
  if (existsSync(path)) {
    const metadata = lstatSync(path)
    if (!metadata.isFile() || metadata.isSymbolicLink())
      throw new Error('Host target is not a regular file')
    if (
      readFileSync(path).equals(Buffer.from(contents)) &&
      metadata.uid === uid &&
      metadata.gid === gid &&
      (metadata.mode & 0o777) === mode
    )
      return false
  }
  const temporary = join(dirname(path), `.release-${randomUUID()}`)
  const fdContents = Buffer.from(contents)
  writeFileSync(temporary, fdContents, { mode, flag: 'wx' })
  chownSync(temporary, uid, gid)
  chmodSync(temporary, mode)
  const fd = openSync(temporary, 'r')
  try {
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
  const directory = openSync(dirname(path), 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
  return true
}

export function composeHostEnvironment(request: ProvisionRequest) {
  const { settings, sha } = request
  return {
    TUNGCHIAHUI_CONFIG_ROOT: settings.configRoot,
    TUNGCHIAHUI_DATA_ROOT: settings.dataRoot,
    TUNGCHIAHUI_BLUE_CONTAINER_NAME: `${settings.projectName}-web-blue-1`,
    TUNGCHIAHUI_BLUE_DEPLOYMENT_SHA: sha,
    TUNGCHIAHUI_GREEN_CONTAINER_NAME: `${settings.projectName}-web-green-1`,
    TUNGCHIAHUI_GREEN_DEPLOYMENT_SHA: sha,
    TUNGCHIAHUI_MIGRATION_CONTAINER_NAME: `${settings.projectName}-database-migrate-1`,
    TUNGCHIAHUI_OPENRESTY_CONTAINER_NAME: `${settings.projectName}-openresty-1`,
    TUNGCHIAHUI_POSTGRES_CONTAINER_NAME: `${settings.projectName}-postgres-1`,
    TUNGCHIAHUI_DOCKER_SOCKET_GID: String(statSync('/var/run/docker.sock').gid),
    TUNGCHIAHUI_POSTGRES_IMAGE: request.postgresImage,
    TUNGCHIAHUI_RECOVERY_IMAGE: request.recoveryImage,
    TUNGCHIAHUI_SERVICE_IMAGE: request.serviceImage,
    TUNGCHIAHUI_WEB_BLUE_IMAGE: request.webImage,
    TUNGCHIAHUI_WEB_BLUE_DIGEST: request.webDigest,
    TUNGCHIAHUI_WEB_GREEN_DIGEST: request.webDigest,
    TUNGCHIAHUI_WEB_GREEN_IMAGE: request.webImage,
    TUNGCHIAHUI_SECRET_DIRECTORY: join(settings.configRoot, 'secrets'),
    TUNGCHIAHUI_DEPLOYMENT_POLLING_ENABLED:
      request.deploymentPollingEnabled === true ? 'true' : 'false',
  }
}

export function hostCompose(request: ProvisionRequest, args: readonly string[]) {
  return runHostCommand(
    'docker',
    [
      'compose',
      '--env-file',
      join(request.settings.configRoot, '.env'),
      '--project-name',
      request.settings.projectName,
      '--file',
      join(request.settings.configRoot, 'compose.yaml'),
      ...args,
    ],
    composeHostEnvironment(request),
  )
}

export function inspectHostContainer(name: string) {
  const result = runHostCommand('docker', ['inspect', name], {}, true)
  if (result.status !== 0) return undefined
  const parsed = containerSchema.parse(JSON.parse(result.stdout) as unknown)[0]
  if (!parsed) return undefined
  return {
    Id: parsed.Id,
    Config: { Image: parsed.Config.Image, Labels: parsed.Config.Labels },
    State: parsed.State,
    startedAt: parsed.State.StartedAt,
    deploymentPollingEnabled:
      parsed.Config.Env?.includes('DEPLOYMENT_POLLING_ENABLED=true') ?? false,
  }
}

function servicesChanged(request: ProvisionRequest, names: readonly string[], force = false) {
  const before = names.map((name) =>
    inspectHostContainer(`${request.settings.projectName}-${name}-1`),
  )
  hostCompose(request, [
    'up',
    '--detach',
    '--no-deps',
    '--wait',
    ...(force ? ['--force-recreate'] : []),
    ...names,
  ])
  return names.some(
    (name, i) =>
      !before[i]?.State.Running ||
      before[i]?.Id !== inspectHostContainer(`${request.settings.projectName}-${name}-1`)?.Id,
  )
}

export function schedulerUnit(project: string, kind: 'backup' | 'retention-cleanup') {
  const entrypoint = kind === 'backup' ? 'recovery-scheduler' : 'retention-scheduler'
  return `[Unit]\nDescription=Enqueue the audited Tungchiahui ${kind} operation\nRequires=docker.service\nAfter=docker.service\nStartLimitIntervalSec=600\nStartLimitBurst=40\n\n[Service]\nType=oneshot\nRestart=on-failure\nRestartSec=15\nExecStart=/usr/bin/docker exec ${project}-deploy-agent-1 node dist/${entrypoint}.cjs\nTimeoutStartSec=60\n`
}

export function schedulerTimer(kind: 'backup' | 'retention-cleanup') {
  const schedule = kind === 'backup' ? '*-*-* 03:05:00' : 'Sun *-*-* 06:30:00'
  return `[Unit]\nDescription=Run audited Tungchiahui ${kind}\n\n[Timer]\nOnCalendar=${schedule} Asia/Hong_Kong\nPersistent=true\nAccuracySec=1min\nRandomizedDelaySec=0\n\n[Install]\nWantedBy=timers.target\n`
}

export function provisionHost(input: ProvisionRequest) {
  const request = provisionRequestSchema.parse(input)
  if (process.getuid?.() !== 0)
    throw new Error('Host provisioning requires administrator permission on the server')
  const { settings } = request
  const environment = readHostEnvironment(request)
  const gid = settings.runtimeGroupGid
  let changed = 0
  if (runHostCommand('getent', ['group', String(gid)], {}, true).status !== 0)
    runHostCommand('groupadd', ['--gid', String(gid), '--system', 'tungchiahui-runtime'])
  for (const [path, uid, mode] of [
    [settings.configRoot, 0, 0o750],
    [settings.dataRoot, 0, 0o750],
    [join(settings.configRoot, 'secrets'), 0, 0o750],
    [join(settings.configRoot, 'deployment'), 70, 0o2770],
    [join(settings.configRoot, 'backup-hooks.d'), 0, 0o750],
    [join(settings.dataRoot, 'control-state'), 10002, 0o2770],
    [join(settings.dataRoot, 'postgres'), 70, 0o700],
    [join(settings.dataRoot, 'backup-repository'), 70, 0o750],
    [join(settings.dataRoot, 'backup-work'), 70, 0o750],
  ] as const)
    ensureDirectory(path, uid, path.endsWith('/postgres') ? 70 : gid, mode)
  const healthData = join(settings.dataRoot, 'health-data')
  ensureDirectory(healthData, existsSync(healthData) ? statSync(healthData).uid : 0, gid, 0o2750)
  for (const [key, name] of [
    ['BACKUP_AGE_IDENTITY_BASE64', 'backup-age-identity.txt'],
    ['PGBOUNCER_USERLIST_BASE64', 'pgbouncer-userlist.txt'],
  ] as const) {
    changed += Number(
      writeHostFile(
        join(settings.configRoot, 'secrets', name),
        Buffer.from(environment[key] ?? '', 'base64'),
        0,
        gid,
        0o640,
      ),
    )
  }
  const rewrittenTopology = new Set<string>()
  for (const file of topologyFiles) {
    const source = join(request.sourceRoot, 'ops/production', file)
    if (!lstatSync(source).isFile() || lstatSync(source).isSymbolicLink())
      throw new Error('Release topology source must be a regular file')
    let contents = readFileSync(source, 'utf8')
    if (file === 'compose.yaml' && contents.includes(pgbouncerImagePlaceholder)) {
      if (!request.pgbouncerImage)
        throw new Error('Source bootstrap requires a patched immutable PgBouncer image')
      contents = bindPgBouncerImage(contents, request.pgbouncerImage)
    }
    const rewritten = writeHostFile(join(settings.configRoot, file), contents, 0, gid, 0o640)
    changed += Number(rewritten)
    if (rewritten) rewrittenTopology.add(file)
  }
  const activeSlot = join(settings.configRoot, 'deployment', 'active-slot.conf')
  if (!existsSync(activeSlot))
    changed += Number(
      writeHostFile(
        activeSlot,
        readFileSync(join(request.sourceRoot, 'ops/production/active-slot.conf')),
        70,
        gid,
        0o660,
      ),
    )
  changed += Number(
    writeHostFile(
      join(settings.configRoot, 'backup-hooks.d/control-state.yml'),
      `version: 2\nowner_phase: 13\nsource: ${settings.dataRoot}/control-state/control.db\nconsistency: sqlite-wal-checkpoint-vacuum-snapshot\nencryption: age\nreplica: offsite-backup-s3\nrestore_validation: schema-integrity-audit-continuity\n`,
      0,
      gid,
      0o640,
    ),
  )
  hostCompose(request, ['config', '--quiet'])
  const fingerprint = createHash('sha256')
    .update(
      topologyFiles
        .map((file) =>
          createHash('sha256')
            .update(readFileSync(join(settings.configRoot, file)))
            .digest('hex'),
        )
        .join(':'),
    )
    .digest('hex')
  const fingerprintPath = join(settings.configRoot, 'openresty-topology.sha256')
  const fingerprintChanged =
    !existsSync(fingerprintPath) || readFileSync(fingerprintPath, 'utf8').trim() !== fingerprint
  // A restored file can equal the desired content while the running pool/proxy still holds the
  // config it loaded before that restore. Rebind only the service whose loaded config is stale.
  const rebindPgbouncer =
    requiresHostConfigRebind('pgbouncer', rewrittenTopology) ||
    hostServiceConfigStale(settings, 'pgbouncer')
  const rebindOpenresty =
    requiresHostConfigRebind('openresty', rewrittenTopology) ||
    hostServiceConfigStale(settings, 'openresty')
  const topologyChanged = fingerprintChanged || rebindPgbouncer || rebindOpenresty

  if (request.mode === 'bootstrap') {
    hostCompose(request, ['up', '--detach', '--wait', 'postgres', 'pgbouncer'])
    hostCompose(request, [
      'exec',
      '--no-TTY',
      'postgres',
      'pgbackrest',
      '--config=/etc/pgbackrest/pgbackrest.conf',
      '--stanza=tungchiahui',
      'stanza-create',
    ])
    hostCompose(request, [
      'exec',
      '--no-TTY',
      'postgres',
      'pgbackrest',
      '--config=/etc/pgbackrest/pgbackrest.conf',
      '--stanza=tungchiahui',
      'check',
    ])
    const roleMarker = join(settings.configRoot, 'database-role-bootstrap.complete')
    const roleFingerprint = `schema: 3\nproduction_env_sha256: ${createHash('sha256')
      .update(readFileSync(join(settings.configRoot, '.env')))
      .digest('hex')}\n`
    if (!existsSync(roleMarker) || readFileSync(roleMarker, 'utf8') !== roleFingerprint) {
      hostCompose(request, ['--profile', 'provision', 'run', '--rm', 'database-role-bootstrap'])
      changed += Number(writeHostFile(roleMarker, roleFingerprint, 0, gid, 0o640))
    }
  }
  if (request.mode !== 'configuration' && request.applyMigrations !== false) {
    hostCompose(request, [
      '--profile',
      'deployment',
      'create',
      '--force-recreate',
      'database-migrate',
    ])
    hostCompose(request, [
      '--profile',
      'deployment',
      'run',
      '--rm',
      '--no-deps',
      'database-migrate',
    ])
  }
  if (topologyChanged) {
    hostCompose(request, [
      'run',
      '--rm',
      '--no-deps',
      '--entrypoint',
      'openresty',
      'openresty',
      '-t',
    ])
    if (request.mode !== 'configuration')
      changed += Number(servicesChanged(request, ['pgbouncer'], rebindPgbouncer))
    // Recreate only when an atomic config replacement or a stale running config requires it.
    changed += Number(servicesChanged(request, ['openresty'], rebindOpenresty))
    changed += Number(writeHostFile(fingerprintPath, `${fingerprint}\n`, 0, gid, 0o640))
  }
  if (request.mode === 'bootstrap')
    changed += Number(servicesChanged(request, ['web-blue', 'web-green']))
  if (request.mode !== 'configuration')
    changed += Number(servicesChanged(request, independentServices))
  if (settings.manageSystemd) {
    let unitsChanged = false
    for (const kind of ['backup', 'retention-cleanup'] as const) {
      unitsChanged =
        writeHostFile(
          `/etc/systemd/system/tungchiahui-${kind}.service`,
          schedulerUnit(settings.projectName, kind),
          0,
          0,
          0o644,
        ) || unitsChanged
      unitsChanged =
        writeHostFile(
          `/etc/systemd/system/tungchiahui-${kind}.timer`,
          schedulerTimer(kind),
          0,
          0,
          0o644,
        ) || unitsChanged
    }
    if (unitsChanged) {
      runHostCommand('systemctl', ['daemon-reload'])
      changed += 1
    }
    for (const [kind, enabled] of [
      ['backup', request.backupScheduleEnabled],
      ['retention-cleanup', request.maintenanceScheduleEnabled],
    ] as const) {
      const unit = `tungchiahui-${kind}.timer`
      const wasEnabled = runHostCommand('systemctl', ['is-enabled', unit], {}, true).status === 0
      const wasActive = runHostCommand('systemctl', ['is-active', unit], {}, true).status === 0
      if (wasEnabled !== enabled || wasActive !== enabled) {
        runHostCommand('systemctl', [enabled ? 'enable' : 'disable', '--now', unit])
        changed += 1
      }
    }
  }
  return Object.freeze({ changed, status: 'converged' as const })
}
