import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  type ActorIdentity,
  infrastructureOperationRequestSchema,
} from '../../src/control-plane/contracts'
import {
  checkpointRecoveryOperation,
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
  isPostgresMaintenanceActive,
  listControlAuditEvents,
  reconcileInfrastructureOperations,
  requeueDeploymentOperationForReconciliation,
  retryPostgresMaintenanceOperation,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import {
  type PostgresMaintenanceProgress,
  type PostgresMaintenanceTarget,
  postgresMaintenanceTargetSchema,
} from '../../src/maintenance/postgres-contracts'
import {
  executePostgresMaintenance,
  type PostgresMaintenancePlatform,
} from '../../src/maintenance/postgres-engine'
import { copyPostgresColdData, verifyPostgresColdData } from '../../src/maintenance/postgres-host'
import { parseSiteCommand } from '../../tools/site-command'

const directories: string[] = []
afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { recursive: true, force: true })
})
const actor: ActorIdentity = {
  id: 'operator:test',
  kind: 'operator',
  capabilities: ['infrastructure-operation:create'],
}
const target = {
  action: 'postgres-image-upgrade',
  environment: 'production',
  oldDigest: `sha256:${'a'.repeat(64)}`,
  newDigest: `sha256:${'b'.repeat(64)}`,
  candidateSha: 'c'.repeat(40),
  backupId: '20261113-000000F',
  mode: 'preflight',
} as const
function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'postgres-maintenance-'))
  directories.push(directory)
  const path = join(directory, 'control.db')
  initializeControlState(path, 'production')
  const platform = {
    prepare: vi.fn(async () => ({ imageId: 'old', topologyHash: 'reviewed' })),
    quiesce: vi.fn(async () => {}),
    drain: vi.fn(async () => ({ fingerprint: 'rows-and-ledger' })),
    stop: vi.fn(async () => {}),
    coldCopy: vi.fn(async () => 'd'.repeat(64)),
    verifyColdCopy: vi.fn(async () => {}),
    start: vi.fn(async (_digest: string) => {}),
    verify: vi.fn(async (_digest: string) => {}),
    backup: vi.fn(async () => ({ backupId: 'post-maintenance-full' })),
    resume: vi.fn(async () => {}),
  } satisfies PostgresMaintenancePlatform
  function create(input: PostgresMaintenanceTarget, key = crypto.randomUUID()) {
    return createInfrastructureOperation(
      path,
      {
        operationType: 'server-migration',
        reason: 'Audited database image maintenance',
        target: input,
      },
      actor,
      key,
    )
  }
  function claim() {
    const claimed = claimNextInfrastructureOperation(
      path,
      'host:test',
      3600,
      new Date(),
      ['server-migration'],
      'postgres-image-upgrade',
    )
    if (!claimed) throw new Error('Missing maintenance claim')
    const lease = { leaseOwner: 'host:test', fencingToken: claimed.fencingToken }
    return { operation: startInfrastructureOperation(path, claimed.id, lease), lease }
  }
  async function preflight() {
    create(target)
    const claimed = claim()
    return executePostgresMaintenance(path, claimed.operation, claimed.lease, platform)
  }
  async function executeTarget() {
    const planned = await preflight()
    return postgresMaintenanceTargetSchema.parse({
      ...target,
      mode: 'execute',
      preflightOperationId: planned.id,
      restoreEvidenceSha256: 'e'.repeat(64),
      confirmation: 'POSTGRES-IMAGE-UPGRADE-PRODUCTION',
    })
  }
  return { directory, path, platform, create, claim, preflight, executeTarget }
}

describe('audited PostgreSQL image maintenance', () => {
  it('validates closed identities, explicit confirmation and the operator boundary', () => {
    const f = fixture()
    expect(
      infrastructureOperationRequestSchema.parse({
        operationType: 'server-migration',
        reason: 'Review',
        target,
      }).target,
    ).toEqual(target)
    for (const invalid of [
      { ...target, newDigest: target.oldDigest },
      { ...target, oldDigest: 'latest' },
      { ...target, environment: 'local' },
      { ...target, shell: 'anything' },
      { ...target, mode: 'execute' },
    ])
      expect(postgresMaintenanceTargetSchema.safeParse(invalid).success).toBe(false)
    expect(() =>
      createInfrastructureOperation(
        f.path,
        { operationType: 'server-migration', reason: 'CI cannot maintain PostgreSQL', target },
        { ...actor, kind: 'github-actions' },
        'ci-maintenance-001',
      ),
    ).toThrow('operator')
  })
  it('parses the normal operator CLI with a stable replay key', () => {
    const command = parseSiteCommand([
      'postgres-image',
      'preflight',
      '--old-digest',
      target.oldDigest,
      '--new-digest',
      target.newDigest,
      '--candidate-sha',
      target.candidateSha,
      '--backup-id',
      target.backupId,
      '--reason',
      'Approved preflight',
      '--idempotency-key',
      'postgres-preflight-001',
    ])
    expect(command.kind).toBe('postgres-image-maintenance')
    expect(
      parseSiteCommand([
        'postgres-image',
        'retry',
        '--operation-id',
        crypto.randomUUID(),
        '--reason',
        'Approved compensation',
        '--confirm',
        'POSTGRES-MAINTENANCE-RETRY',
        '--idempotency-key',
        'postgres-retry-001',
      ]).kind,
    ).toBe('postgres-image-maintenance-retry')

    expect(() =>
      parseSiteCommand(['postgres-image', 'preflight', '--old-digest', 'latest']),
    ).toThrow()
  })
  it('preflights without pausing consumers and deduplicates the accepted request', async () => {
    const f = fixture()
    const first = f.create(target, 'maintenance-replay-001')
    expect(f.create(target, 'maintenance-replay-001').operation.id).toBe(first.operation.id)
    const claimed = f.claim()
    const result = await executePostgresMaintenance(
      f.path,
      claimed.operation,
      claimed.lease,
      f.platform,
    )
    expect(result.status).toBe('completed')
    expect(f.platform.quiesce).not.toHaveBeenCalled()
    expect(f.platform.start).not.toHaveBeenCalled()
    expect(isPostgresMaintenanceActive(f.path)).toBe(false)
  })
  it('serializes all infrastructure work and blocks database control writes through interruption', async () => {
    const f = fixture(),
      execute = await f.executeTarget()
    f.create(execute)
    expect(isPostgresMaintenanceActive(f.path)).toBe(true)
    expect(() =>
      createInfrastructureOperation(
        f.path,
        {
          operationType: 'recovery',
          reason: 'conflicting backup',
          target: { action: 'backup', environment: 'production', backupType: 'full' },
        },
        actor,
        'backup-competition',
      ),
    ).toThrow()
    const { operation, lease } = f.claim()
    expect(claimNextInfrastructureOperation(f.path, 'other', 60)).toBeNull()
    reconcileInfrastructureOperations(f.path, new Date(Date.now() + 3601_000))
    expect(claimNextInfrastructureOperation(f.path, 'other', 60)).toBeNull()
    requeueDeploymentOperationForReconciliation(f.path, operation.id)
    const resumed = f.claim()
    await expect(executePostgresMaintenance(f.path, operation, lease, f.platform)).rejects.toThrow(
      'lease',
    )
    expect(f.platform.quiesce).not.toHaveBeenCalled()
    await executePostgresMaintenance(f.path, resumed.operation, resumed.lease, f.platform)
    expect(isPostgresMaintenanceActive(f.path)).toBe(false)
  })
  it('completes switch, cold-copy evidence, backup and original consumer restoration', async () => {
    const f = fixture()
    f.create(await f.executeTarget())
    const claimed = f.claim()
    const result = await executePostgresMaintenance(
      f.path,
      claimed.operation,
      claimed.lease,
      f.platform,
    )
    expect(result.status).toBe('completed')
    expect(result.result?.phase).toBe('verified')
    expect(result.result?.coldCopySha256).toBe('d'.repeat(64))
    expect(f.platform.start).toHaveBeenCalledExactlyOnceWith(target.newDigest)
    expect(f.platform.backup).toHaveBeenCalledTimes(1)
    expect(
      listControlAuditEvents(f.path, result.id).filter(
        (event) => event.eventType === 'postgres_maintenance_checkpoint',
      ).length,
    ).toBeGreaterThan(8)
  })
  it('refuses drift before entering maintenance', async () => {
    const f = fixture(),
      execute = await f.executeTarget()
    f.platform.prepare.mockResolvedValue({ imageId: 'changed', topologyHash: 'reviewed' })
    f.create(execute)
    const claimed = f.claim()
    const result = await executePostgresMaintenance(
      f.path,
      claimed.operation,
      claimed.lease,
      f.platform,
    )
    expect(result.phase).toBe('postgres-image-rejected')
    expect(f.platform.quiesce).not.toHaveBeenCalled()
  })
  it.each([
    'quiesce',
    'drain',
    'stop',
    'coldCopy',
    'verifyColdCopy',
    'start',
    'verify',
    'backup',
    'resume',
  ] as const)('recovers a failure in %s with the original service state', async (step) => {
    const f = fixture()
    f.create(await f.executeTarget())
    const claimed = f.claim()
    f.platform[step].mockRejectedValueOnce(new Error('Injected failure'))
    const result = await executePostgresMaintenance(
      f.path,
      claimed.operation,
      claimed.lease,
      f.platform,
    )
    expect(result.status).toBe('failed')
    expect(f.platform.resume).toHaveBeenCalled()
    if (!['quiesce', 'drain'].includes(step))
      expect(f.platform.start).toHaveBeenLastCalledWith(target.oldDigest)
  })
  it('keeps maintenance and exclusivity when both candidate and old image verification fail', async () => {
    const f = fixture()
    f.create(await f.executeTarget())
    const claimed = f.claim()
    f.platform.verify.mockRejectedValue(
      new Error('Corruption requires separately authorized recovery'),
    )
    const result = await executePostgresMaintenance(
      f.path,
      claimed.operation,
      claimed.lease,
      f.platform,
    )
    expect(result.status).toBe('needs-attention')
    expect(result.result?.phase).toBe('recovery-required')
    expect(f.platform.resume).not.toHaveBeenCalled()
    expect(isPostgresMaintenanceActive(f.path)).toBe(true)
    expect(() => f.create(target)).toThrow()
  })
  it.each([true, false])(
    'explicitly retries compensation after a recoverable held failure, drained=%s',
    async (drained) => {
      const f = fixture()
      f.create(await f.executeTarget())
      const claimed = f.claim()
      if (drained) f.platform.verify.mockRejectedValue(new Error('Temporary verification outage'))
      else {
        f.platform.quiesce.mockRejectedValueOnce(new Error('Temporary host config outage'))
        f.platform.resume.mockRejectedValueOnce(new Error('Temporary host config outage'))
      }
      const held = await executePostgresMaintenance(
        f.path,
        claimed.operation,
        claimed.lease,
        f.platform,
      )
      expect(held.status).toBe('needs-attention')
      const approval = {
        confirmation: 'POSTGRES-MAINTENANCE-RETRY',
        reason: 'Approved compensation after repairing host availability',
      }
      expect(() =>
        retryPostgresMaintenanceOperation(
          f.path,
          held.id,
          { ...actor, kind: 'service' },
          approval,
          'maintenance-retry-001',
        ),
      ).toThrow('operator')
      const resumed = retryPostgresMaintenanceOperation(
        f.path,
        held.id,
        actor,
        approval,
        'maintenance-retry-001',
      )
      expect(resumed.status).toBe('queued')
      expect(
        retryPostgresMaintenanceOperation(f.path, held.id, actor, approval, 'maintenance-retry-001')
          .id,
      ).toBe(held.id)
      expect(() =>
        retryPostgresMaintenanceOperation(
          f.path,
          held.id,
          actor,
          { ...approval, reason: 'Different approval' },
          'maintenance-retry-001',
        ),
      ).toThrow('key')
      f.platform.verify.mockResolvedValue()
      const retry = f.claim()
      const result = await executePostgresMaintenance(
        f.path,
        retry.operation,
        retry.lease,
        f.platform,
      )
      expect(result.phase).toBe('postgres-image-reverted')
      expect(f.platform.start).toHaveBeenLastCalledWith(target.oldDigest)
      expect(isPostgresMaintenanceActive(f.path)).toBe(false)
    },
  )

  it('hands a held window to an explicitly approved restore and keeps application writes closed', async () => {
    const f = fixture()
    f.create(await f.executeTarget())
    const claimed = f.claim()
    f.platform.verify.mockRejectedValue(new Error('Integrity failure'))
    const held = await executePostgresMaintenance(
      f.path,
      claimed.operation,
      claimed.lease,
      f.platform,
    )
    expect(held.status).toBe('needs-attention')
    expect(() => requeueDeploymentOperationForReconciliation(f.path, held.id)).toThrow()
    const restore = {
      operationType: 'restore' as const,
      reason: 'Separately authorized exact recovery point',
      target: {
        environment: 'production' as const,
        confirmation: 'RESTORE-PRODUCTION',
        selector: { backupId: target.backupId },
        maintenanceOperationId: held.id,
      },
    }
    const accepted = createInfrastructureOperation(
      f.path,
      restore,
      actor,
      'maintenance-restore-handoff',
    )
    expect(getInfrastructureOperation(f.path, held.id)?.status).toBe('failed')
    expect(getInfrastructureOperation(f.path, held.id)?.result).toEqual(held.result)
    expect(isPostgresMaintenanceActive(f.path)).toBe(true)
    expect(
      createInfrastructureOperation(f.path, restore, actor, 'maintenance-restore-handoff').operation
        .id,
    ).toBe(accepted.operation.id)
    const restoreClaim = claimNextInfrastructureOperation(
      f.path,
      'recovery:test',
      3600,
      new Date(),
      ['restore'],
    )
    if (!restoreClaim) throw new Error('Held maintenance blocked its authorized restore')
    finishInfrastructureOperation(
      f.path,
      restoreClaim.id,
      { leaseOwner: 'recovery:test', fencingToken: restoreClaim.fencingToken },
      { status: 'completed', phase: 'recovery-verified' },
    )
    expect(isPostgresMaintenanceActive(f.path)).toBe(true)
    expect(() =>
      createInfrastructureOperation(
        f.path,
        {
          operationType: 'deploy',
          reason: 'Still held',
          target: { gitSha: target.candidateSha, imageDigest: target.newDigest },
        },
        actor,
        'held-deployment-001',
      ),
    ).toThrow('recovery')
    f.platform.verify.mockResolvedValue()
    f.create(await f.executeTarget())
    const resumed = f.claim()
    expect(
      (await executePostgresMaintenance(f.path, resumed.operation, resumed.lease, f.platform))
        .status,
    ).toBe('completed')
    expect(isPostgresMaintenanceActive(f.path)).toBe(false)
    expect(
      listControlAuditEvents(f.path, held.id).some(
        (event) => event.eventType === 'postgres_maintenance_restore_handoff',
      ),
    ).toBe(true)
  })

  it.each([
    'quiescing',
    'drained',
    'stopped',
    'cold-copy-verified',
    'candidate-starting',
    'candidate-verified',
    'backup-verified',
    'resuming',
    'verified',
    'rolling-back',
    'rollback-verified',
  ] as const)('resumes the durable %s checkpoint', async (phase) => {
    const f = fixture()
    f.create(await f.executeTarget())
    const claimed = f.claim()
    const progress: PostgresMaintenanceProgress = {
      phase,
      baseline: { imageId: 'old', topologyHash: 'reviewed' },
      database: { fingerprint: 'rows-and-ledger' },
      coldCopySha256: 'd'.repeat(64),
      startedAt: new Date().toISOString(),
      backupStartedAt: new Date().toISOString(),
    }
    checkpointRecoveryOperation(
      f.path,
      claimed.operation.id,
      claimed.lease,
      phase,
      progress,
      'postgres-image-upgrade',
    )
    const operation = getInfrastructureOperation(f.path, claimed.operation.id)
    if (!operation) throw new Error('Missing persisted operation')
    const result = await executePostgresMaintenance(f.path, operation, claimed.lease, f.platform)
    expect(result.status).toBe(phase.startsWith('roll') ? 'failed' : 'completed')
    expect(f.platform.prepare).toHaveBeenCalledTimes(1)
    if (
      [
        'candidate-starting',
        'candidate-verified',
        'backup-verified',
        'resuming',
        'verified',
      ].includes(phase)
    )
      expect(f.platform.coldCopy).not.toHaveBeenCalled()
    if (['backup-verified', 'resuming', 'verified'].includes(phase))
      expect(f.platform.backup).not.toHaveBeenCalled()
  })
  it('read-verifies a durable cold copy and refuses live or symlinked data', () => {
    const f = fixture(),
      source = join(f.directory, 'postgres'),
      destination = join(f.directory, 'cold')
    mkdirSync(join(source, '18/docker/empty'), { recursive: true })
    writeFileSync(join(source, '18/docker/PG_VERSION'), '18')
    const hash = copyPostgresColdData(source, destination)
    expect(copyPostgresColdData(source, destination)).toBe(hash)
    writeFileSync(join(source, '18/docker/PG_VERSION'), 'changed-live-data')
    expect(() => verifyPostgresColdData(destination, hash)).not.toThrow()
    writeFileSync(join(source, '18/docker/PG_VERSION'), '18')

    expect(readFileSync(join(destination, 'data/18/docker/PG_VERSION'), 'utf8')).toBe('18')
    writeFileSync(join(destination, 'data/18/docker/PG_VERSION'), 'corrupt')
    expect(() => copyPostgresColdData(source, destination)).toThrow('verification')
    writeFileSync(join(source, '18/docker/postmaster.pid'), '1')
    expect(() => copyPostgresColdData(source, destination)).toThrow('stopped')
    rmSync(join(source, '18/docker/postmaster.pid'))
    symlinkSync('/tmp', join(source, '18/docker/external'))
    expect(() => copyPostgresColdData(source, destination)).toThrow('regular local')
  })
})
