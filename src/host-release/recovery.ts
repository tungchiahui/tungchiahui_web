import { randomUUID } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'
import {
  appendControlAuditEvent,
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  type DeploymentRuntimeState,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  type InfrastructureOperation,
  initializeControlState,
  listInfrastructureOperations,
  readDeploymentState,
  reconcileInfrastructureOperations,
  startInfrastructureOperation,
} from '../control-plane/control-state'
import {
  type HostSettings,
  hostSettingsSchema,
  releaseDigestSchema,
  releaseShaSchema,
} from './contracts'
import {
  captureHostConvergence,
  compensateStaleWebRelease,
  convergenceDifferences,
  describeHostReleaseFailure,
  executeWebJob,
  hostControlPath,
  releaseProvisionRequest,
  restoreHostConvergence,
} from './coordinator'
import {
  containerConfigRebindRequired,
  hostTopologyConfigStale,
  inspectHostContainer,
  readHostEnvironment,
} from './provision'
import {
  initializeHostReleaseState,
  readHostCheckpoint,
  readHostGeneration,
  readHostRuntime,
  requeueHostRecovery,
} from './state'

type Checkpoint = NonNullable<ReturnType<typeof readHostCheckpoint>>
type HostRuntime = ReturnType<typeof readHostRuntime>

type RecoveryCandidateInput = Readonly<{
  operation: Pick<InfrastructureOperation, 'operationType' | 'phase' | 'status'>
  checkpoint: Checkpoint | undefined
  deployment: Pick<DeploymentRuntimeState, 'currentDigest' | 'currentSha' | 'pendingSha'>
  hostRuntime: Pick<HostRuntime, 'current_sha' | 'pending_sha' | 'previous_sha'>
}>

/**
 * A recovery is only valid for a release that stopped at the explicit recovery-required
 * state, whose durable checkpoint still describes the state the host must be restored to.
 * The original operation is never rewritten; a separate audited operation records recovery.
 */
export function hostRecoveryRejection(input: RecoveryCandidateInput): string | null {
  const { operation, checkpoint, deployment, hostRuntime } = input
  if (operation.operationType !== 'deploy' && operation.operationType !== 'rollback')
    return 'only deploy or rollback operations require host release recovery'
  if (operation.status !== 'failed') return 'the original infrastructure operation is not failed'
  if (operation.phase !== 'host-release-recovery-required')
    return 'the original operation did not stop at host-release-recovery-required'
  if (!checkpoint) return 'the original operation has no durable host checkpoint'
  if (checkpoint.phase !== 'compensating' && checkpoint.phase !== 'reverted')
    return 'the host checkpoint is not in a compensable phase'
  if (checkpoint.before.hostSha === null)
    return 'the checkpoint has no installed host executor baseline'
  if (deployment.pendingSha !== null) return 'a Web deployment cutover is still pending'
  if (
    deployment.currentSha !== checkpoint.before.sha ||
    deployment.currentDigest !== checkpoint.before.webDigest
  )
    return 'the active Web release does not match the checkpoint baseline'
  if (hostRuntime.pending_sha !== null) return 'a host executor generation is still pending'
  if (hostRuntime.current_sha !== checkpoint.before.hostSha)
    return 'the installed host executor does not match the checkpoint baseline'
  if (hostRuntime.previous_sha !== checkpoint.before.hostPreviousSha)
    return 'the retained host executor generation does not match the checkpoint baseline'
  return null
}

function serviceFailure(settings: HostSettings, name: string) {
  const container = inspectHostContainer(`${settings.projectName}-${name}-1`)
  if (!container?.State.Running) return `${name} is not running`
  if (container.State.Health && container.State.Health.Status !== 'healthy')
    return `${name} is ${container.State.Health.Status}`
  return null
}

function assertHostServicesHealthy(settings: HostSettings, deployment: DeploymentRuntimeState) {
  const failures = [
    ...[
      'postgres',
      'pgbouncer',
      'openresty',
      'control-api',
      'content-worker',
      'observability-agent',
      'deploy-agent',
    ].map((service) => serviceFailure(settings, service)),
    serviceFailure(settings, `web-${deployment.activeSlot}`),
  ].filter((failure) => failure !== null)
  if (failures.length > 0)
    throw new Error(`Recovered host services are not healthy: ${failures.join(', ')}`)
}

function assertTopologyProcessesCurrent(settings: HostSettings) {
  for (const [service, files] of [
    ['pgbouncer', ['pgbouncer.ini', 'secrets/pgbouncer-userlist.txt']],
    ['openresty', ['openresty.conf']],
  ] as const) {
    const container = inspectHostContainer(`${settings.projectName}-${service}-1`)
    if (!container) throw new Error(`Recovered ${service} container is missing`)
    for (const file of files)
      if (
        containerConfigRebindRequired(
          container.startedAt,
          statSync(join(settings.configRoot, file)).mtimeMs,
        )
      )
        throw new Error(`Recovered ${service} still runs a configuration older than ${file}`)
  }
}

function topologyContainerIds(settings: HostSettings) {
  return {
    openresty: inspectHostContainer(`${settings.projectName}-openresty-1`)?.Id ?? null,
    pgbouncer: inspectHostContainer(`${settings.projectName}-pgbouncer-1`)?.Id ?? null,
  }
}

export async function recoverHostRelease(
  settingsInput: HostSettings,
  originalOperationIdInput: string,
  options: Readonly<{ checkOnly?: boolean }> = {},
) {
  if (process.getuid?.() !== 0)
    throw new Error('Run the one-time recovery as administrator on the production server')
  process.umask(0o007)
  const settings = hostSettingsSchema.parse(settingsInput)
  const originalOperationId = z.uuid().parse(originalOperationIdInput)
  const path = hostControlPath(settings)
  if (options.checkOnly !== true) {
    initializeControlState(path, 'production')
    initializeHostReleaseState(path)
    reconcileInfrastructureOperations(path)
  }

  const original = getInfrastructureOperation(path, originalOperationId)
  if (!original) throw new Error('The original infrastructure operation does not exist')
  const checkpoint = readHostCheckpoint(path, originalOperationId)
  const deployment = readDeploymentState(path)
  const hostRuntime = readHostRuntime(path)
  const rejection = hostRecoveryRejection({
    operation: original,
    checkpoint,
    deployment,
    hostRuntime,
  })
  if (rejection !== null || !checkpoint)
    throw new Error(`Host release recovery refused: ${rejection ?? 'missing checkpoint'}`)
  const before = checkpoint.before
  const failedTarget =
    original.operationType === 'deploy'
      ? z
          .object({ gitSha: releaseShaSchema, imageDigest: releaseDigestSchema })
          .strict()
          .parse(original.target)
      : (() => {
          const target = z
            .object({ targetDigest: releaseDigestSchema, targetSha: releaseShaSchema })
            .strict()
            .parse(original.target)
          return { gitSha: target.targetSha, imageDigest: target.targetDigest }
        })()
  if (
    checkpoint.release.sha !== failedTarget.gitSha ||
    checkpoint.release.webDigest !== failedTarget.imageDigest
  )
    throw new Error(
      'Host release recovery refused: checkpoint release does not match the failed target',
    )

  const healthDataPath = join(settings.dataRoot, 'health-data')
  if (options.checkOnly === true) {
    const current = captureHostConvergence(settings)
    const stale = hostTopologyConfigStale(settings)
    const currentTopologyFile = (file: string) =>
      readFileSync(join(settings.configRoot, file), 'utf8')
    return {
      checkOnly: true,
      checkpointPhase: checkpoint.phase,
      convergenceDifferences: convergenceDifferences(before, current),
      healthDataDirectoryPresent: existsSync(healthDataPath),
      originalOperationId,
      topologyRebindPlan: {
        openresty:
          stale.openresty ||
          currentTopologyFile('openresty.conf') !== before.files['openresty.conf'],
        pgbouncer:
          stale.pgbouncer || currentTopologyFile('pgbouncer.ini') !== before.files['pgbouncer.ini'],
      },
      webRollbackRequired: !(
        deployment.currentSha === before.sha && deployment.currentDigest === before.webDigest
      ),
    }
  }

  const environment = readHostEnvironment({ settings })
  const repository = z
    .string()
    .regex(/^[-a-z0-9.:/_]+$/)
    .parse(environment.TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY)
  const actor = {
    id: 'server-console:host-recovery',
    kind: 'operator' as const,
    capabilities: [
      'infrastructure-operation:create' as const,
      'infrastructure-operation:read' as const,
    ],
  }
  const request = {
    operationType: 'server-migration' as const,
    reason: `Recover failed host release ${originalOperationId}`,
    target: { action: 'host-release-recovery' as const, originalOperationId },
  }
  const key = `host-release-recovery:${originalOperationId}`
  const matchesRecovery = (operation: InfrastructureOperation) =>
    operation.operationType === 'server-migration' &&
    operation.target.action === 'host-release-recovery' &&
    operation.target.originalOperationId === originalOperationId
  const active = listInfrastructureOperations(path, {
    statuses: ['queued', 'claimed', 'running', 'needs-attention'],
  })
  const existing = active.find(matchesRecovery)
  if (active.length > (existing ? 1 : 0))
    throw new Error(
      'Another infrastructure operation is active; recovery requires an exclusive window',
    )
  let created: InfrastructureOperation
  if (existing) {
    if (existing.status === 'needs-attention') requeueHostRecovery(path, existing.id)
    else if (existing.status !== 'queued')
      throw new Error('The host release recovery operation is already active')
    const queued = getInfrastructureOperation(path, existing.id)
    if (!queued) throw new Error('The queued host release recovery operation disappeared')
    created = queued
  } else {
    const record = createInfrastructureOperation(path, request, actor, key).operation
    if (record.status === 'completed') {
      const differences = convergenceDifferences(before, captureHostConvergence(settings))
      if (differences.length > 0)
        throw new Error(
          `Completed recovery no longer matches its baseline: ${differences.join(', ')}`,
        )
      return record
    }
    created =
      record.status === 'failed' || record.status === 'needs-attention'
        ? createInfrastructureOperation(path, request, actor, `${key}:${randomUUID()}`).operation
        : record
  }
  if (created.status !== 'queued')
    throw new Error('The host release recovery operation is not claimable')

  const owner = `deploy-agent:host-recovery:${randomUUID()}`
  const claimed = claimNextInfrastructureOperation(path, owner, 3600, new Date(), [
    'server-migration',
  ])
  if (!claimed || claimed.id !== created.id)
    throw new Error('Exclusive host release recovery operation could not be claimed')
  const lease = { leaseOwner: owner, fencingToken: claimed.fencingToken }
  const operation = startInfrastructureOperation(path, claimed.id, lease)
  const healthDataExisted = existsSync(healthDataPath)
  const topologyBefore = topologyContainerIds(settings)
  let finished = false
  try {
    const webRestoredByEngine = compensateStaleWebRelease({
      settings,
      repository,
      release: checkpoint.release,
      before,
      operation,
      owner,
    })
    restoreHostConvergence(settings, before, operation.id)
    const after = captureHostConvergence(settings)
    const differences = convergenceDifferences(before, after)
    if (differences.length > 0)
      throw new Error(`Host convergence does not match the checkpoint: ${differences.join(', ')}`)
    const deploymentAfter = readDeploymentState(path)
    if (deploymentAfter.pendingSha !== null)
      throw new Error('Recovered deployment still has a pending Web cutover')
    if (readHostRuntime(path).pending_sha !== null)
      throw new Error('Recovered host runtime still has a pending executor generation')
    assertHostServicesHealthy(settings, deploymentAfter)
    assertTopologyProcessesCurrent(settings)

    const beforeRelease = readHostGeneration(path, z.string().parse(before.hostSha))
    executeWebJob(
      releaseProvisionRequest(settings, repository, beforeRelease, before),
      operation,
      owner,
      'verify',
    )

    const topologyAfter = topologyContainerIds(settings)
    const result = {
      hostRecovery: {
        checkpointPhase: checkpoint.phase,
        convergenceVerified: true,
        originalOperationId,
        originalOperationPhase: original.phase,
        preparedHealthDataDirectory: !healthDataExisted && existsSync(healthDataPath),
        restoredHostSha: before.hostSha,
        restoredSha: before.sha,
        topologyRebound: {
          openresty: topologyBefore.openresty !== topologyAfter.openresty,
          pgbouncer: topologyBefore.pgbouncer !== topologyAfter.pgbouncer,
        },
        webRestoredByEngine,
      },
    }
    appendControlAuditEvent(path, {
      actorId: actor.id,
      createdAt: new Date().toISOString(),
      details: { ...result.hostRecovery, recoveryOperationId: operation.id },
      eventType: 'host_release_recovery_verified',
      operationId: originalOperationId,
      outcome: 'succeeded',
    })
    const completed = finishInfrastructureOperation(path, operation.id, lease, {
      status: 'completed',
      phase: 'host-release-recovered',
      result,
    })
    finished = true
    console.log(
      JSON.stringify({
        event: 'host_release_recovered',
        operationId: operation.id,
        originalOperationId,
        sha: before.sha,
      }),
    )
    return completed
  } catch (error: unknown) {
    const diagnostic = describeHostReleaseFailure('recovery', error)
    if (!finished) {
      try {
        finishInfrastructureOperation(path, operation.id, lease, {
          status: 'failed',
          phase: 'host-release-recovery-failed',
          errorSummary:
            `Host release recovery failed (${diagnostic.error_type}): ${diagnostic.message}`.slice(
              0,
              2_000,
            ),
        })
      } catch {
        /* Preserve the primary failure; the operation lease can be reconciled. */
      }
      try {
        appendControlAuditEvent(path, {
          actorId: actor.id,
          createdAt: new Date().toISOString(),
          details: { ...diagnostic, recoveryOperationId: operation.id },
          eventType: 'host_release_recovery_failed',
          operationId: originalOperationId,
          outcome: 'failed',
        })
      } catch {
        console.error(JSON.stringify({ event: 'host_release_recovery_audit_failed' }))
      }
    }
    console.error(
      JSON.stringify({
        event: 'host_release_recovery_failed',
        operationId: operation.id,
        originalOperationId,
        ...diagnostic,
      }),
    )
    throw error
  }
}
