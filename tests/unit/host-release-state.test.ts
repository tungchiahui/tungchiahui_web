import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import {
  claimNextInfrastructureOperation,
  createConsistentControlStateSnapshot,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
  readControlState,
  reconcileInfrastructureOperations,
  requeueDeploymentOperationForReconciliation,
  restoreControlStateSnapshot,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import {
  acquireHostExecutor,
  checkpointHostRelease,
  commitHostGeneration,
  initializeHostReleaseState,
  readHostBootstrapBaseline,
  readHostCheckpoint,
  readHostGeneration,
  readHostRuntime,
  recordHostBootstrapBaseline,
  releaseHostExecutor,
  stageHostGeneration,
} from '../../src/host-release/state'

const directories: string[] = []
afterEach(() => {
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})
const actor: ActorIdentity = {
  id: 'operator:test',
  kind: 'operator',
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
}
const release = {
  sha: 'a'.repeat(40),
  webDigest: `sha256:${'b'.repeat(64)}`,
  serviceDigest: `sha256:${'c'.repeat(64)}`,
  recoveryDigest: `sha256:${'d'.repeat(64)}`,
}
const before = {
  hostSha: null,
  hostPreviousSha: null,
  deploymentPollingEnabled: false,
  sha: 'e'.repeat(40),
  webDigest: `sha256:${'f'.repeat(64)}`,
  webImage: `ghcr.io/example/site:${'e'.repeat(40)}`,
  serviceImage: `ghcr.io/example/site-service:${'e'.repeat(40)}`,
  recoveryImage: `ghcr.io/example/site-recovery:${'e'.repeat(40)}`,
  postgresImage: `ghcr.io/example/postgres:${'e'.repeat(40)}`,
  files: {
    'compose.yaml': 'compose',
    'openresty.conf': 'proxy',
    'pgbouncer.ini': 'pool',
    'pgbackrest.conf': 'backup',
  },
  backupScheduleEnabled: true,
  maintenanceScheduleEnabled: false,
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'host-release-'))
  directories.push(root)
  const path = join(root, 'control.db')
  initializeControlState(path, 'test')
  initializeHostReleaseState(path)
  return { path, root }
}
function deploy(path: string) {
  return createInfrastructureOperation(
    path,
    {
      operationType: 'deploy',
      reason: 'Complete release test',
      target: { gitSha: release.sha, imageDigest: release.webDigest },
    },
    actor,
    'host-release-unit',
  ).operation
}

describe('durable server release component', () => {
  it('retains the audited pre-bootstrap Web identity through backup/restore and rejects baseline replacement', () => {
    const { path, root } = fixture()
    const bootstrap = createInfrastructureOperation(
      path,
      {
        operationType: 'server-migration',
        reason: 'Bootstrap lease fixture',
        target: { action: 'provision-only', inventoryHost: 'ddns.tungchiahui.cn' },
      },
      { ...actor, id: 'server-console:bootstrap' },
      'host-bootstrap:test',
    ).operation
    const owner = 'deploy-agent:bootstrap:test'
    const claimed = claimNextInfrastructureOperation(path, owner, 3600, new Date(), [
      'server-migration',
    ])
    if (!claimed) throw new Error('Missing bootstrap claim')
    const lease = { leaseOwner: owner, fencingToken: claimed.fencingToken }
    startInfrastructureOperation(path, bootstrap.id, lease)
    recordHostBootstrapBaseline(path, before, bootstrap.id, lease)
    expect(() =>
      recordHostBootstrapBaseline(path, { ...before, sha: '0'.repeat(40) }, bootstrap.id, lease),
    ).toThrow()
    const snapshot = join(root, 'baseline.db')
    createConsistentControlStateSnapshot(path, snapshot)
    const restored = join(root, 'baseline-restored.db')
    restoreControlStateSnapshot(snapshot, restored, 'test')
    expect(readHostBootstrapBaseline(restored)).toEqual({
      sha: before.sha,
      digest: before.webDigest,
    })
    finishInfrastructureOperation(path, bootstrap.id, lease, {
      status: 'completed',
      phase: 'host-bootstrap-verified',
    })
    expect(() => recordHostBootstrapBaseline(path, before, bootstrap.id, lease)).toThrow()
  })

  it('preserves core schema compatibility and generations in the existing backup and restore engine', () => {
    const { path, root } = fixture()
    stageHostGeneration(path, release)
    commitHostGeneration(path, release.sha)
    const next = { ...release, sha: '1'.repeat(40), recoveryDigest: `sha256:${'2'.repeat(64)}` }
    stageHostGeneration(path, next)
    commitHostGeneration(path, next.sha)
    const snapshot = join(root, 'snapshot.db')
    createConsistentControlStateSnapshot(path, snapshot)
    const restored = join(root, 'restored.db')
    restoreControlStateSnapshot(snapshot, restored, 'test')
    expect(readControlState(restored).schemaVersion).toBe(8)
    expect(readHostRuntime(restored)).toEqual({
      current_sha: next.sha,
      previous_sha: release.sha,
      pending_sha: null,
    })
    expect(readHostGeneration(restored, release.sha)).toEqual(release)
  })
  it('refuses image replacement under the same SHA and preserves the current generation on rejected commit', () => {
    const { path } = fixture()
    stageHostGeneration(path, release)
    expect(() =>
      stageHostGeneration(path, { ...release, serviceDigest: `sha256:${'0'.repeat(64)}` }),
    ).toThrow('identity changed')
    expect(() => commitHostGeneration(path, '1'.repeat(40))).toThrow('pending candidate')
    expect(readHostRuntime(path).current_sha).toBeNull()
    commitHostGeneration(path, release.sha)
    stageHostGeneration(path, release)
    commitHostGeneration(path, release.sha)
    expect(readHostRuntime(path).previous_sha).toBeNull()
  })
  it('serializes host releases with database recovery and fences an interrupted executor before replay', () => {
    const { path } = fixture()
    const operation = deploy(path)
    createInfrastructureOperation(
      path,
      {
        operationType: 'recovery',
        reason: 'Serialized backup',
        target: { action: 'backup', backupType: 'full', environment: 'test' },
      },
      actor,
      'backup-test',
    )
    const time = new Date('2030-01-01T00:00:00Z')
    expect(acquireHostExecutor(path, 'deploy-agent:host:old', time)).toBe(true)
    const claimed = claimNextInfrastructureOperation(path, 'deploy-agent:host:old', 3600, time, [
      'deploy',
    ])
    if (!claimed) throw new Error('Missing claim')
    const lease = { leaseOwner: claimed.leaseOwner ?? '', fencingToken: claimed.fencingToken }
    startInfrastructureOperation(path, operation.id, lease, time)
    expect(
      claimNextInfrastructureOperation(path, 'deploy-agent:recovery', 3600, time, ['recovery']),
    ).toBeNull()
    expect(
      acquireHostExecutor(path, 'deploy-agent:host:new', new Date(time.getTime() + 10_000)),
    ).toBe(false)
    const takeover = new Date(time.getTime() + 31_000)
    expect(acquireHostExecutor(path, 'deploy-agent:host:new', takeover)).toBe(true)
    expect(() =>
      checkpointHostRelease(path, operation.id, lease, release, before, 'web-verified'),
    ).toThrow('stale')
    reconcileInfrastructureOperations(path, takeover)
    expect(getInfrastructureOperation(path, operation.id)?.status).toBe('needs-attention')
    requeueDeploymentOperationForReconciliation(path, operation.id, takeover)
    const reclaimed = claimNextInfrastructureOperation(
      path,
      'deploy-agent:host:new',
      3600,
      takeover,
      ['deploy'],
    )
    expect(reclaimed?.fencingToken).toBeGreaterThan(claimed.fencingToken)
  })
  it('retains original rollback evidence through retries and snapshots, rejecting an obsolete fence', () => {
    const { path, root } = fixture()
    const operation = deploy(path)
    const owner = 'deploy-agent:host:test'
    acquireHostExecutor(path, owner)
    const claimed = claimNextInfrastructureOperation(path, owner, 3600, new Date(), ['deploy'])
    if (!claimed) throw new Error('Missing claim')
    const lease = { leaseOwner: owner, fencingToken: claimed.fencingToken }
    startInfrastructureOperation(path, operation.id, lease)
    checkpointHostRelease(path, operation.id, lease, release, before, 'prepared')
    checkpointHostRelease(
      path,
      operation.id,
      lease,
      release,
      { ...before, sha: '0'.repeat(40) },
      'web-verified',
    )
    expect(readHostCheckpoint(path, operation.id)?.before.sha).toBe(before.sha)
    const snapshot = join(root, 'checkpoint.db')
    createConsistentControlStateSnapshot(path, snapshot)
    expect(readHostCheckpoint(snapshot, operation.id)?.phase).toBe('web-verified')
    releaseHostExecutor(path, owner)
    expect(() =>
      checkpointHostRelease(path, operation.id, lease, release, before, 'committed'),
    ).toThrow('stale')
  })
})
