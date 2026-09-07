import { randomUUID } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { z } from 'zod'

import {
  getRecoveryBackup,
  listRecoveryBackups,
  type RecoveryBackupRecord,
  readControlState,
  recordRecoveryBackup,
} from '../control-plane/control-state'
import type { S3ConnectionConfiguration } from '../storage/contracts'
import { S3ObjectStorageAdapter } from '../storage/s3-adapter'
import type { RecoveryConfiguration } from './configuration'
import {
  createEncryptedControlStateArtifact,
  type EncryptedControlStateArtifact,
  mirrorControlStateArtifact,
  readLatestControlStateArtifact,
  replicateControlStateArtifact,
  restoreEncryptedControlStateArtifact,
} from './control-state-snapshot'
import { checkPgBackRest, restorePgBackRest, runPgBackRestBackup } from './pgbackrest'
import {
  createRepositoryManifest,
  materializeRepositoryReplica,
  mirrorRepositoryReplica,
  type RepositoryManifest,
  readRepositoryManifestFromReplica,
  replicateRepository,
  repositoryManifestSha256,
  verifyRepositoryReplica,
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
  const primary = await Promise.resolve()
    .then(() =>
      replicateRepository(
        configuration.localRepositoryPath,
        manifest,
        configuration.primary,
        configuration.replicationConcurrency,
      ),
    )
    .then(
      (value) => Object.freeze({ status: 'fulfilled' as const, value }),
      (reason: unknown) => Object.freeze({ reason, status: 'rejected' as const }),
    )
  const offsite =
    primary.status === 'fulfilled'
      ? await Promise.resolve()
          .then(() =>
            mirrorRepositoryReplica(
              manifest,
              configuration.primary,
              configuration.offsite,
              configuration.replicationConcurrency,
            ),
          )
          .then(
            (value) => Object.freeze({ status: 'fulfilled' as const, value }),
            (reason: unknown) => Object.freeze({ reason, status: 'rejected' as const }),
          )
      : Object.freeze({ status: 'pending' as const })
  const completedAt = new Date().toISOString()
  const record: RecoveryBackupRecord = Object.freeze({
    backupId: backup.backupId,
    backupType,
    completedAt,
    createdAt: backup.startedAt,
    manifestSha256: repositoryManifestSha256(manifest),
    measuredBytes: manifest.totalBytes,
    measuredSeconds: (performance.now() - started) / 1_000,
    offsiteReplicaStatus:
      offsite.status === 'fulfilled'
        ? 'fresh'
        : offsite.status === 'pending'
          ? 'pending'
          : 'failed',
    primaryReplicaStatus: primary.status === 'fulfilled' ? 'fresh' : 'failed',
    repositoryGeneration: generation,
    stanza: configuration.stanza,
    valid: primary.status === 'fulfilled' && offsite.status === 'fulfilled',
    walArchiveMax: backup.walArchiveMax,
  })
  recordRecoveryBackup(configuration.controlStatePath, record)
  if (!record.valid) {
    const failures = [
      primary.status === 'rejected'
        ? `primary: ${primary.reason instanceof Error ? primary.reason.message : 'unknown failure'}`
        : null,
      offsite.status === 'rejected'
        ? `off-site: ${offsite.reason instanceof Error ? offsite.reason.message : 'unknown failure'}`
        : null,
    ].filter((failure): failure is string => failure !== null)
    throw new Error(
      `Backup completed locally but replica verification failed: ${failures.join('; ')}`,
    )
  }
  const controlState = await executeControlStateBackup(configuration)
  return Object.freeze({
    backup: record,
    controlState,
    databaseBytes: backup.databaseBytes,
    replication: {
      offsite: offsite.status === 'fulfilled' ? offsite.value : null,
      primary: primary.status === 'fulfilled' ? primary.value : null,
    },
    repositoryBytes: backup.repositoryBytes,
  })
}

export async function executeOffsiteReplicaRetry(
  configuration: RecoveryConfiguration,
  backupId: string,
) {
  const record = getRecoveryBackup(configuration.controlStatePath, backupId)
  if (!record) throw new Error('Backup record was not found for off-site retry')
  if (record.primaryReplicaStatus !== 'fresh') {
    throw new Error('Off-site retry requires a fresh primary replica')
  }
  let manifest: RepositoryManifest
  let primary: Awaited<ReturnType<typeof verifyRepositoryReplica>>
  try {
    manifest = await readRepositoryManifestFromReplica(
      record.repositoryGeneration,
      configuration.primary,
    )
    if (
      manifest.backupId !== record.backupId ||
      manifest.generation !== record.repositoryGeneration ||
      repositoryManifestSha256(manifest) !== record.manifestSha256
    ) {
      throw new Error('Primary replica manifest does not match the recorded backup identity')
    }
    primary = await verifyRepositoryReplica(
      manifest,
      configuration.primary,
      configuration.replicationConcurrency,
    )
  } catch (error: unknown) {
    recordRecoveryBackup(configuration.controlStatePath, {
      ...record,
      primaryReplicaStatus: 'failed',
      valid: false,
    })
    throw error
  }
  let offsite: Awaited<ReturnType<typeof mirrorRepositoryReplica>>
  try {
    offsite = await mirrorRepositoryReplica(
      manifest,
      configuration.primary,
      configuration.offsite,
      configuration.replicationConcurrency,
    )
  } catch (error: unknown) {
    recordRecoveryBackup(configuration.controlStatePath, {
      ...record,
      offsiteReplicaStatus: 'failed',
      primaryReplicaStatus: 'fresh',
      valid: false,
    })
    throw error
  }
  recordRecoveryBackup(configuration.controlStatePath, {
    ...record,
    offsiteReplicaStatus: 'fresh',
    primaryReplicaStatus: 'fresh',
    valid: true,
  })
  const controlState = await executeControlStateBackup(configuration)
  return Object.freeze({ backup: record.backupId, controlState, offsite, primary })
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
    const primary = await replicateControlStateArtifact(
      encryptedPath,
      artifact,
      configuration.primary,
    )
    const offsite = await mirrorControlStateArtifact(
      artifact,
      configuration.primary,
      configuration.offsite,
    )
    return Object.freeze({ artifact, offsite, primary })
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
  if (
    !record?.valid ||
    record.primaryReplicaStatus !== 'fresh' ||
    record.offsiteReplicaStatus !== 'fresh'
  ) {
    throw new Error('No fully verified primary and off-site backup is available for restore')
  }
  let replicaSource: 'off-site-s3' | 'primary-s3' | null = null
  let restoreFailure: unknown
  for (const candidate of [
    { configuration: configuration.primary, source: 'primary-s3' as const },
    { configuration: configuration.offsite, source: 'off-site-s3' as const },
  ]) {
    try {
      const manifest = await readRepositoryManifestFromReplica(
        record.repositoryGeneration,
        candidate.configuration,
      )
      if (repositoryManifestSha256(manifest) !== record.manifestSha256) {
        throw new Error('Repository manifest does not match the control-state backup record')
      }
      await materializeRepositoryReplica(
        manifest,
        configuration.localRepositoryPath,
        candidate.configuration,
      )
      replicaSource = candidate.source
      break
    } catch (error: unknown) {
      restoreFailure = error
    }
  }
  if (replicaSource === null) {
    throw new Error('Primary and off-site repository replicas are both unavailable', {
      cause: restoreFailure,
    })
  }
  prepareRestoreTarget(configuration.postgresDataPath, parsed.environment, parsed.confirmation)
  restorePgBackRest(
    { configPath: configuration.pgBackRestConfigPath, stanza: configuration.stanza },
    parsed.selector,
  )
  return Object.freeze({
    backupId: record.backupId,
    manifestSha256: record.manifestSha256,
    repositorySource: replicaSource,
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
  replica: S3ConnectionConfiguration = configuration.primary,
) {
  mkdirSync(configuration.workDirectory, { mode: 0o700, recursive: true })
  const suffix = randomUUID()
  const encryptedPath = join(configuration.workDirectory, `control-restore-${suffix}.age`)
  const decryptedPath = join(configuration.workDirectory, `control-restore-${suffix}.sqlite`)
  const storage = new S3ObjectStorageAdapter(replica)
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
  let restoreFailure: unknown
  for (const replica of [configuration.primary, configuration.offsite]) {
    try {
      const artifact = await readLatestControlStateArtifact(replica, configuration.mode)
      return await restoreControlStateFromReplica(configuration, artifact, targetPath, replica)
    } catch (error: unknown) {
      restoreFailure = error
    }
  }
  throw new Error('Primary and off-site control-state replicas are both unavailable', {
    cause: restoreFailure,
  })
}
