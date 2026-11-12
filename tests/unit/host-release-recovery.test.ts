import { describe, expect, it } from 'vitest'
import { infrastructureOperationRequestSchema } from '../../src/control-plane/contracts'
import { hostReleaseSchema } from '../../src/host-release/contracts'
import { convergenceDifferences } from '../../src/host-release/coordinator'
import { containerConfigRebindRequired } from '../../src/host-release/provision'
import { hostRecoveryRejection } from '../../src/host-release/recovery'
import { convergenceSnapshotSchema } from '../../src/host-release/state'

const sha = '3fedee1b37940d9729fe98396db7d7c2b918476c'
const previousSha = '8b26b3b7ad0f81f50d0f00af3b48a0db82052a09'
const digest = (character: string) => `sha256:${character.repeat(64)}`
const image = (repository: string, character: string) =>
  `ghcr.io/tungchiahui/${repository}@${digest(character)}`

const before = convergenceSnapshotSchema.parse({
  backupScheduleEnabled: true,
  deploymentPollingEnabled: false,
  files: {
    'compose.yaml': 'compose',
    'openresty.conf': 'openresty',
    'pgbackrest.conf': 'pgbackrest',
    'pgbouncer.ini': 'pgbouncer',
  },
  hostPreviousSha: previousSha,
  hostSha: sha,
  maintenanceScheduleEnabled: true,
  postgresImage: image('postgres', 'f'),
  recoveryImage: image('recovery', 'e'),
  serviceImage: image('service', 'd'),
  sha,
  webDigest: digest('b'),
  webImage: image('web', 'a'),
})
const release = hostReleaseSchema.parse({
  recoveryDigest: digest('1'),
  serviceDigest: digest('2'),
  sha,
  webDigest: digest('b'),
})
const checkpoint = { before, phase: 'compensating' as const, release }
const operation = {
  operationType: 'deploy' as const,
  phase: 'host-release-recovery-required',
  status: 'failed' as const,
}
const deployment = { currentDigest: before.webDigest, currentSha: sha, pendingSha: null }
const hostRuntime = { current_sha: sha, pending_sha: null, previous_sha: previousSha }

describe('host release recovery candidate', () => {
  it('accepts the exact failed recovery-required state', () => {
    expect(hostRecoveryRejection({ checkpoint, deployment, hostRuntime, operation })).toBeNull()
  })

  it('refuses operations that are not the explicit recovery-required failure', () => {
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment,
        hostRuntime,
        operation: { ...operation, status: 'completed' },
      }),
    ).toContain('not failed')
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment,
        hostRuntime,
        operation: { ...operation, phase: 'host-release-reverted' },
      }),
    ).toContain('host-release-recovery-required')
    expect(
      hostRecoveryRejection({
        checkpoint: { ...checkpoint, phase: 'committed' },
        deployment,
        hostRuntime,
        operation,
      }),
    ).toContain('compensable phase')
    expect(
      hostRecoveryRejection({ checkpoint: undefined, deployment, hostRuntime, operation }),
    ).toContain('no durable host checkpoint')
  })

  it('refuses a drifted Web or host runtime', () => {
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment: { ...deployment, currentSha: previousSha },
        hostRuntime,
        operation,
      }),
    ).toContain('active Web release')
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment: { ...deployment, pendingSha: previousSha },
        hostRuntime,
        operation,
      }),
    ).toContain('cutover is still pending')
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment,
        hostRuntime: { ...hostRuntime, pending_sha: sha },
        operation,
      }),
    ).toContain('generation is still pending')
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment,
        hostRuntime: { ...hostRuntime, current_sha: previousSha },
        operation,
      }),
    ).toContain('installed host executor')
    expect(
      hostRecoveryRejection({
        checkpoint,
        deployment,
        hostRuntime: { ...hostRuntime, previous_sha: null },
        operation,
      }),
    ).toContain('retained host executor')
  })
})

describe('host convergence verification', () => {
  it('accepts an identical snapshot and reports every exact difference', () => {
    expect(convergenceDifferences(before, before)).toEqual([])
    const changed = convergenceSnapshotSchema.parse({
      ...before,
      files: { ...before.files, 'openresty.conf': 'target' },
      serviceImage: image('service', '9'),
      webDigest: digest('8'),
    })
    expect(convergenceDifferences(before, changed)).toEqual([
      'webDigest',
      'serviceImage',
      'files.openresty.conf',
    ])
  })
})

describe('host topology rebind detection', () => {
  it('requires a rebuild when the process may predate the atomic config replacement', () => {
    const started = '2026-11-12T12:31:39.444Z'
    const startedMs = Date.parse(started)
    expect(containerConfigRebindRequired(started, startedMs - 1_000)).toBe(false)
    expect(containerConfigRebindRequired(started, startedMs)).toBe(true)
    expect(containerConfigRebindRequired(started, startedMs + 1_000)).toBe(true)
    expect(containerConfigRebindRequired('0001-01-01T00:00:00Z', startedMs)).toBe(true)
    expect(containerConfigRebindRequired('not-a-date', startedMs)).toBe(true)
  })
})

describe('host recovery operation contract', () => {
  it('accepts the exclusive server-console recovery target', () => {
    expect(
      infrastructureOperationRequestSchema.parse({
        operationType: 'server-migration',
        reason: 'Recover failed host release',
        target: {
          action: 'host-release-recovery',
          originalOperationId: 'c6dee55b-ee63-4e7a-a14f-bc92ac7278c9',
        },
      }),
    ).toMatchObject({ operationType: 'server-migration' })
  })

  it('still accepts the existing provision-only target', () => {
    expect(
      infrastructureOperationRequestSchema.parse({
        operationType: 'server-migration',
        reason: 'Activate the server release executor',
        target: { action: 'provision-only', inventoryHost: 'ddns.tungchiahui.cn' },
      }),
    ).toMatchObject({ operationType: 'server-migration' })
  })
})
