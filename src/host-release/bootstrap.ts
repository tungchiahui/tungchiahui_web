import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs'
import { join } from 'node:path'
import {
  appendControlAuditEvent,
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  heartbeatInfrastructureOperation,
  initializeControlState,
  listInfrastructureOperations,
  reconcileInfrastructureOperations,
  startInfrastructureOperation,
} from '../control-plane/control-state'
import { extractHostGeneration, hostGenerationDirectory, resolveHostRelease } from './artifacts'
import {
  type HostSettings,
  hostSettingsSchema,
  releaseDigestSchema,
  releaseShaSchema,
} from './contracts'
import {
  captureHostConvergence,
  hostControlPath,
  probeHostGeneration,
  releaseProvisionRequest,
  restoreHostConvergence,
} from './coordinator'
import { provisionHost, readHostEnvironment, runHostCommand, writeHostFile } from './provision'
import {
  checkpointHostRelease,
  commitHostGeneration,
  initializeHostReleaseState,
  readHostCheckpoint,
  readHostExecutorStatus,
  recordHostBootstrapBaseline,
  requeueHostBootstrap,
  restoreHostGeneration,
  stageHostGeneration,
} from './state'

// This minimal supervisor is the server's installed bootstrap protocol. All deployment work
// runs from the SHA-bound generation selected in recovery state; it is replaced on each release.
export function hostExecutorUnit(settings: HostSettings, installedDirectory: string) {
  return `[Unit]\nDescription=Tungchiahui server release supervisor\nRequires=docker.service\nAfter=docker.service\n\n[Service]\nType=simple\nUser=root\nGroup=root\nUMask=0077\nExecStart=${installedDirectory}/node ${installedDirectory}/release-supervisor.cjs ${settings.configRoot}/host-runtime/settings.json\nRestart=on-failure\nRestartSec=5\nTimeoutStopSec=45\nKillMode=control-group\nNoNewPrivileges=true\nPrivateTmp=true\nProtectHome=true\nProtectSystem=full\nReadWritePaths=${settings.configRoot} ${settings.dataRoot} /etc/systemd/system\nRestrictAddressFamilies=AF_UNIX AF_INET AF_INET6\n\n[Install]\nWantedBy=multi-user.target\n`
}

export async function activateHostExecutor(
  input: HostSettings,
  shaInput: string,
  digestInput: string,
) {
  if (process.getuid?.() !== 0)
    throw new Error('Run the one-time activation as administrator on the production server')
  process.umask(0o007)
  const settings = hostSettingsSchema.parse(input)
  const sha = releaseShaSchema.parse(shaInput)
  const digest = releaseDigestSchema.parse(digestInput)
  for (const command of [
    ['docker', ['compose', 'version']],
    ['systemctl', ['--version']],
  ] as const)
    runHostCommand(command[0], command[1])
  const path = hostControlPath(settings)
  initializeControlState(path, 'production')
  initializeHostReleaseState(path)
  reconcileInfrastructureOperations(path)
  const environment = readHostEnvironment({ settings })
  const repository = environment.TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY
  if (!repository) throw new Error('Canonical production image repository is required')
  const actor = {
    id: 'server-console:bootstrap',
    kind: 'operator' as const,
    capabilities: [
      'infrastructure-operation:create' as const,
      'infrastructure-operation:read' as const,
    ],
  }
  const request = {
    operationType: 'server-migration' as const,
    reason: 'Activate the server release executor',
    target: { action: 'provision-only' as const, inventoryHost: 'ddns.tungchiahui.cn' },
  }
  const key = `host-bootstrap:${sha}:${digest}`
  let created = createInfrastructureOperation(path, request, actor, key).operation
  if (created.status === 'completed' || created.status === 'failed')
    created = createInfrastructureOperation(
      path,
      request,
      actor,
      `${key}:${randomUUID()}`,
    ).operation
  if (created.status === 'needs-attention') requeueHostBootstrap(path, created.id)
  if (listInfrastructureOperations(path, { statuses: ['claimed', 'running'] }).length > 0)
    throw new Error('Wait for the active infrastructure operation before server activation')
  const owner = `deploy-agent:bootstrap:${randomUUID()}`
  const claimed = claimNextInfrastructureOperation(path, owner, 3600, new Date(), [
    'server-migration',
  ])
  if (!claimed || claimed.id !== created.id)
    throw new Error('Exclusive bootstrap operation could not be claimed')
  const lease = { leaseOwner: owner, fencingToken: claimed.fencingToken }
  startInfrastructureOperation(path, claimed.id, lease)
  const previousUnit = '/etc/systemd/system/tungchiahui-host-release.service'
  const oldUnit = existsSync(previousUnit) ? readFileSync(previousUnit) : null
  const oldUnitActive =
    runHostCommand('systemctl', ['is-active', 'tungchiahui-host-release.service'], {}, true)
      .status === 0
  let checkpoint = readHostCheckpoint(path, claimed.id)
  try {
    const release = await resolveHostRelease(repository, sha, digest, environment)
    extractHostGeneration(settings, repository, release)
    probeHostGeneration(settings, sha)
    const before = checkpoint?.before ?? captureHostConvergence(settings)
    checkpointHostRelease(path, claimed.id, lease, release, before, 'prepared')
    recordHostBootstrapBaseline(path, before, claimed.id, lease)
    checkpoint = readHostCheckpoint(path, claimed.id)
    heartbeatInfrastructureOperation(path, claimed.id, lease, 3600)
    provisionHost(releaseProvisionRequest(settings, repository, release, before))
    checkpointHostRelease(path, claimed.id, lease, release, before, 'services-verified')
    stageHostGeneration(path, release)
    commitHostGeneration(path, sha)
    const installedDirectory = hostGenerationDirectory(settings, sha)
    mkdirSync(join(settings.configRoot, 'host-runtime'), { recursive: true, mode: 0o700 })
    writeHostFile(
      join(settings.configRoot, 'host-runtime/settings.json'),
      `${JSON.stringify(settings)}\n`,
      0,
      0,
      0o600,
    )
    const changed = writeHostFile(
      previousUnit,
      hostExecutorUnit(settings, installedDirectory),
      0,
      0,
      0o644,
    )
    if (changed) runHostCommand('systemctl', ['daemon-reload'])
    runHostCommand('systemctl', ['enable', '--now', 'tungchiahui-host-release.service'])
    if (changed && oldUnitActive)
      runHostCommand('systemctl', ['restart', 'tungchiahui-host-release.service'])
    const readinessDeadline = Date.now() + 45_000
    while (Date.now() < readinessDeadline && !readHostExecutorStatus(path).healthy)
      await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
    if (!readHostExecutorStatus(path).healthy)
      throw new Error('Installed host supervisor did not become ready')
    checkpointHostRelease(path, claimed.id, lease, release, before, 'committed')
    finishInfrastructureOperation(path, claimed.id, lease, {
      status: 'completed',
      phase: 'host-bootstrap-verified',
      result: { sha, status: 'ready' },
    })
    appendControlAuditEvent(path, {
      operationId: claimed.id,
      actorId: actor.id,
      eventType: 'host_executor_activated',
      outcome: 'succeeded',
      details: release,
      createdAt: new Date().toISOString(),
    })
    console.log(JSON.stringify({ event: 'host_executor_activated', sha, status: 'ready' }))
  } catch {
    let restored = false
    if (checkpoint) {
      try {
        runHostCommand('systemctl', ['stop', 'tungchiahui-host-release.service'], {}, true)
        restoreHostGeneration(path, checkpoint.before.hostSha, checkpoint.before.hostPreviousSha)
        if (checkpoint.before.hostSha && oldUnit) writeHostFile(previousUnit, oldUnit, 0, 0, 0o644)
        else {
          runHostCommand('systemctl', ['disable', 'tungchiahui-host-release.service'], {}, true)
          rmSync(previousUnit, { force: true })
        }
        runHostCommand('systemctl', ['daemon-reload'])
        if (checkpoint.before.hostSha)
          runHostCommand('systemctl', ['start', 'tungchiahui-host-release.service'])
        restoreHostConvergence(settings, checkpoint.before, claimed.id)
        if (checkpoint.before.hostSha && !oldUnitActive)
          runHostCommand('systemctl', ['stop', 'tungchiahui-host-release.service'])
        checkpointHostRelease(
          path,
          claimed.id,
          lease,
          checkpoint.release,
          checkpoint.before,
          'reverted',
        )
        restored = true
      } catch {
        /* Keep the original durable snapshot for server-console recovery. */
      }
    }
    finishInfrastructureOperation(path, claimed.id, lease, {
      status: 'failed',
      phase: restored ? 'host-bootstrap-reverted' : 'host-bootstrap-recovery-required',
      errorSummary:
        'Server activation failed; inspect the durable bootstrap checkpoint and service unit',
    })
    throw new Error('Server activation failed; inspect its audited operation on the server')
  }
}
