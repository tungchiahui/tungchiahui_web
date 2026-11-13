import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import {
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
  initializeDeploymentRuntime,
  listControlAuditEvents,
  listInfrastructureOperations,
  reconcileInfrastructureOperations,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import { hostSettingsSchema } from '../../src/host-release/contracts'
import {
  captureHostConvergence,
  executeWebJob,
  restoreHostConvergence,
} from '../../src/host-release/coordinator'
import {
  hostTopologyConfigStale,
  inspectHostContainer,
  readHostEnvironment,
} from '../../src/host-release/provision'
import { recoverHostRelease } from '../../src/host-release/recovery'
import {
  type ConvergenceSnapshot,
  checkpointHostRelease,
  commitHostGeneration,
  initializeHostReleaseState,
  readHostCheckpoint,
  stageHostGeneration,
} from '../../src/host-release/state'

vi.mock('../../src/host-release/coordinator', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/host-release/coordinator')>()),
  captureHostConvergence: vi.fn(),
  executeWebJob: vi.fn(),
  restoreHostConvergence: vi.fn(),
}))
vi.mock('../../src/host-release/provision', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../../src/host-release/provision')>()),
  hostTopologyConfigStale: vi.fn(),
  inspectHostContainer: vi.fn(),
  readHostEnvironment: vi.fn(),
}))

const directories: string[] = []
const actor: ActorIdentity = {
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
  id: 'operator:recovery-test',
  kind: 'operator',
}
const baseline = {
  sha: 'a'.repeat(40),
  webDigest: `sha256:${'b'.repeat(64)}`,
  serviceDigest: `sha256:${'c'.repeat(64)}`,
  recoveryDigest: `sha256:${'d'.repeat(64)}`,
}
const candidate = { ...baseline, sha: 'e'.repeat(40), webDigest: `sha256:${'f'.repeat(64)}` }
const before: ConvergenceSnapshot = {
  backupScheduleEnabled: true,
  deploymentPollingEnabled: false,
  files: {
    'compose.yaml': 'compose',
    'openresty.conf': 'proxy',
    'pgbackrest.conf': 'backup',
    'pgbouncer.ini': 'pool',
  },
  hostPreviousSha: null,
  hostSha: baseline.sha,
  maintenanceScheduleEnabled: true,
  postgresImage: `ghcr.io/example/postgres@${baseline.webDigest}`,
  recoveryImage: `ghcr.io/example/site-recovery@${baseline.recoveryDigest}`,
  serviceImage: `ghcr.io/example/site-service@${baseline.serviceDigest}`,
  sha: baseline.sha,
  webDigest: baseline.webDigest,
  webImage: `ghcr.io/example/site@${baseline.webDigest}`,
}

beforeEach(() => {
  vi.resetAllMocks()
  vi.spyOn(process, 'getuid').mockReturnValue(0)
  vi.spyOn(console, 'log').mockImplementation(() => {})
  vi.spyOn(console, 'error').mockImplementation(() => {})
  vi.mocked(captureHostConvergence).mockReturnValue(before)
  vi.mocked(readHostEnvironment).mockReturnValue({
    TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY: 'ghcr.io/example/site',
  })
  vi.mocked(hostTopologyConfigStale).mockReturnValue({ openresty: false, pgbouncer: false })
  vi.mocked(inspectHostContainer).mockImplementation((name) => ({
    Config: { Image: before.serviceImage, Labels: {} },
    imageId: `sha256:${'a'.repeat(64)}`,
    Id: name,
    State: { Health: { Status: 'healthy' }, Running: true, StartedAt: '2100-01-01T00:00:00Z' },
    deploymentPollingEnabled: false,
    startedAt: '2100-01-01T00:00:00Z',
  }))
})

afterEach(() => {
  vi.restoreAllMocks()
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'host-recovery-execution-'))
  directories.push(root)
  const settings = hostSettingsSchema.parse({
    configRoot: join(root, 'etc'),
    dataRoot: join(root, 'var'),
    manageSystemd: false,
  })
  mkdirSync(join(settings.dataRoot, 'control-state'), { recursive: true })
  mkdirSync(join(settings.configRoot, 'secrets'), { recursive: true })
  for (const [file, contents] of Object.entries(before.files))
    writeFileSync(join(settings.configRoot, file), contents)
  writeFileSync(join(settings.configRoot, 'secrets/pgbouncer-userlist.txt'), 'synthetic')
  const path = join(settings.dataRoot, 'control-state/control.db')
  initializeControlState(path, 'production')
  initializeHostReleaseState(path)
  initializeDeploymentRuntime(path, { digest: baseline.webDigest, sha: baseline.sha, slot: 'blue' })
  stageHostGeneration(path, baseline)
  commitHostGeneration(path, baseline.sha)
  const original = createInfrastructureOperation(
    path,
    {
      operationType: 'deploy',
      reason: 'Synthetic failed host release',
      target: { gitSha: candidate.sha, imageDigest: candidate.webDigest },
    },
    actor,
    'synthetic-release',
  ).operation
  const claim = claimNextInfrastructureOperation(path, 'fixture', 3600)
  if (!claim) throw new Error('Missing fixture claim')
  const lease = { fencingToken: claim.fencingToken, leaseOwner: 'fixture' }
  startInfrastructureOperation(path, original.id, lease)
  checkpointHostRelease(path, original.id, lease, candidate, before, 'compensating')
  finishInfrastructureOperation(path, original.id, lease, {
    errorSummary: 'Synthetic compensation failure',
    phase: 'host-release-recovery-required',
    status: 'failed',
  })
  return { original: getInfrastructureOperation(path, original.id) ?? original, path, settings }
}

describe('host recovery execution with durable SQLite state', () => {
  it('checks the baseline without creating operations, audits or host changes', async () => {
    const { original, path, settings } = fixture()
    const operations = listInfrastructureOperations(path)
    const audits = listControlAuditEvents(path)
    expect(await recoverHostRelease(settings, original.id, { checkOnly: true })).toMatchObject({
      checkOnly: true,
      convergenceDifferences: [],
      webRollbackRequired: false,
    })
    expect(listInfrastructureOperations(path)).toEqual(operations)
    expect(listControlAuditEvents(path)).toEqual(audits)
    expect(restoreHostConvergence).not.toHaveBeenCalled()
    expect(executeWebJob).not.toHaveBeenCalled()
  })

  it('reuses a successful retry after a failed first recovery and preserves the failure evidence', async () => {
    const { original, path, settings } = fixture()
    vi.mocked(restoreHostConvergence).mockImplementationOnce(() => {
      throw new Error('Synthetic host convergence failure')
    })
    await expect(recoverHostRelease(settings, original.id)).rejects.toThrow('Synthetic host')
    const failed = listInfrastructureOperations(path, { operationTypes: ['server-migration'] })[0]
    expect(failed).toMatchObject({ phase: 'host-release-recovery-failed', status: 'failed' })

    const recovered = await recoverHostRelease(settings, original.id)
    expect(recovered).toMatchObject({ phase: 'host-release-recovered', status: 'completed' })
    const operations = listInfrastructureOperations(path)
    const audits = listControlAuditEvents(path)
    expect(await recoverHostRelease(settings, original.id)).toEqual(recovered)
    expect(listInfrastructureOperations(path)).toEqual(operations)
    expect(listControlAuditEvents(path)).toEqual(audits)
    expect(restoreHostConvergence).toHaveBeenCalledTimes(2)
    expect(executeWebJob).toHaveBeenCalledTimes(1)
    expect(getInfrastructureOperation(path, original.id)).toEqual(original)
    expect(readHostCheckpoint(path, original.id)?.phase).toBe('compensating')
    expect(listControlAuditEvents(path, original.id).map((event) => event.eventType)).toEqual(
      expect.arrayContaining(['host_release_recovery_failed', 'host_release_recovery_verified']),
    )
  })

  it('refuses concurrent infrastructure work before applying host changes', async () => {
    const { original, path, settings } = fixture()
    createInfrastructureOperation(
      path,
      {
        operationType: 'recovery',
        reason: 'Concurrent backup',
        target: { action: 'backup', backupType: 'full', environment: 'test' },
      },
      actor,
      'concurrent-backup',
    )
    await expect(recoverHostRelease(settings, original.id)).rejects.toThrow('exclusive window')
    expect(restoreHostConvergence).not.toHaveBeenCalled()
    expect(listInfrastructureOperations(path, { operationTypes: ['server-migration'] })).toEqual([])
  })

  it('refuses a completed receipt when its host convergence has drifted', async () => {
    const { original, path, settings } = fixture()
    await recoverHostRelease(settings, original.id)
    const operations = listInfrastructureOperations(path)
    vi.mocked(captureHostConvergence).mockReturnValue({
      ...before,
      serviceImage: before.recoveryImage,
    })
    await expect(recoverHostRelease(settings, original.id)).rejects.toThrow(
      'no longer matches its baseline',
    )
    expect(listInfrastructureOperations(path)).toEqual(operations)
    expect(restoreHostConvergence).toHaveBeenCalledTimes(1)
  })

  it('revalidates the baseline after obtaining its exclusive claim', async () => {
    const { original, path, settings } = fixture()
    vi.mocked(readHostEnvironment).mockImplementationOnce(() => {
      stageHostGeneration(path, candidate)
      commitHostGeneration(path, candidate.sha)
      return { TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY: 'ghcr.io/example/site' }
    })
    await expect(recoverHostRelease(settings, original.id)).rejects.toThrow('refused after claim')
    expect(restoreHostConvergence).not.toHaveBeenCalled()
  })

  it('resumes an expired recovery with a new fence and an audit record', async () => {
    const { original, path, settings } = fixture()
    const recovery = createInfrastructureOperation(
      path,
      {
        operationType: 'server-migration',
        reason: `Recover failed host release ${original.id}`,
        target: { action: 'host-release-recovery', originalOperationId: original.id },
      },
      { ...actor, id: 'server-console:host-recovery' },
      `host-release-recovery:${original.id}`,
    ).operation
    const expiredAt = new Date(Date.now() - 60_000)
    const claim = claimNextInfrastructureOperation(path, 'expired-recovery', 1, expiredAt)
    if (!claim) throw new Error('Missing interrupted recovery claim')
    startInfrastructureOperation(
      path,
      recovery.id,
      { fencingToken: claim.fencingToken, leaseOwner: 'expired-recovery' },
      expiredAt,
    )
    reconcileInfrastructureOperations(path)
    expect(getInfrastructureOperation(path, recovery.id)?.status).toBe('needs-attention')
    const recovered = await recoverHostRelease(settings, original.id)
    expect(recovered).toMatchObject({ id: recovery.id, status: 'completed' })
    expect(getInfrastructureOperation(path, recovery.id)?.fencingToken).toBeGreaterThan(
      claim.fencingToken,
    )
    expect(() =>
      finishInfrastructureOperation(
        path,
        recovery.id,
        { fencingToken: claim.fencingToken, leaseOwner: 'expired-recovery' },
        { status: 'failed', phase: 'stale-worker' },
      ),
    ).toThrow('lease is stale')
    expect(listControlAuditEvents(path, recovery.id).map((event) => event.eventType)).toContain(
      'host_release_recovery_requeued',
    )
  })
})
