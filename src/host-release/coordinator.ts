import { spawnSync } from 'node:child_process'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  claimNextInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  heartbeatInfrastructureOperation,
  type InfrastructureOperation,
  readDeploymentState,
  startInfrastructureOperation,
} from '../control-plane/control-state'
import { safeErrorAttributes } from '../observability/telemetry'
import { extractHostGeneration, hostGenerationDirectory, resolveHostRelease } from './artifacts'
import {
  type HostRelease,
  type HostSettings,
  hostSettingsSchema,
  type ProvisionRequest,
  releaseDigestSchema,
  releaseShaSchema,
  topologyFiles,
} from './contracts'
import {
  hostCompose,
  inspectHostContainer,
  provisionHost,
  readHostEnvironment,
  runHostCommand,
  writeHostFile,
} from './provision'
import {
  type ConvergenceSnapshot,
  checkpointHostRelease,
  commitHostGeneration,
  convergenceSnapshotSchema,
  discardHostCandidate,
  readHostBootstrapBaseline,
  readHostCheckpoint,
  readHostGeneration,
  readHostRuntime,
  restoreHostGeneration,
  stageHostGeneration,
} from './state'

export function hostControlPath(settings: HostSettings) {
  return join(settings.dataRoot, 'control-state/control.db')
}

export function captureHostConvergence(settings: HostSettings): ConvergenceSnapshot {
  const runtime = readDeploymentState(hostControlPath(settings))
  const image = (service: string) => {
    const container = inspectHostContainer(`${settings.projectName}-${service}-1`)
    if (!container) throw new Error('Required host service is missing')
    return container.Config.Image
  }
  const hostRuntime = readHostRuntime(hostControlPath(settings))
  return convergenceSnapshotSchema.parse({
    hostSha: hostRuntime.current_sha,
    hostPreviousSha: hostRuntime.previous_sha,
    deploymentPollingEnabled:
      inspectHostContainer(`${settings.projectName}-deploy-agent-1`)?.deploymentPollingEnabled ??
      false,
    serviceImage: image('control-api'),
    recoveryImage: image('deploy-agent'),
    postgresImage: image('postgres'),
    webImage: image(`web-${runtime.activeSlot}`),
    webDigest: z.string().parse(runtime.currentDigest),
    sha: z.string().parse(runtime.currentSha),
    files: Object.fromEntries(
      topologyFiles.map((file) => [file, readFileSync(join(settings.configRoot, file), 'utf8')]),
    ),
    backupScheduleEnabled:
      settings.manageSystemd &&
      runHostCommand('systemctl', ['is-enabled', 'tungchiahui-backup.timer'], {}, true).status ===
        0,
    maintenanceScheduleEnabled:
      settings.manageSystemd &&
      runHostCommand('systemctl', ['is-enabled', 'tungchiahui-retention-cleanup.timer'], {}, true)
        .status === 0,
  })
}

export function releaseProvisionRequest(
  settings: HostSettings,
  repository: string,
  release: HostRelease,
  before: ConvergenceSnapshot,
): ProvisionRequest {
  return {
    settings,
    sourceRoot: hostGenerationDirectory(settings, release.sha),
    sha: release.sha,
    webImage: `${repository}@${release.webDigest}`,
    webDigest: release.webDigest,
    serviceImage: `${repository}-service@${release.serviceDigest}`,
    recoveryImage: `${repository}-recovery@${release.recoveryDigest}`,
    postgresImage: before.postgresImage,
    mode: 'services',
    backupScheduleEnabled: before.backupScheduleEnabled,
    maintenanceScheduleEnabled: before.maintenanceScheduleEnabled,
  }
}

export function probeHostGeneration(settings: HostSettings, sha: string) {
  const directory = hostGenerationDirectory(settings, sha)
  const probe = spawnSync(
    join(directory, 'node'),
    [join(directory, 'host-coordinator.cjs'), '--probe'],
    {
      env: {
        NODE_ENV: 'production',
        PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
        HOST_RELEASE_SETTINGS: JSON.stringify(settings),
      },
      encoding: 'utf8',
      timeout: 30_000,
      maxBuffer: 1024 * 1024,
    },
  )
  if (
    probe.status !== 0 ||
    probe.stdout.trim() !== JSON.stringify({ protocol: 1, status: 'ready' })
  )
    throw new Error('Candidate host executor failed its startup contract')
}

function executeWebJob(
  request: ProvisionRequest,
  operation: InfrastructureOperation,
  owner: string,
  mode: 'compensate' | 'verify' | undefined = undefined,
) {
  const name = `${request.settings.projectName}-release-${operation.id}`
  // Only the declared deploy-agent service supplies Docker capability and role-specific env.
  hostCompose(request, [
    'run',
    '--detach',
    '--no-deps',
    '--name',
    name,
    '--entrypoint',
    'node',
    'deploy-agent',
    'dist/release-job.cjs',
    operation.id,
    owner,
    String(operation.fencingToken),
    ...(mode ? [mode] : []),
  ])
  try {
    const result = runHostCommand('docker', ['wait', name])
    if (result.stdout.trim() !== '0') throw new Error('Shared deployment engine failed')
  } finally {
    runHostCommand('docker', ['rm', '--force', name], {}, true)
  }
}

export function restoreHostConvergence(
  settings: HostSettings,
  before: ConvergenceSnapshot,
  operationId: string,
) {
  // The durable snapshot contains fixed, nonsecret topology only; canonical .env is never copied.
  const directory = join(settings.configRoot, 'host-runtime/rollback', z.uuid().parse(operationId))
  mkdirSync(join(directory, 'ops/production'), { recursive: true, mode: 0o700 })
  for (const file of topologyFiles)
    writeHostFile(join(directory, 'ops/production', file), before.files[file] ?? '', 0, 0, 0o600)
  const request: ProvisionRequest = {
    settings,
    sourceRoot: directory,
    sha: before.sha,
    webImage: before.webImage,
    webDigest: before.webDigest,
    serviceImage: before.serviceImage,
    recoveryImage: before.recoveryImage,
    postgresImage: before.postgresImage,
    mode: 'services',
    deploymentPollingEnabled: before.deploymentPollingEnabled,
    backupScheduleEnabled: before.backupScheduleEnabled,
    maintenanceScheduleEnabled: before.maintenanceScheduleEnabled,
  }
  provisionHost(request)
}

export async function coordinateNextHostRelease(input: HostSettings, owner: string) {
  const settings = hostSettingsSchema.parse(input)
  const path = hostControlPath(settings)
  const claimed = claimNextInfrastructureOperation(path, owner, 3600, new Date(), [
    'deploy',
    'rollback',
  ])
  if (!claimed) return false
  const lease = { leaseOwner: owner, fencingToken: claimed.fencingToken }
  const operation = startInfrastructureOperation(path, claimed.id, lease)
  let failureStep = 'resolve-artifacts'
  let checkpoint = readHostCheckpoint(path, operation.id)
  try {
    const environment = readHostEnvironment({ settings })
    const repository = z
      .string()
      .regex(/^[-a-z0-9.:/_]+$/)
      .parse(environment.TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY)
    const target =
      operation.operationType === 'deploy'
        ? z
            .object({ gitSha: releaseShaSchema, imageDigest: releaseDigestSchema })
            .strict()
            .parse(operation.target)
        : (() => {
            const t = z
              .object({ targetSha: releaseShaSchema, targetDigest: releaseDigestSchema })
              .strict()
              .parse(operation.target)
            return { gitSha: t.targetSha, imageDigest: t.targetDigest }
          })()
    const baseline = readHostBootstrapBaseline(path)
    const baselineRollback =
      operation.operationType === 'rollback' &&
      baseline?.sha === target.gitSha &&
      baseline.digest === target.imageDigest
    const installedSha = readHostRuntime(path).current_sha
    const bridge = baselineRollback
      ? readHostGeneration(path, releaseShaSchema.parse(installedSha))
      : null
    const release = await resolveHostRelease(
      repository,
      bridge?.sha ?? target.gitSha,
      bridge?.webDigest ?? target.imageDigest,
      environment,
    )
    if (checkpoint && JSON.stringify(checkpoint.release) !== JSON.stringify(release))
      throw new Error('Durable release manifest changed during replay')
    const before = checkpoint?.before ?? captureHostConvergence(settings)
    if (!checkpoint) {
      extractHostGeneration(settings, repository, release)
      checkpointHostRelease(path, operation.id, lease, release, before, 'prepared')
      checkpoint = readHostCheckpoint(path, operation.id)
    }
    if (
      readFileSync(
        join(hostGenerationDirectory(settings, release.sha), 'ops/production/pgbackrest.conf'),
        'utf8',
      ) !== before.files['pgbackrest.conf']
    )
      throw new Error('PostgreSQL backup configuration requires explicit server maintenance')
    const request = releaseProvisionRequest(settings, repository, release, before)
    heartbeatInfrastructureOperation(path, operation.id, lease, 3600)
    if (checkpoint?.phase === 'compensating' || checkpoint?.phase === 'reverted')
      throw new Error('Interrupted failed release requires compensation')
    failureStep = 'web-engine'
    if (checkpoint?.phase === 'prepared') {
      executeWebJob(request, operation, owner)
      checkpointHostRelease(path, operation.id, lease, release, before, 'web-verified')
    }
    // Applying twice is safe; Docker only recreates services whose immutable image/config changed.
    failureStep = 'converge-services'
    provisionHost(request)
    checkpointHostRelease(path, operation.id, lease, release, before, 'services-verified')
    failureStep = 'post-convergence-smoke'
    executeWebJob(
      request,
      getInfrastructureOperation(path, operation.id) ?? operation,
      owner,
      'verify',
    )
    failureStep = 'candidate-executor-startup'
    probeHostGeneration(settings, release.sha)
    stageHostGeneration(path, release, { operationId: operation.id, ...lease })
    commitHostGeneration(path, release.sha, { operationId: operation.id, ...lease })
    checkpointHostRelease(path, operation.id, lease, release, before, 'committed')
    finishInfrastructureOperation(path, operation.id, lease, {
      status: 'completed',
      phase: baselineRollback ? 'bootstrap-baseline-web-restored' : 'deployment-verified',
      result: {
        hostRelease: {
          sha: baselineRollback ? target.gitSha : release.sha,
          webDigest: baselineRollback ? target.imageDigest : release.webDigest,
          serviceDigest: release.serviceDigest,
          recoveryDigest: release.recoveryDigest,
          status: baselineRollback ? 'retained-web-restored' : 'converged',
          executorSha: release.sha,
        },
      },
    })
    console.log(
      JSON.stringify({
        event: 'host_release_completed',
        operationId: operation.id,
        sha: release.sha,
      }),
    )
  } catch (error: unknown) {
    const failure = safeErrorAttributes(error)
    checkpoint = readHostCheckpoint(path, operation.id)
    let restored = false
    if (checkpoint) {
      try {
        checkpointHostRelease(
          path,
          operation.id,
          lease,
          checkpoint.release,
          checkpoint.before,
          'compensating',
        )
        const environment = readHostEnvironment({ settings })
        const repository = z.string().parse(environment.TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY)
        const current = readDeploymentState(path)
        if (
          current.currentSha !== checkpoint.before.sha ||
          current.currentDigest !== checkpoint.before.webDigest
        ) {
          if (
            current.lastSha !== checkpoint.before.sha ||
            current.lastDigest !== checkpoint.before.webDigest
          )
            throw new Error('Previous Web release unavailable for compensation')
          executeWebJob(
            releaseProvisionRequest(settings, repository, checkpoint.release, checkpoint.before),
            getInfrastructureOperation(path, operation.id) ?? operation,
            owner,
            'compensate',
          )
        }
        restoreHostConvergence(settings, checkpoint.before, operation.id)
        restoreHostGeneration(path, checkpoint.before.hostSha, checkpoint.before.hostPreviousSha, {
          operationId: operation.id,
          ...lease,
        })
        discardHostCandidate(path)
        checkpointHostRelease(
          path,
          operation.id,
          lease,
          checkpoint.release,
          checkpoint.before,
          'reverted',
        )
        restored = true
      } catch {
        /* Retain the fenced operation and snapshot for an audited server-console retry. */
      }
    }
    finishInfrastructureOperation(path, operation.id, lease, {
      status: 'failed',
      phase: !checkpoint
        ? 'host-release-rejected'
        : restored
          ? 'host-release-reverted'
          : 'host-release-recovery-required',
      errorSummary: !checkpoint
        ? `Release refused at ${failureStep} before runtime changes`
        : restored
          ? `Full release failed at ${failureStep}; previous Web and independent services restored`
          : `Full release failed at ${failureStep}; inspect server host executor and durable checkpoint`,
    })
    console.error(
      JSON.stringify({
        event: 'host_release_failed',
        operationId: operation.id,
        restored,
        failureStep,
        ...failure,
      }),
    )
  }
  return true
}
