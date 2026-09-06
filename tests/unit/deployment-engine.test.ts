import { randomUUID } from 'node:crypto'
import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ActorIdentity } from '../../src/control-plane/contracts'
import {
  claimNextInfrastructureOperation,
  commitDeploymentCutover,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
  initializeDeploymentRuntime,
  readDeploymentState,
  reconcileInfrastructureOperations,
  recordDeploymentCutoverIntent,
  requeueDeploymentOperationForReconciliation,
  startInfrastructureOperation,
  updateInfrastructureOperationPhase,
} from '../../src/control-plane/control-state'
import {
  type DeploymentPlatform,
  type DeploymentRelease,
  type DeploymentSmokeEvidence,
  executeDeploymentOperation,
  hasFreshRecoverableBackup,
} from '../../src/deployment/engine'

const directories: string[] = []
const actor: ActorIdentity = {
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
  id: 'operator:phase14-test',
  kind: 'operator',
}
const blue: DeploymentRelease = {
  digest: `sha256:${'a'.repeat(64)}`,
  sha: 'a'.repeat(40),
  slot: 'blue',
}
const green: DeploymentRelease = {
  digest: `sha256:${'b'.repeat(64)}`,
  sha: 'b'.repeat(40),
  slot: 'green',
}
const smoke: DeploymentSmokeEvidence = {
  article: 'pass',
  asset: 'pass',
  health: 'pass',
  homepage: 'pass',
  locale: 'pass',
  ready: 'pass',
  searchApi: 'pass',
  searchPage: 'pass',
  version: 'pass',
}

afterEach(() => {
  for (const directory of directories.splice(0)) rmSync(directory, { force: true, recursive: true })
})

function statePath() {
  const directory = mkdtempSync(join(tmpdir(), 'phase14-deployment-'))
  directories.push(directory)
  const path = join(directory, 'control.db')
  initializeControlState(path, 'test')
  return path
}

class FakePlatform implements DeploymentPlatform {
  activeRelease = blue
  trafficSlot: 'blue' | 'green' = 'blue'
  readonly calls: string[] = []
  failAt: string | null = null

  private call(name: string) {
    this.calls.push(name)
    if (this.failAt === name) throw new Error(`injected ${name} failure`)
  }

  async cleanupFailedCandidate(release: DeploymentRelease) {
    this.call(`cleanup:${release.slot}`)
  }
  async inspectActiveRelease() {
    this.call('inspect-active')
    return this.activeRelease
  }
  async inspectTrafficSlot() {
    this.call('inspect-traffic')
    return this.trafficSlot
  }
  async prepareCandidate(release: DeploymentRelease) {
    this.call(`prepare:${release.slot}`)
  }
  async runMigrations() {
    this.call('migrate')
  }
  async smokeRelease(release: DeploymentRelease) {
    this.call(`pre-smoke:${release.slot}`)
    return smoke
  }
  async smokePublicEntry(release: DeploymentRelease) {
    this.call(`post-smoke:${release.slot}`)
    return smoke
  }
  async switchTraffic(slot: 'blue' | 'green') {
    this.call(`switch:${slot}`)
    this.trafficSlot = slot
    this.activeRelease = slot === blue.slot ? blue : green
  }
  async validateCutover(slot: 'blue' | 'green') {
    this.call(`validate-cutover:${slot}`)
  }
  async validateImage(release: DeploymentRelease) {
    this.call(`validate-image:${release.slot}`)
  }
  async verifyRetainedRelease(release: DeploymentRelease) {
    this.call(`verify-retained:${release.slot}`)
  }
}

function options(path: string) {
  return {
    backupFreshnessSeconds: 86_400,
    controlStatePath: path,
    journalPath: resolve('drizzle/meta/_journal.json'),
    leaseSeconds: 300,
    migrationPolicyPath: resolve('drizzle/migration-policy.json'),
    stabilizationSeconds: 0,
  }
}

function startOperation(
  path: string,
  type: 'deploy' | 'rollback',
  deploymentTarget: DeploymentRelease = green,
) {
  const runtime = readDeploymentState(path)
  const request =
    type === 'deploy'
      ? {
          operationType: 'deploy' as const,
          reason: 'Phase 14 unit deployment',
          target: { gitSha: deploymentTarget.sha, imageDigest: deploymentTarget.digest },
        }
      : {
          operationType: 'rollback' as const,
          reason: 'Phase 14 unit rollback',
          target: {
            targetDigest: runtime.lastDigest ?? blue.digest,
            targetSha: runtime.lastSha ?? blue.sha,
          },
        }
  const created = createInfrastructureOperation(path, request, actor, `${type}:${randomUUID()}`)
  const claimed = claimNextInfrastructureOperation(path, 'deploy-agent:deployment', 300)
  if (!claimed) throw new Error('Expected deployment claim')
  const lease = {
    fencingToken: claimed.fencingToken,
    leaseOwner: 'deploy-agent:deployment',
  }
  return { lease, operation: startInfrastructureOperation(path, created.operation.id, lease) }
}

describe('Phase 14 shared deployment engine', () => {
  it('deploys the inactive slot, persists cutover state and rolls back without rebuilding', async () => {
    const path = statePath()
    const platform = new FakePlatform()
    const deployment = startOperation(path, 'deploy')
    await executeDeploymentOperation(
      deployment.operation,
      deployment.lease,
      [],
      platform,
      options(path),
    )
    finishInfrastructureOperation(path, deployment.operation.id, deployment.lease, {
      phase: 'deployment-verified',
      status: 'completed',
    })
    expect(readDeploymentState(path)).toMatchObject({
      activeSlot: 'green',
      currentDigest: green.digest,
      currentSha: green.sha,
      lastDigest: blue.digest,
      lastSha: blue.sha,
      previousSlot: 'blue',
    })

    const rollback = startOperation(path, 'rollback')
    await executeDeploymentOperation(
      rollback.operation,
      rollback.lease,
      [],
      platform,
      options(path),
    )
    expect(readDeploymentState(path)).toMatchObject({
      activeSlot: 'blue',
      currentSha: blue.sha,
      previousSlot: 'green',
    })
    expect(platform.calls).toContain('verify-retained:blue')
    expect(platform.calls).not.toContain('validate-image:blue')
    expect(platform.calls.filter((call) => call === 'prepare:blue')).toHaveLength(0)
  })

  it('keeps the active slot unchanged when an inactive deployment or config validation fails', async () => {
    for (const [failure, expectsCleanup] of [
      ['validate-image:green', false],
      ['pre-smoke:green', true],
      ['validate-cutover:green', true],
    ] as const) {
      const path = statePath()
      const platform = new FakePlatform()
      platform.failAt = failure
      const deployment = startOperation(path, 'deploy')
      await expect(
        executeDeploymentOperation(
          deployment.operation,
          deployment.lease,
          [],
          platform,
          options(path),
        ),
      ).rejects.toThrow('injected')
      expect(platform.trafficSlot).toBe('blue')
      expect(readDeploymentState(path).activeSlot).toBe('blue')
      expect(platform.calls.includes('cleanup:green')).toBe(expectsCleanup)
    }
  })

  it('automatically switches back to the retained image after post-cutover smoke failure', async () => {
    const path = statePath()
    const platform = new FakePlatform()
    platform.failAt = 'post-smoke:green'
    const deployment = startOperation(path, 'deploy')
    await expect(
      executeDeploymentOperation(
        deployment.operation,
        deployment.lease,
        [],
        platform,
        options(path),
      ),
    ).rejects.toThrow('traffic was rolled back')
    expect(platform.calls).toContain('switch:green')
    expect(platform.calls).toContain('switch:blue')
    expect(platform.trafficSlot).toBe('blue')
    expect(readDeploymentState(path)).toMatchObject({
      currentSha: blue.sha,
      lastSha: null,
      previousSlot: 'none',
    })
  })

  it('preserves the previous slot while the stabilization window is active', async () => {
    const path = statePath()
    const platform = new FakePlatform()
    const deployment = startOperation(path, 'deploy')
    await executeDeploymentOperation(deployment.operation, deployment.lease, [], platform, {
      ...options(path),
      stabilizationSeconds: 300,
    })
    finishInfrastructureOperation(path, deployment.operation.id, deployment.lease, {
      phase: 'deployment-verified',
      status: 'completed',
    })

    const next = startOperation(path, 'deploy', {
      digest: `sha256:${'d'.repeat(64)}`,
      sha: 'd'.repeat(40),
      slot: 'blue',
    })
    platform.calls.splice(0)
    await expect(
      executeDeploymentOperation(next.operation, next.lease, [], platform, options(path)),
    ).rejects.toThrow('stabilization window')
    expect(platform.calls).toEqual(['inspect-active'])
    expect(readDeploymentState(path)).toMatchObject({
      activeSlot: 'green',
      lastDigest: blue.digest,
      lastSha: blue.sha,
      previousSlot: 'blue',
    })
  })

  it('rejects concurrent deploy/rollback operations without consuming recovery work', () => {
    const path = statePath()
    createInfrastructureOperation(
      path,
      {
        operationType: 'deploy',
        reason: 'first',
        target: { gitSha: green.sha, imageDigest: green.digest },
      },
      actor,
      'deploy:concurrent:first',
    )
    expect(() =>
      createInfrastructureOperation(
        path,
        {
          operationType: 'rollback',
          reason: 'second',
          target: { targetDigest: blue.digest, targetSha: blue.sha },
        },
        actor,
        'deploy:concurrent:second',
      ),
    ).toThrow('Another deployment operation')
    createInfrastructureOperation(
      path,
      {
        operationType: 'recovery',
        reason: 'queued backup remains independently claimable',
        target: { action: 'backup', backupType: 'full', environment: 'test' },
      },
      actor,
      'recovery:parallel',
    )
    expect(
      claimNextInfrastructureOperation(path, 'deploy-agent:recovery', 30, new Date(), [
        'recovery',
        'restore',
      ]),
    ).toMatchObject({ operationType: 'recovery' })
  })

  it('treats only valid dual-replica records inside the configured window as fresh', () => {
    const now = new Date('2026-08-26T12:00:00.000Z')
    const record = {
      backupId: 'backup-001',
      backupType: 'full' as const,
      completedAt: '2026-08-26T11:59:00.000Z',
      createdAt: '2026-08-26T11:58:00.000Z',
      manifestSha256: 'c'.repeat(64),
      measuredBytes: 1,
      measuredSeconds: 1,
      offsiteReplicaStatus: 'fresh' as const,
      repositoryGeneration: 'generation-001',
      stanza: 'tungchiahui',
      valid: true,
      walArchiveMax: '000000010000000000000001',
    }
    expect(hasFreshRecoverableBackup([record], 120, now)).toBe(true)
    expect(hasFreshRecoverableBackup([record], 30, now)).toBe(false)
    expect(
      hasFreshRecoverableBackup([{ ...record, offsiteReplicaStatus: 'failed' }], 120, now),
    ).toBe(false)
  })

  it.each([
    ['executing', true, true, true],
    ['migration-complete', false, false, true],
    ['cutover-intent-recorded', false, false, false],
    ['traffic-switched', false, false, false],
  ] as const)(
    'reconciles a crash from %s without repeating completed destructive phases',
    async (persistedPhase, expectsValidation, expectsMigration, expectsPreSmoke) => {
      const path = statePath()
      const platform = new FakePlatform()
      const deployment = startOperation(path, 'deploy')
      initializeDeploymentRuntime(path, blue)
      if (persistedPhase === 'cutover-intent-recorded' || persistedPhase === 'traffic-switched') {
        recordDeploymentCutoverIntent(path, deployment.operation.id, deployment.lease, green)
      }
      if (persistedPhase !== 'executing') {
        updateInfrastructureOperationPhase(
          path,
          deployment.operation.id,
          deployment.lease,
          persistedPhase,
        )
      }
      if (persistedPhase === 'traffic-switched') {
        platform.trafficSlot = 'green'
        platform.activeRelease = green
      }

      const resumedAt = new Date(Date.now() + 301_000)
      expect(reconcileInfrastructureOperations(path, resumedAt)).toBe(1)
      expect(getInfrastructureOperation(path, deployment.operation.id)?.phase).toBe(persistedPhase)
      requeueDeploymentOperationForReconciliation(path, deployment.operation.id, resumedAt)
      const claimed = claimNextInfrastructureOperation(
        path,
        'deploy-agent:deployment',
        300,
        resumedAt,
        ['deploy', 'rollback'],
      )
      if (!claimed) throw new Error('Expected reconciled deployment claim')
      const lease = {
        fencingToken: claimed.fencingToken,
        leaseOwner: 'deploy-agent:deployment',
      }
      const running = startInfrastructureOperation(path, claimed.id, lease, resumedAt)
      expect(running.phase).toBe(persistedPhase)
      await executeDeploymentOperation(running, lease, [], platform, options(path), resumedAt)

      expect(platform.calls.includes('validate-image:green')).toBe(expectsValidation)
      expect(platform.calls.includes('migrate')).toBe(expectsMigration)
      expect(platform.calls.includes('pre-smoke:green')).toBe(expectsPreSmoke)
      expect(readDeploymentState(path).activeSlot).toBe('green')
      expect(getInfrastructureOperation(path, deployment.operation.id)?.phase).toBe(
        'post-smoke-complete',
      )
    },
  )

  it('rejects deploying the release that is already active without touching either slot', async () => {
    const path = statePath()
    const platform = new FakePlatform()
    initializeDeploymentRuntime(path, blue)
    const deployment = startOperation(path, 'deploy', blue)

    await expect(
      executeDeploymentOperation(
        deployment.operation,
        deployment.lease,
        [],
        platform,
        options(path),
      ),
    ).rejects.toThrow('already active')

    expect(platform.calls).toEqual(['inspect-active'])
    expect(platform.trafficSlot).toBe('blue')
    expect(readDeploymentState(path)).toMatchObject({
      activeSlot: 'blue',
      currentDigest: blue.digest,
      currentSha: blue.sha,
      previousSlot: 'none',
    })
  })

  it('reconciles the crash window after state commit but before phase persistence', async () => {
    const path = statePath()
    const platform = new FakePlatform()
    const deployment = startOperation(path, 'deploy')
    initializeDeploymentRuntime(path, blue)
    recordDeploymentCutoverIntent(path, deployment.operation.id, deployment.lease, green)
    updateInfrastructureOperationPhase(
      path,
      deployment.operation.id,
      deployment.lease,
      'traffic-switched',
    )
    platform.trafficSlot = 'green'
    platform.activeRelease = green
    commitDeploymentCutover(path, deployment.operation.id, deployment.lease, 300)

    const resumedAt = new Date(Date.now() + 301_000)
    expect(reconcileInfrastructureOperations(path, resumedAt)).toBe(1)
    requeueDeploymentOperationForReconciliation(path, deployment.operation.id, resumedAt)
    const claimed = claimNextInfrastructureOperation(
      path,
      'deploy-agent:deployment',
      300,
      resumedAt,
      ['deploy', 'rollback'],
    )
    if (!claimed) throw new Error('Expected post-commit deployment claim')
    const lease = {
      fencingToken: claimed.fencingToken,
      leaseOwner: 'deploy-agent:deployment',
    }
    const running = startInfrastructureOperation(path, claimed.id, lease, resumedAt)
    platform.calls.splice(0)
    await executeDeploymentOperation(running, lease, [], platform, options(path), resumedAt)

    expect(platform.calls).toEqual(['inspect-active', 'post-smoke:green'])
    expect(readDeploymentState(path)).toMatchObject({
      activeSlot: 'green',
      currentSha: green.sha,
      previousSlot: 'blue',
    })
  })
})
