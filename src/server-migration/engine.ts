import { z } from 'zod'

import type { InfrastructureOperation } from '../control-plane/control-state'
import { updateInfrastructureOperationPhase } from '../control-plane/control-state'

const migrationTargetSchema = z
  .object({
    action: z.enum(['planned-migration', 'provision-only']).default('planned-migration'),
    inventoryHost: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/),
  })
  .strict()

const lsnSchema = z.string().regex(/^[0-9A-F]+\/[0-9A-F]+$/)
const provisionEvidenceSchema = z
  .object({
    idempotent: z.boolean(),
    stableIdentity: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/),
  })
  .strict()
const replicationEvidenceSchema = z
  .object({ postgresMajor: z.literal(18), replicationMode: z.literal('physical-streaming') })
  .strict()
const readinessEvidenceSchema = z
  .object({
    backupFresh: z.boolean(),
    lagBytes: z.number().int().nonnegative(),
    replicationHealthy: z.boolean(),
    storageReady: z.boolean(),
    targetReady: z.boolean(),
  })
  .strict()
const candidateEvidenceSchema = z
  .object({ candidateSha: z.string().regex(/^[a-f0-9]{40}$/), smokePassed: z.boolean() })
  .strict()
const finalWalEvidenceSchema = z
  .object({
    finalWalLsn: lsnSchema,
    lagBytes: z.number().int().nonnegative(),
    sourceWriting: z.boolean(),
  })
  .strict()
const controlStateEvidenceSchema = z
  .object({
    auditDigest: z.string().regex(/^[a-f0-9]{64}$/),
    operationPhase: z.string().min(1).max(100),
    schemaVersion: z.number().int().positive(),
  })
  .strict()
const promotionEvidenceSchema = z
  .object({ promoted: z.boolean(), timeline: z.number().int().positive() })
  .strict()
const reconnectEvidenceSchema = z.object({ ready: z.boolean() }).strict()
const cutoverEvidenceSchema = z
  .object({ originHostname: z.literal('ddns.tungchiahui.cn') })
  .strict()
const postSwitchEvidenceSchema = z
  .object({
    downtimeMilliseconds: z.number().finite().nonnegative(),
    ipv6Only: z.boolean(),
    noDataLoss: z.boolean(),
    publicLikeSmokePassed: z.boolean(),
  })
  .strict()
const rollbackEvidenceSchema = z.object({ sourceWriting: z.boolean() }).strict()

export type ServerMigrationLease = Readonly<{
  fencingToken: number
  leaseOwner: string
}>

export type ServerMigrationPlatform = Readonly<{
  abortBeforePromotion: (reason: string) => Promise<void>
  cutoverOrigin: (inventoryHost: string) => Promise<Readonly<{ originHostname: string }>>
  deployCandidateAndSmoke: (
    inventoryHost: string,
  ) => Promise<Readonly<{ candidateSha: string; smokePassed: boolean }>>
  openNonWritingRollbackWindow: () => Promise<Readonly<{ sourceWriting: boolean }>>
  preparePhysicalReplication: (
    inventoryHost: string,
  ) => Promise<Readonly<{ postgresMajor: number; replicationMode: 'physical-streaming' }>>
  promoteTarget: () => Promise<Readonly<{ promoted: boolean; timeline: number }>>
  provisionTarget: (
    inventoryHost: string,
  ) => Promise<Readonly<{ idempotent: boolean; stableIdentity: string }>>
  quiesceWritesAndAwaitFinalWal: () => Promise<
    Readonly<{
      finalWalLsn: string
      lagBytes: number
      sourceWriting: boolean
    }>
  >
  reconnectApplication: () => Promise<Readonly<{ ready: boolean }>>
  transferControlState: () => Promise<
    Readonly<{
      auditDigest: string
      operationPhase: string
      schemaVersion: number
    }>
  >
  verifyPostSwitch: () => Promise<
    Readonly<{
      downtimeMilliseconds: number
      ipv6Only: boolean
      noDataLoss: boolean
      publicLikeSmokePassed: boolean
    }>
  >
  verifyReadinessAndAbortCriteria: () => Promise<
    Readonly<{
      backupFresh: boolean
      lagBytes: number
      replicationHealthy: boolean
      storageReady: boolean
      targetReady: boolean
    }>
  >
}>

const phases = [
  'executing',
  'target-provisioned',
  'replication-ready',
  'abort-criteria-passed',
  'candidate-smoke-passed',
  'final-wal-confirmed',
  'control-state-transferred',
  'target-promoted',
  'application-reconnected',
  'origin-cutover-complete',
  'post-switch-verified',
  'rollback-window-open',
] as const

function phaseIndex(phase: string) {
  const index = phases.indexOf(phase as (typeof phases)[number])
  if (index < 0) throw new Error(`Unsupported server-migration phase: ${phase}`)
  return index
}

function validateEvidence(details: Readonly<Record<string, unknown>>) {
  if ('finalWalLsn' in details) lsnSchema.parse(details.finalWalLsn)
  return details
}

export async function executeServerMigrationOperation(
  operation: InfrastructureOperation,
  lease: ServerMigrationLease,
  platform: ServerMigrationPlatform,
  options: Readonly<{ controlStatePath: string }>,
) {
  if (operation.operationType !== 'server-migration') {
    throw new Error('Server migration engine received a different operation type')
  }
  if (operation.status !== 'running') {
    throw new Error('Server migration operation must be running before execution')
  }
  const target = migrationTargetSchema.parse(operation.target)
  let phase = phaseIndex(operation.phase)
  let promoted = phase >= phaseIndex('target-promoted')
  const advance = (next: (typeof phases)[number], details: Readonly<Record<string, unknown>>) => {
    updateInfrastructureOperationPhase(
      options.controlStatePath,
      operation.id,
      lease,
      next,
      validateEvidence(details),
    )
    phase = phaseIndex(next)
  }

  try {
    if (phase < phaseIndex('target-provisioned')) {
      const evidence = provisionEvidenceSchema.parse(
        await platform.provisionTarget(target.inventoryHost),
      )
      if (!evidence.idempotent || evidence.stableIdentity !== target.inventoryHost) {
        throw new Error('Target provisioning or stable inventory identity verification failed')
      }
      advance('target-provisioned', evidence)
    }
    if (target.action === 'provision-only') return
    if (phase < phaseIndex('replication-ready')) {
      const evidence = replicationEvidenceSchema.parse(
        await platform.preparePhysicalReplication(target.inventoryHost),
      )
      advance('replication-ready', evidence)
    }
    if (phase < phaseIndex('abort-criteria-passed')) {
      const evidence = readinessEvidenceSchema.parse(
        await platform.verifyReadinessAndAbortCriteria(),
      )
      if (
        !evidence.backupFresh ||
        !evidence.replicationHealthy ||
        !evidence.storageReady ||
        !evidence.targetReady
      ) {
        throw new Error('A pre-promotion abort criterion failed')
      }
      advance('abort-criteria-passed', evidence)
    }
    if (phase < phaseIndex('candidate-smoke-passed')) {
      const evidence = candidateEvidenceSchema.parse(
        await platform.deployCandidateAndSmoke(target.inventoryHost),
      )
      if (!evidence.smokePassed) throw new Error('Target candidate smoke failed')
      advance('candidate-smoke-passed', evidence)
    }
    if (phase < phaseIndex('final-wal-confirmed')) {
      const evidence = finalWalEvidenceSchema.parse(await platform.quiesceWritesAndAwaitFinalWal())
      if (evidence.lagBytes !== 0 || evidence.sourceWriting) {
        throw new Error('Final WAL did not converge after write quiesce')
      }
      advance('final-wal-confirmed', evidence)
    }
    if (phase < phaseIndex('control-state-transferred')) {
      advance(
        'control-state-transferred',
        controlStateEvidenceSchema.parse(await platform.transferControlState()),
      )
    }
    if (phase < phaseIndex('target-promoted')) {
      const evidence = promotionEvidenceSchema.parse(await platform.promoteTarget())
      if (!evidence.promoted) throw new Error('Target promotion was not confirmed')
      promoted = true
      advance('target-promoted', evidence)
    }
    if (phase < phaseIndex('application-reconnected')) {
      const evidence = reconnectEvidenceSchema.parse(await platform.reconnectApplication())
      if (!evidence.ready) throw new Error('Application did not reconnect to the promoted target')
      advance('application-reconnected', evidence)
    }
    if (phase < phaseIndex('origin-cutover-complete')) {
      advance(
        'origin-cutover-complete',
        cutoverEvidenceSchema.parse(await platform.cutoverOrigin(target.inventoryHost)),
      )
    }
    if (phase < phaseIndex('post-switch-verified')) {
      const evidence = postSwitchEvidenceSchema.parse(await platform.verifyPostSwitch())
      if (!evidence.ipv6Only || !evidence.noDataLoss || !evidence.publicLikeSmokePassed) {
        throw new Error('Post-switch data or IPv6-only smoke verification failed')
      }
      advance('post-switch-verified', evidence)
    }
    if (phase < phaseIndex('rollback-window-open')) {
      const evidence = rollbackEvidenceSchema.parse(await platform.openNonWritingRollbackWindow())
      if (evidence.sourceWriting) throw new Error('Old source remained writable after cutover')
      advance('rollback-window-open', evidence)
    }
  } catch (error: unknown) {
    if (!promoted) {
      const reason = error instanceof Error ? error.message : 'unknown pre-promotion failure'
      await platform.abortBeforePromotion(reason)
    }
    throw error
  }
}
