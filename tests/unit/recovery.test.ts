import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import type { ActorIdentity } from '../../src/control-plane/contracts'
import {
  claimNextInfrastructureOperation,
  createConsistentControlStateSnapshot,
  createInfrastructureOperation,
  initializeControlState,
  inspectControlStateSnapshot,
  listControlAuditEvents,
  listRecoveryBackups,
  recordRecoveryBackup,
  restoreControlStateSnapshot,
} from '../../src/control-plane/control-state'
import { authorizeBreakGlassRestore } from '../../src/recovery/break-glass'
import { parseRecoveryConfiguration } from '../../src/recovery/configuration'
import { prepareRestoreTarget } from '../../src/recovery/engine'
import {
  createRepositoryManifest,
  repositoryManifestSha256,
  verifyLocalRepository,
} from '../../src/recovery/repository-replication'

const temporaryDirectories: string[] = []
const actor: ActorIdentity = {
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
  id: 'operator:phase13',
  kind: 'operator',
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function temporaryDirectory() {
  const directory = mkdtempSync(join(tmpdir(), 'phase13-recovery-unit-'))
  temporaryDirectories.push(directory)
  return directory
}

function recoveryEnvironment() {
  return {
    ASSET_S3_ACCESS_KEY_ID: 'asset-only-key',
    ASSET_S3_BUCKET: 'asset-bucket',
    BACKUP_AGE_IDENTITY_PATH: '/run/secrets/backup-age.txt',
    BACKUP_AGE_RECIPIENT: `age1${'q'.repeat(58)}`,
    BACKUP_LOCAL_REPOSITORY_PATH: '/var/lib/pgbackrest',
    BACKUP_PGBACKREST_CONFIG_PATH: '/etc/pgbackrest/pgbackrest.conf',
    BACKUP_PGBACKREST_STANZA: 'tungchiahui',
    BACKUP_POSTGRES_DATA_PATH: '/var/lib/postgresql/18/docker',
    BACKUP_S3_ACCESS_KEY_ID: 'r2-backup-only-key',
    BACKUP_S3_BUCKET: 'r2-offsite-backup',
    BACKUP_S3_ENDPOINT: 'https://account.r2.cloudflarestorage.com',
    BACKUP_S3_FORCE_PATH_STYLE: 'false',
    BACKUP_S3_REGION: 'auto',
    BACKUP_S3_SECRET_ACCESS_KEY: 'r2-backup-secret',
    BACKUP_WORK_DIRECTORY: '/var/lib/tungchiahui-backup-work',
    CONTROL_STATE_PATH: '/control-state/control.db',
    SITE_RUNTIME_MODE: 'production',
  } as const
}

describe('Phase 13 recovery boundary', () => {
  it('requires an off-site backup identity independent from the asset identity', () => {
    const configuration = parseRecoveryConfiguration(recoveryEnvironment())
    expect(configuration.backup.bucket).toBe('r2-offsite-backup')
    expect(() =>
      parseRecoveryConfiguration({
        ...recoveryEnvironment(),
        BACKUP_S3_ACCESS_KEY_ID: 'asset-only-key',
      }),
    ).toThrow('backup credentials must differ')
  })

  it('checkpoints, snapshots, validates, and restores SQLite audit continuity', () => {
    const directory = temporaryDirectory()
    const source = join(directory, 'control.db')
    const snapshot = join(directory, 'snapshot.db')
    const restored = join(directory, 'restored.db')
    initializeControlState(source, 'test')
    createInfrastructureOperation(
      source,
      {
        operationType: 'restore',
        reason: 'control-state snapshot fixture',
        target: { backupId: 'backup-001', environment: 'test' },
      },
      actor,
      'phase13:snapshot:001',
    )
    const evidence = createConsistentControlStateSnapshot(source, snapshot)
    expect(evidence).toMatchObject({
      auditEventCount: 1,
      auditEventMaxId: 1,
      environment: 'test',
      integrity: 'ok',
      schemaVersion: 6,
    })
    expect(inspectControlStateSnapshot(snapshot)).toEqual(evidence)
    expect(restoreControlStateSnapshot(snapshot, restored, 'test')).toEqual(evidence)
    expect(() => restoreControlStateSnapshot(snapshot, restored, 'production')).toThrow(
      'environment does not match',
    )
  })

  it('records backup freshness outside PostgreSQL and filters recovery claims', () => {
    const path = join(temporaryDirectory(), 'control.db')
    initializeControlState(path, 'test')
    createInfrastructureOperation(
      path,
      {
        operationType: 'deploy',
        reason: 'Phase 14 operation must remain queued',
        target: { gitSha: 'a'.repeat(40), imageDigest: `sha256:${'b'.repeat(64)}` },
      },
      actor,
      'phase14:deploy:queued',
    )
    createInfrastructureOperation(
      path,
      {
        operationType: 'recovery',
        reason: 'Phase 13 backup',
        target: { action: 'backup', backupType: 'full', environment: 'test' },
      },
      actor,
      'phase13:backup:queued',
    )
    const claimed = claimNextInfrastructureOperation(
      path,
      'deploy-agent:recovery',
      30,
      new Date(),
      ['recovery', 'restore'],
    )
    expect(claimed?.operationType).toBe('recovery')

    recordRecoveryBackup(path, {
      backupId: '20260825-120000F',
      backupType: 'full',
      completedAt: '2026-08-25T12:00:10.000Z',
      createdAt: '2026-08-25T12:00:00.000Z',
      manifestSha256: 'c'.repeat(64),
      measuredBytes: 1_024,
      measuredSeconds: 10,
      offsiteReplicaStatus: 'fresh',
      repositoryGeneration: '20260825-120000F-generation',
      stanza: 'tungchiahui',
      valid: true,
      walArchiveMax: '000000010000000000000002',
    })
    expect(listRecoveryBackups(path)).toMatchObject([
      {
        backupId: '20260825-120000F',
        offsiteReplicaStatus: 'fresh',
        valid: true,
      },
    ])
  })

  it('queues an audited production restore through the shared break-glass operation path', () => {
    const path = join(temporaryDirectory(), 'control.db')
    const result = authorizeBreakGlassRestore(
      path,
      {
        actorId: 'break-glass:phase13-operator',
        idempotencyKey: 'phase13:break-glass:001',
        inventoryHost: 'production-origin',
        request: {
          confirmation: 'RESTORE-PRODUCTION',
          environment: 'production',
          reason: 'Control API is unavailable during the Phase 13 recovery drill',
          selector: { targetTime: '2026-08-25T12:00:00.000Z' },
        },
      },
      new Date('2026-08-25T12:01:00.000Z'),
    )
    expect(result.operation).toMatchObject({ operationType: 'restore', status: 'queued' })
    expect(listControlAuditEvents(path)).toMatchObject([
      { eventType: 'break_glass_restore_authorized', outcome: 'accepted' },
      { eventType: 'infrastructure_operation_created', operationId: result.operation.id },
    ])
    expect(() =>
      authorizeBreakGlassRestore(path, {
        actorId: 'break-glass:phase13-operator',
        idempotencyKey: 'phase13:break-glass:wrong-confirmation',
        inventoryHost: 'production-origin',
        request: {
          confirmation: 'RESTORE-TEST' as 'RESTORE-PRODUCTION',
          environment: 'production',
          reason: 'invalid confirmation fixture',
          selector: { backupId: '20260825-120000F' },
        },
      }),
    ).toThrow()
  })

  it('creates a deterministic repository manifest and detects corruption', () => {
    const repository = join(temporaryDirectory(), 'repository')
    mkdirSync(join(repository, 'backup', 'site'), { recursive: true })
    writeFileSync(join(repository, 'backup', 'site', 'manifest'), 'backup-data')
    writeFileSync(join(repository, 'archive.info'), 'wal-data')
    const manifest = createRepositoryManifest(
      repository,
      '20260825-120000F',
      'generation-001',
      new Date('2026-08-25T12:00:00.000Z'),
    )
    expect(manifest.entries.map((entry) => entry.path)).toEqual([
      'archive.info',
      'backup/site/manifest',
    ])
    expect(repositoryManifestSha256(manifest)).toMatch(/^[a-f0-9]{64}$/)
    expect(verifyLocalRepository(repository, manifest).status).toBe('readable')
    writeFileSync(join(repository, 'archive.info'), 'corrupted')
    expect(() => verifyLocalRepository(repository, manifest)).toThrow('size mismatch')
  })

  it('leaves a disposable restore target untouched until marker and confirmation pass', () => {
    const target = join(temporaryDirectory(), 'postgres-target')
    mkdirSync(target)
    writeFileSync(join(target, 'existing-data'), 'must survive rejected restore')
    expect(() => prepareRestoreTarget(target, 'test', 'RESTORE-TEST')).toThrow('marker is missing')
    expect(() => prepareRestoreTarget(target, 'test', 'RESTORE-LOCAL')).toThrow(
      'confirmation is invalid',
    )
    expect(() => prepareRestoreTarget(target, 'production', 'RESTORE-PRODUCTION')).toThrow(
      'outside the declared PostgreSQL data path',
    )
    expect(verifyLocalFile(join(target, 'existing-data'))).toBe(true)
    writeFileSync(join(target, '.tungchiahui-disposable-recovery-target'), 'test')
    prepareRestoreTarget(target, 'test', 'RESTORE-TEST')
    expect(verifyLocalFile(join(target, 'existing-data'))).toBe(false)
  })
})

function verifyLocalFile(path: string) {
  try {
    return readFileSync(path).byteLength > 0
  } catch {
    return false
  }
}
