import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it, vi } from 'vitest'

import type { ActorIdentity } from '../../src/control-plane/contracts'
import { infrastructureOperationRequestSchema } from '../../src/control-plane/contracts'
import {
  ControlStateConflictError,
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
  listControlAuditEvents,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import {
  executeServerMigrationOperation,
  type ServerMigrationPlatform,
} from '../../src/server-migration/engine'

const directories: string[] = []
const actor: ActorIdentity = {
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
  id: 'operator:phase17-test',
  kind: 'operator',
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

function operationFixture() {
  const directory = mkdtempSync(join(tmpdir(), 'phase17-engine-'))
  directories.push(directory)
  const path = join(directory, 'control.db')
  initializeControlState(path, 'test')
  const created = createInfrastructureOperation(
    path,
    {
      operationType: 'server-migration',
      reason: 'Phase 17 disposable migration rehearsal',
      target: { action: 'planned-migration', inventoryHost: 'phase17-target' },
    },
    actor,
    'phase17-engine-test',
  ).operation
  const claimed = claimNextInfrastructureOperation(path, 'deploy-agent:migration', 3_600)
  expect(claimed?.id).toBe(created.id)
  if (!claimed) throw new Error('Migration operation was not claimed')
  const lease = { fencingToken: claimed.fencingToken, leaseOwner: 'deploy-agent:migration' }
  return { lease, operation: startInfrastructureOperation(path, claimed.id, lease), path }
}

function fakePlatform(overrides: Partial<ServerMigrationPlatform> = {}): ServerMigrationPlatform {
  return {
    abortBeforePromotion: vi.fn(async () => undefined),
    cutoverOrigin: vi.fn(async () => ({ originHostname: 'ddns.tungchiahui.cn' })),
    deployCandidateAndSmoke: vi.fn(async () => ({
      candidateSha: 'a'.repeat(40),
      smokePassed: true,
    })),
    openNonWritingRollbackWindow: vi.fn(async () => ({ sourceWriting: false })),
    preparePhysicalReplication: vi.fn(async () => ({
      postgresMajor: 18,
      replicationMode: 'physical-streaming' as const,
    })),
    promoteTarget: vi.fn(async () => ({ promoted: true, timeline: 2 })),
    provisionTarget: vi.fn(async (inventoryHost) => ({
      idempotent: true,
      stableIdentity: inventoryHost,
    })),
    quiesceWritesAndAwaitFinalWal: vi.fn(async () => ({
      finalWalLsn: '0/5000000',
      lagBytes: 0,
      sourceWriting: false,
    })),
    reconnectApplication: vi.fn(async () => ({ ready: true })),
    transferControlState: vi.fn(async () => ({
      auditDigest: 'b'.repeat(64),
      operationPhase: 'final-wal-confirmed',
      schemaVersion: 5,
    })),
    verifyPostSwitch: vi.fn(async () => ({
      downtimeMilliseconds: 125,
      ipv6Only: true,
      noDataLoss: true,
      publicLikeSmokePassed: true,
    })),
    verifyReadinessAndAbortCriteria: vi.fn(async () => ({
      backupFresh: true,
      lagBytes: 0,
      replicationHealthy: true,
      storageReady: true,
      targetReady: true,
    })),
    ...overrides,
  }
}

describe('planned server migration engine', () => {
  it('persists every same-major migration phase and opens only a non-writing rollback window', async () => {
    const fixture = operationFixture()
    const platform = fakePlatform()

    await executeServerMigrationOperation(fixture.operation, fixture.lease, platform, {
      controlStatePath: fixture.path,
    })

    expect(getInfrastructureOperation(fixture.path, fixture.operation.id)?.phase).toBe(
      'rollback-window-open',
    )
    expect(
      listControlAuditEvents(fixture.path, fixture.operation.id)
        .filter((event) => event.eventType === 'infrastructure_operation_phase_changed')
        .map((event) => event.details.phase),
    ).toEqual([
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
    ])
    expect(platform.abortBeforePromotion).not.toHaveBeenCalled()
  })

  it('aborts before promotion when readiness cannot be proven', async () => {
    const fixture = operationFixture()
    const abortBeforePromotion = vi.fn(async () => undefined)
    const platform = fakePlatform({
      abortBeforePromotion,
      verifyReadinessAndAbortCriteria: vi.fn(async () => {
        throw new Error('replication lag did not converge')
      }),
    })

    await expect(
      executeServerMigrationOperation(fixture.operation, fixture.lease, platform, {
        controlStatePath: fixture.path,
      }),
    ).rejects.toThrow('replication lag did not converge')
    expect(abortBeforePromotion).toHaveBeenCalledWith('replication lag did not converge')
    expect(platform.promoteTarget).not.toHaveBeenCalled()
  })

  it('stops after idempotent provisioning when provision-only is requested', async () => {
    const fixture = operationFixture()
    const platform = fakePlatform()
    const provisionOnly = {
      ...fixture.operation,
      target: { action: 'provision-only', inventoryHost: 'phase17-target' },
    } as const

    await executeServerMigrationOperation(provisionOnly, fixture.lease, platform, {
      controlStatePath: fixture.path,
    })

    expect(getInfrastructureOperation(fixture.path, fixture.operation.id)?.phase).toBe(
      'target-provisioned',
    )
    expect(platform.preparePhysicalReplication).not.toHaveBeenCalled()
  })

  it('rejects a numeric address at the control contract boundary', () => {
    expect(
      infrastructureOperationRequestSchema.safeParse({
        operationType: 'server-migration',
        reason: 'numeric bootstrap addresses are not durable identity',
        target: { action: 'planned-migration', inventoryHost: '127.0.0.1' },
      }).success,
    ).toBe(false)
  })

  it('holds an exclusive infrastructure-operation window in both directions', () => {
    const migration = operationFixture()
    expect(() =>
      createInfrastructureOperation(
        migration.path,
        {
          operationType: 'restore',
          reason: 'must not overlap a server migration',
          target: { backupId: 'backup-phase17', environment: 'test' },
        },
        actor,
        'phase17-competing-restore',
      ),
    ).toThrow(ControlStateConflictError)

    const directory = mkdtempSync(join(tmpdir(), 'phase17-exclusive-'))
    directories.push(directory)
    const path = join(directory, 'control.db')
    initializeControlState(path, 'test')
    createInfrastructureOperation(
      path,
      {
        operationType: 'restore',
        reason: 'existing infrastructure operation',
        target: { backupId: 'backup-phase17', environment: 'test' },
      },
      actor,
      'phase17-existing-restore',
    )
    expect(() =>
      createInfrastructureOperation(
        path,
        {
          operationType: 'server-migration',
          reason: 'must wait for the infrastructure window',
          target: { action: 'planned-migration', inventoryHost: 'phase17-target' },
        },
        actor,
        'phase17-competing-migration',
      ),
    ).toThrow(ControlStateConflictError)
  })
})
