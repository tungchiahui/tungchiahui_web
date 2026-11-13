import {
  checkpointRecoveryOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  heartbeatInfrastructureOperation,
  type InfrastructureOperation,
  updateInfrastructureOperationPhase,
} from '../control-plane/control-state'
import { safeErrorAttributes } from '../observability/telemetry'
import {
  type PostgresMaintenanceProgress,
  type PostgresMaintenanceTarget,
  postgresMaintenanceProgressSchema,
  postgresMaintenanceTargetSchema,
} from './postgres-contracts'

type Evidence = Readonly<Record<string, unknown>>
export interface PostgresMaintenancePlatform {
  prepare(target: PostgresMaintenanceTarget): Promise<Evidence>
  quiesce(baseline: Evidence): Promise<void>
  drain(): Promise<Evidence>
  stop(): Promise<void>
  coldCopy(operationId: string): Promise<string>
  verifyColdCopy(operationId: string, expectedSha256: string): Promise<void>
  start(digest: string): Promise<void>
  verify(digest: string, database: Evidence): Promise<void>
  backup(operationId: string): Promise<Evidence>
  resume(baseline: Evidence): Promise<void>
}

/** Every external mutation has a durable intent and can be repeated after a fenced restart. */
export async function executePostgresMaintenance(
  path: string,
  operation: InfrastructureOperation,
  lease: Readonly<{ leaseOwner: string; fencingToken: number }>,
  platform: PostgresMaintenancePlatform,
) {
  const target = postgresMaintenanceTargetSchema.parse(operation.target)
  let progress = operation.result
    ? postgresMaintenanceProgressSchema.parse(operation.result)
    : undefined
  const renew = () => heartbeatInfrastructureOperation(path, operation.id, lease, 3600)
  const save = (next: PostgresMaintenanceProgress) => {
    renew()
    checkpointRecoveryOperation(
      path,
      operation.id,
      lease,
      next.phase,
      next,
      'postgres-image-upgrade',
    )
    progress = next
  }
  const finish = (status: 'completed' | 'failed' | 'needs-attention', phase: string) =>
    finishInfrastructureOperation(path, operation.id, lease, {
      status,
      phase,
      result: progress ?? null,
      errorSummary:
        status === 'completed'
          ? null
          : status === 'failed'
            ? 'PostgreSQL maintenance refused or reverted. Inspect phase audit.'
            : 'PostgreSQL maintenance requires operator recovery. Maintenance remains active.',
    })
  const rollback = async () => {
    if (!progress) throw new Error('Maintenance baseline is unavailable')
    save({ ...progress, phase: 'rolling-back' })
    await platform.quiesce(progress.baseline)
    renew()
    if (!progress.database)
      save({ ...progress, database: await platform.drain(), phase: 'rolling-back' })
    await platform.stop()
    renew()
    await platform.start(target.oldDigest)
    renew()
    await platform.verify(target.oldDigest, progress.database ?? {})
    save({ ...progress, phase: 'rollback-verified' })
    await platform.resume(progress.baseline)
    return finish('failed', 'postgres-image-reverted')
  }
  try {
    renew()
    if (!progress) {
      const baseline = await platform.prepare(target)
      if (target.mode === 'execute') {
        const preflight = getInfrastructureOperation(path, target.preflightOperationId)
        const planned = preflight && postgresMaintenanceTargetSchema.parse(preflight.target)
        if (
          preflight?.status !== 'completed' ||
          !planned ||
          planned.mode !== 'preflight' ||
          planned.oldDigest !== target.oldDigest ||
          planned.newDigest !== target.newDigest ||
          planned.candidateSha !== target.candidateSha ||
          planned.backupId !== target.backupId ||
          JSON.stringify(preflight.result?.baseline) !== JSON.stringify(baseline)
        )
          throw new Error('Completed preflight identity or host baseline changed')
      }
      save({ phase: 'prepared', baseline, startedAt: new Date().toISOString() })
    }
    if (!progress) throw new Error('Maintenance checkpoint was not persisted')
    switch (target.mode) {
      case 'preflight':
        return finish('completed', 'postgres-image-preflight-verified')
      case 'execute':
        break
      default: {
        const unhandled: never = target
        throw new Error(`Unknown maintenance target ${String(unhandled)}`)
      }
    }
    while (true) {
      const phase = progress.phase
      switch (phase) {
        case 'prepared':
          save({ ...progress, phase: 'quiescing' })
          break
        case 'quiescing': {
          await platform.quiesce(progress.baseline)
          renew()
          const database = await platform.drain()
          save({ ...progress, database, phase: 'drained' })
          break
        }
        case 'drained':
          await platform.stop()
          save({ ...progress, phase: 'stopped' })
          break
        case 'stopped': {
          const coldCopySha256 = await platform.coldCopy(operation.id)
          save({ ...progress, coldCopySha256, phase: 'cold-copy-verified' })
          break
        }
        case 'cold-copy-verified':
          save({ ...progress, phase: 'candidate-starting' })
          break
        case 'candidate-starting':
          renew()
          if (!progress.coldCopySha256) throw new Error('Verified cold-copy identity is missing')
          await platform.verifyColdCopy(operation.id, progress.coldCopySha256)
          await platform.start(target.newDigest)
          renew()
          await platform.verify(target.newDigest, progress.database ?? {})
          save({
            ...progress,
            backupStartedAt: new Date().toISOString(),
            phase: 'candidate-verified',
          })
          break
        case 'candidate-verified': {
          const postBackup = await platform.backup(operation.id)
          save({ ...progress, postBackup, phase: 'backup-verified' })
          break
        }
        case 'backup-verified':
          save({ ...progress, phase: 'resuming' })
          break
        case 'resuming':
          renew()
          await platform.resume(progress.baseline)
          save({ ...progress, phase: 'verified' })
          break
        case 'verified':
          return finish('completed', 'postgres-image-verified')
        case 'rolling-back':
        case 'rollback-verified':
          return await rollback()
        case 'recovery-required':
          return finish('needs-attention', 'postgres-image-recovery-required')
        default: {
          const unhandled: never = phase
          throw new Error(`Unknown maintenance phase ${String(unhandled)}`)
        }
      }
    }
  } catch (error: unknown) {
    // A stale owner must never compensate after a new supervisor acquired the host capability.
    renew()
    const receipt = getInfrastructureOperation(path, operation.id)?.result
    if (receipt) progress = postgresMaintenanceProgressSchema.parse(receipt)
    updateInfrastructureOperationPhase(
      path,
      operation.id,
      lease,
      progress?.phase ?? 'preflight-failed',
      { failure: safeErrorAttributes(error) },
    )
    if (!progress || progress.phase === 'prepared')
      return finish('failed', 'postgres-image-rejected')
    if (progress.phase === 'quiescing') {
      try {
        await platform.resume(progress.baseline)
        return finish('failed', 'postgres-image-rejected')
      } catch {
        renew()
        save({ ...progress, phase: 'recovery-required' })
        return finish('needs-attention', 'postgres-image-recovery-required')
      }
    }
    try {
      return await rollback()
    } catch {
      renew()
      if (progress) save({ ...progress, phase: 'recovery-required' })
      return finish('needs-attention', 'postgres-image-recovery-required')
    }
  }
}
