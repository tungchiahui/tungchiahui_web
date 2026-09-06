import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { z } from 'zod'

import {
  listRecoveryBackups,
  type RecoveryBackupRecord,
  readControlState,
  recordRecoveryBackup,
} from '../control-plane/control-state'
import { S3ObjectStorageAdapter } from '../storage/s3-adapter'
import type { RecoveryConfiguration } from './configuration'
import {
  createEncryptedControlStateArtifact,
  type EncryptedControlStateArtifact,
  readLatestControlStateArtifact,
  replicateControlStateArtifact,
  restoreEncryptedControlStateArtifact,
} from './control-state-snapshot'
import { checkPgBackRest, restorePgBackRest, runPgBackRestBackup } from './pgbackrest'
import {
  createRepositoryManifest,
  materializeRepositoryReplica,
  readRepositoryManifestFromReplica,
  replicateRepository,
  repositoryManifestSha256,
} from './repository-replication'

export async function executeDatabaseBackup(
  configuration: RecoveryConfiguration,
  backupType: 'diff' | 'full' | 'incr',
) {
  const started = performance.now()
  const pgBackRest = {
    configPath: configuration.pgBackRestConfigPath,
    stanza: configuration.stanza,
  }
  const backup = runPgBackRestBackup(pgBackRest, backupType)
  checkPgBackRest(pgBackRest)
  const generation = `${backup.backupId}-${randomUUID()}`
  const manifest = createRepositoryManifest(
    configuration.localRepositoryPath,
    backup.backupId,
    generation,
  )
  const offsite = await Promise.allSettled([
    replicateRepository(configuration.localRepositoryPath, manifest, configuration.backup),
  ]).then(([result]) => result)
  const completedAt = new Date().toISOString()
  const record: RecoveryBackupRecord = Object.freeze({
    backupId: backup.backupId,
    backupType,
    completedAt,
    createdAt: backup.startedAt,
    manifestSha256: repositoryManifestSha256(manifest),
    measuredBytes: manifest.totalBytes,
    measuredSeconds: (performance.now() - started) / 1_000,
    offsiteReplicaStatus: offsite.status === 'fulfilled' ? 'fresh' : 'failed',
    repositoryGeneration: generation,
    stanza: configuration.stanza,
    valid: offsite.status === 'fulfilled',
    walArchiveMax: backup.walArchiveMax,
  })
  recordRecoveryBackup(configuration.controlStatePath, record)
  if (!record.valid) {
    const failure =
      offsite.status === 'rejected' && offsite.reason instanceof Error
        ? offsite.reason.message
        : 'unknown failure'
    throw new Error(`Backup completed locally but the off-site replica failed: ${failure}`)
  }
  const controlState = await executeControlStateBackup(configuration)
  return Object.freeze({
    backup: record,
    controlState,
    databaseBytes: backup.databaseBytes,
    repositoryBytes: backup.repositoryBytes,
  })
}

export async function executeControlStateBackup(configuration: RecoveryConfiguration) {
  mkdirSync(configuration.workDirectory, { mode: 0o700, recursive: true })
  const suffix = randomUUID()
  const snapshotPath = join(configuration.workDirectory, `control-${suffix}.sqlite`)
  const encryptedPath = `${snapshotPath}.age`
  try {
    const artifact = createEncryptedControlStateArtifact(
      configuration.controlStatePath,
      snapshotPath,
      encryptedPath,
      configuration.ageRecipient,
    )
    const offsite = await replicateControlStateArtifact(
      encryptedPath,
      artifact,
      configuration.backup,
    )
    return Object.freeze({ artifact, offsite })
  } finally {
    rmSync(snapshotPath, { force: true })
    rmSync(encryptedPath, { force: true })
  }
}

function chooseBackupRecord(
  records: readonly RecoveryBackupRecord[],
  selector: Readonly<{ backupId: string }> | Readonly<{ targetTime: string }>,
) {
  if ('backupId' in selector) {
    return records.find((record) => record.backupId === selector.backupId)
  }
  // The newest repository snapshot contains the widest archived-WAL range. pgBackRest
  // independently selects the newest base backup that begins before the PITR target.
  return records.find((record) => record.valid)
}

export function prepareRestoreTarget(
  path: string,
  environment: RecoveryConfiguration['mode'],
  confirmation: string,
) {
  const target = resolve(path)
  if (environment === 'production') {
    if (confirmation !== 'RESTORE-PRODUCTION') {
      throw new Error('Production restore confirmation is invalid')
    }
    if (target !== '/var/lib/postgresql/18/docker') {
      throw new Error('Production restore target is outside the declared PostgreSQL data path')
    }
  } else {
    if (confirmation !== `RESTORE-${environment.toUpperCase()}`) {
      throw new Error('Disposable restore confirmation is invalid')
    }
    if (!existsSync(join(target, '.tungchiahui-disposable-recovery-target'))) {
      throw new Error('Disposable restore target marker is missing')
    }
  }
  for (const entry of readdirSync(target)) {
    rmSync(join(target, entry), { force: true, recursive: true })
  }
}

export async function executeDatabaseRestore(
  configuration: RecoveryConfiguration,
  request: Readonly<{
    confirmation: string
    environment: 'local' | 'production' | 'test'
    selector: Readonly<{ backupId: string }> | Readonly<{ targetTime: string }>
  }>,
) {
  const parsed = z
    .object({
      confirmation: z.string().min(1),
      environment: z.enum(['local', 'test', 'production']),
      selector: z.union([
        z.object({ backupId: z.string().min(1) }).strict(),
        z.object({ targetTime: z.iso.datetime({ offset: true }) }).strict(),
      ]),
    })
    .strict()
    .parse(request)
  const summary = readControlState(configuration.controlStatePath)
  if (summary.environment !== parsed.environment || configuration.mode !== parsed.environment) {
    throw new Error('Restore environment does not match control state and runtime configuration')
  }
  if (existsSync(join(configuration.postgresDataPath, 'postmaster.pid'))) {
    throw new Error('PostgreSQL must be stopped before the restore target can be changed')
  }
  const record = chooseBackupRecord(
    listRecoveryBackups(configuration.controlStatePath, 100),
    parsed.selector,
  )
  if (!record?.valid || record.offsiteReplicaStatus !== 'fresh') {
    throw new Error('No verified off-site backup is available for the requested restore selector')
  }
  const manifest = await readRepositoryManifestFromReplica(
    record.repositoryGeneration,
    configuration.backup,
  )
  if (repositoryManifestSha256(manifest) !== record.manifestSha256) {
    throw new Error('Off-site repository manifest does not match the control-state backup record')
  }
  await materializeRepositoryReplica(
    manifest,
    configuration.localRepositoryPath,
    configuration.backup,
  )
  prepareRestoreTarget(configuration.postgresDataPath, parsed.environment, parsed.confirmation)
  restorePgBackRest(
    { configPath: configuration.pgBackRestConfigPath, stanza: configuration.stanza },
    parsed.selector,
  )
  return Object.freeze({
    backupId: record.backupId,
    manifestSha256: record.manifestSha256,
    repositorySource: 'off-site-s3' as const,
    target: parsed.selector,
  })
}

export function readBackupStatus(configuration: RecoveryConfiguration) {
  return Object.freeze({
    backups: listRecoveryBackups(configuration.controlStatePath),
    controlState: readControlState(configuration.controlStatePath),
  })
}

export async function restoreControlStateFromReplica(
  configuration: RecoveryConfiguration,
  artifact: EncryptedControlStateArtifact,
  targetPath: string,
) {
  mkdirSync(configuration.workDirectory, { mode: 0o700, recursive: true })
  const suffix = randomUUID()
  const encryptedPath = join(configuration.workDirectory, `control-restore-${suffix}.age`)
  const decryptedPath = join(configuration.workDirectory, `control-restore-${suffix}.sqlite`)
  const storage = new S3ObjectStorageAdapter(configuration.backup)
  try {
    const object = await storage.getObject(artifact.objectKey)
    writeFileSync(encryptedPath, new Uint8Array(await new Response(object.body).arrayBuffer()), {
      mode: 0o600,
    })
    return restoreEncryptedControlStateArtifact(
      encryptedPath,
      decryptedPath,
      targetPath,
      configuration.ageIdentityPath,
      artifact,
      configuration.mode,
    )
  } finally {
    storage.destroy()
    rmSync(encryptedPath, { force: true })
    rmSync(decryptedPath, { force: true })
  }
}

export async function restoreLatestControlStateFromReplica(
  configuration: RecoveryConfiguration,
  targetPath: string,
) {
  const artifact = await readLatestControlStateArtifact(configuration.backup, configuration.mode)
  return restoreControlStateFromReplica(configuration, artifact, targetPath)
}
