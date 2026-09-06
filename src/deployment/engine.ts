import { z } from 'zod'

import {
  clearDeploymentCutoverIntent,
  commitDeploymentCutover,
  type DeploymentRuntimeState,
  discardDeploymentRollbackTarget,
  heartbeatInfrastructureOperation,
  type InfrastructureOperation,
  initializeDeploymentRuntime,
  type RecoveryBackupRecord,
  readDeploymentState,
  recordDeploymentCutoverIntent,
  updateInfrastructureOperationPhase,
} from '../control-plane/control-state'
import { validateMigrationPolicy } from '../database/migration-policy'

export const deploymentSlotSchema = z.enum(['blue', 'green'])
export const deploymentReleaseSchema = z
  .object({
    digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    slot: deploymentSlotSchema,
  })
  .strict()

export type DeploymentSlot = z.infer<typeof deploymentSlotSchema>
export type DeploymentRelease = Readonly<z.infer<typeof deploymentReleaseSchema>>

export type DeploymentSmokeEvidence = Readonly<{
  article: 'pass'
  asset: 'pass'
  health: 'pass'
  homepage: 'pass'
  locale: 'pass'
  ready: 'pass'
  searchApi: 'pass'
  searchPage: 'pass'
  version: 'pass'
}>

export interface DeploymentPlatform {
  cleanupFailedCandidate(release: DeploymentRelease): Promise<void>
  inspectActiveRelease(): Promise<DeploymentRelease>
  inspectTrafficSlot(): Promise<DeploymentSlot>
  prepareCandidate(release: DeploymentRelease): Promise<void>
  runMigrations(input: Readonly<{ hasFreshRecoverableBackup: boolean }>): Promise<void>
  smokeRelease(release: DeploymentRelease): Promise<DeploymentSmokeEvidence>
  smokePublicEntry(release: DeploymentRelease): Promise<DeploymentSmokeEvidence>
  switchTraffic(slot: DeploymentSlot): Promise<void>
  validateCutover(slot: DeploymentSlot): Promise<void>
  validateImage(release: DeploymentRelease): Promise<void>
  verifyRetainedRelease(release: DeploymentRelease): Promise<void>
}

type LeaseIdentity = Readonly<{ fencingToken: number; leaseOwner: string }>

export type DeploymentEngineOptions = Readonly<{
  backupFreshnessSeconds: number
  controlStatePath: string
  journalPath: string
  leaseSeconds: number
  migrationPolicyPath: string
  stabilizationSeconds: number
}>

const phaseOrder = [
  'executing',
  'preflight-complete',
  'candidate-prepared',
  'migration-complete',
  'pre-smoke-complete',
  'cutover-intent-recorded',
  'traffic-switched',
  'cutover-committed',
  'post-smoke-complete',
] as const

function phaseIndex(phase: string) {
  const index = phaseOrder.indexOf(phase as (typeof phaseOrder)[number])
  return index < 0 ? 0 : index
}

function inactiveSlot(active: DeploymentSlot): DeploymentSlot {
  return active === 'blue' ? 'green' : 'blue'
}

function releaseFromRuntime(
  runtime: DeploymentRuntimeState,
  identity: 'current' | 'last',
): DeploymentRelease {
  const slot = identity === 'current' ? runtime.activeSlot : runtime.previousSlot
  const sha = identity === 'current' ? runtime.currentSha : runtime.lastSha
  const digest = identity === 'current' ? runtime.currentDigest : runtime.lastDigest
  if (slot === 'none' || sha === null || digest === null) {
    throw new Error(`Deployment runtime has no ${identity} release`)
  }
  return deploymentReleaseSchema.parse({ digest, sha, slot })
}

export function hasFreshRecoverableBackup(
  backups: readonly RecoveryBackupRecord[],
  maximumAgeSeconds: number,
  now = new Date(),
) {
  const maximumAge = z.number().int().positive().max(31_536_000).parse(maximumAgeSeconds)
  return backups.some(
    (backup) =>
      backup.valid &&
      backup.offsiteReplicaStatus === 'fresh' &&
      now.getTime() - new Date(backup.completedAt).getTime() <= maximumAge * 1_000,
  )
}

function targetRelease(operation: InfrastructureOperation, runtime: DeploymentRuntimeState) {
  if (operation.operationType === 'deploy') {
    const target = z
      .object({
        gitSha: z.string().regex(/^[a-f0-9]{40}$/),
        imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
      })
      .strict()
      .parse(operation.target)
    if (runtime.activeSlot === 'none') throw new Error('Deployment runtime is not initialized')
    if (runtime.currentSha === target.gitSha && runtime.currentDigest === target.imageDigest) {
      return releaseFromRuntime(runtime, 'current')
    }
    return deploymentReleaseSchema.parse({
      digest: target.imageDigest,
      sha: target.gitSha,
      slot: inactiveSlot(runtime.activeSlot),
    })
  }
  if (operation.operationType === 'rollback') {
    const retained = releaseFromRuntime(runtime, 'last')
    const target = z
      .object({
        targetDigest: z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .optional(),
        targetSha: z.string().regex(/^[a-f0-9]{40}$/),
      })
      .strict()
      .parse(operation.target)
    if (target.targetSha === runtime.currentSha && target.targetDigest === runtime.currentDigest) {
      return releaseFromRuntime(runtime, 'current')
    }
    if (target.targetSha !== retained.sha || target.targetDigest !== retained.digest) {
      throw new Error('Rollback request no longer matches the retained release')
    }
    return retained
  }
  throw new Error('Shared deployment engine only accepts deploy or rollback operations')
}

export async function executeDeploymentOperation(
  operation: InfrastructureOperation,
  lease: LeaseIdentity,
  backups: readonly RecoveryBackupRecord[],
  platform: DeploymentPlatform,
  options: DeploymentEngineOptions,
  now = new Date(),
) {
  let runtime = readDeploymentState(options.controlStatePath)
  const detected = await platform.inspectActiveRelease()
  if (runtime.activeSlot === 'none') {
    initializeDeploymentRuntime(options.controlStatePath, detected, lease.leaseOwner, now)
    runtime = readDeploymentState(options.controlStatePath)
  } else {
    const matchesCurrent =
      detected.slot === runtime.activeSlot &&
      detected.sha === runtime.currentSha &&
      detected.digest === runtime.currentDigest
    const matchesPendingCutover =
      runtime.pendingSlot !== 'none' &&
      detected.slot === runtime.pendingSlot &&
      detected.sha === runtime.pendingSha &&
      detected.digest === runtime.pendingDigest
    if (!matchesCurrent && !matchesPendingCutover) {
      throw new Error('Observed traffic release does not match durable deployment state')
    }
  }
  const target = targetRelease(operation, runtime)
  const targetAlreadyCurrent =
    runtime.currentSha === target.sha && runtime.currentDigest === target.digest
  let phase = phaseIndex(operation.phase)
  if (targetAlreadyCurrent && phase < phaseIndex('traffic-switched')) {
    throw new Error('Requested release is already active')
  }
  const current = releaseFromRuntime(runtime, targetAlreadyCurrent ? 'last' : 'current')
  const freshBackup = hasFreshRecoverableBackup(backups, options.backupFreshnessSeconds, now)
  let candidatePrepared =
    operation.operationType === 'deploy' && phase >= phaseIndex('candidate-prepared')

  const advance = (nextPhase: (typeof phaseOrder)[number], details = {}) => {
    heartbeatInfrastructureOperation(
      options.controlStatePath,
      operation.id,
      lease,
      options.leaseSeconds,
    )
    updateInfrastructureOperationPhase(
      options.controlStatePath,
      operation.id,
      lease,
      nextPhase,
      details,
    )
    phase = phaseIndex(nextPhase)
  }

  if (
    operation.operationType === 'deploy' &&
    !targetAlreadyCurrent &&
    runtime.stabilizationUntil !== null &&
    runtime.stabilizationUntil > now.toISOString()
  ) {
    throw new Error('Previous release is still inside its stabilization window')
  }

  let cutoverCommitted =
    phase >= phaseIndex('cutover-committed') ||
    (targetAlreadyCurrent && phase >= phaseIndex('traffic-switched'))
  try {
    if (phase < phaseIndex('preflight-complete')) {
      if (operation.operationType === 'deploy') {
        await platform.validateImage(target)
      }
      validateMigrationPolicy(options.migrationPolicyPath, options.journalPath, {
        allowContract: false,
        hasFreshRecoverableBackup: freshBackup,
      })
      advance('preflight-complete', {
        freshRecoverableBackup: freshBackup,
        targetDigest: target.digest,
        targetSha: target.sha,
        targetSlot: target.slot,
      })
    }

    if (operation.operationType === 'deploy') {
      if (phase < phaseIndex('candidate-prepared')) {
        if (runtime.previousSlot === target.slot) {
          discardDeploymentRollbackTarget(
            options.controlStatePath,
            operation.id,
            lease,
            releaseFromRuntime(runtime, 'last'),
          )
          runtime = readDeploymentState(options.controlStatePath)
        }
        await platform.prepareCandidate(target)
        advance('candidate-prepared')
        candidatePrepared = true
      }
      if (phase < phaseIndex('migration-complete')) {
        await platform.runMigrations({ hasFreshRecoverableBackup: freshBackup })
        advance('migration-complete')
      }
    } else if (phase < phaseIndex('migration-complete')) {
      await platform.verifyRetainedRelease(target)
      advance('migration-complete', { rebuilt: false })
    }

    if (phase < phaseIndex('pre-smoke-complete')) {
      const evidence = await platform.smokeRelease(target)
      advance('pre-smoke-complete', evidence)
    }

    if (phase < phaseIndex('cutover-intent-recorded')) {
      recordDeploymentCutoverIntent(options.controlStatePath, operation.id, lease, target)
      advance('cutover-intent-recorded')
    }

    if (phase < phaseIndex('traffic-switched')) {
      const observed = await platform.inspectTrafficSlot()
      if (observed !== target.slot) {
        await platform.validateCutover(target.slot)
        await platform.switchTraffic(target.slot)
      }
      advance('traffic-switched')
    }

    if (phase < phaseIndex('cutover-committed')) {
      if (!targetAlreadyCurrent) {
        runtime = commitDeploymentCutover(
          options.controlStatePath,
          operation.id,
          lease,
          options.stabilizationSeconds,
        )
        cutoverCommitted = true
      }
      advance('cutover-committed', {
        activeSlot: runtime.activeSlot,
        previousSlot: runtime.previousSlot,
        stabilizationUntil: runtime.stabilizationUntil,
      })
    }

    if (phase < phaseIndex('post-smoke-complete')) {
      try {
        const evidence = await platform.smokePublicEntry(target)
        advance('post-smoke-complete', evidence)
      } catch (error: unknown) {
        if (!cutoverCommitted) throw error
        const rollbackTarget = current
        recordDeploymentCutoverIntent(options.controlStatePath, operation.id, lease, rollbackTarget)
        await platform.validateCutover(rollbackTarget.slot)
        await platform.switchTraffic(rollbackTarget.slot)
        commitDeploymentCutover(options.controlStatePath, operation.id, lease, 0)
        await platform.cleanupFailedCandidate(target)
        discardDeploymentRollbackTarget(options.controlStatePath, operation.id, lease, target)
        updateInfrastructureOperationPhase(
          options.controlStatePath,
          operation.id,
          lease,
          'post-smoke-auto-rollback',
          { rollbackDigest: rollbackTarget.digest, rollbackSha: rollbackTarget.sha },
        )
        throw new Error(
          `Post-cutover smoke failed and traffic was rolled back: ${
            error instanceof Error ? error.message : 'unknown smoke failure'
          }`,
        )
      }
    }

    return Object.freeze({ active: target, freshRecoverableBackup: freshBackup })
  } catch (error: unknown) {
    if (!cutoverCommitted) {
      try {
        clearDeploymentCutoverIntent(options.controlStatePath, operation.id, lease)
      } catch {
        // No intent may exist yet. Preserve the primary failure.
      }
      if (operation.operationType === 'deploy' && candidatePrepared) {
        await platform.cleanupFailedCandidate(target)
      }
    }
    throw error
  }
}
