import { createHash } from 'node:crypto'
import { z } from 'zod'
import { listRecoveryBackups } from '../control-plane/control-state'
import { parseAssetStorageConfiguration } from '../storage/configuration'
import type { ObjectStorage } from '../storage/contracts'
import { executeAssetBackup } from '../storage/production-asset-backup'
import { S3ObjectStorageAdapter } from '../storage/s3-adapter'
import type { RecoveryConfiguration } from './configuration'
import {
  executeControlStateBackup,
  executeDatabaseBackup,
  executeOffsiteReplicaRetry,
} from './engine'
import { recoveryObjectKey } from './object-policy'

const sha = z.string().regex(/^[a-f0-9]{64}$/)
const databaseSchema = z
  .object({
    status: z.literal('completed'),
    backupId: z.string().min(1),
    backupType: z.enum(['full', 'diff']),
    repositoryGeneration: z.string().min(1),
    manifestSha256: sha,
    primaryReplicaStatus: z.literal('fresh'),
    offsiteReplicaStatus: z.literal('fresh'),
  })
  .strict()
const controlSchema = z
  .object({
    status: z.literal('completed'),
    objectKey: z.string().min(1),
    sha256: sha,
  })
  .strict()
const assetsSchema = z
  .object({
    status: z.literal('completed'),
    sourceObjects: z.number().int().nonnegative(),
    copied: z.number().int().nonnegative(),
    updated: z.number().int().nonnegative(),
    unchanged: z.number().int().nonnegative(),
    targetOnlyPreserved: z.number().int().nonnegative(),
    manifestKey: z.string().min(1),
    manifestSha256: sha,
  })
  .strict()
export const dailyProtectionProgressSchema = z
  .object({
    database: databaseSchema.optional(),
    controlState: controlSchema.optional(),
    assets: assetsSchema.optional(),
    failedComponent: z.enum(['database', 'controlState', 'assets', 'manifest']).optional(),
    manifestKey: z.string().optional(),
    manifestSha256: sha.optional(),
  })
  .strict()
export type DailyProtectionProgress = z.infer<typeof dailyProtectionProgressSchema>
export type DailyProtectionTarget = Readonly<{
  date: string
  databaseBackupType: 'full' | 'diff'
  environment: 'production'
}>
export type DailyProtectionServices = Readonly<{
  findExistingDatabase: (
    target: DailyProtectionTarget,
  ) => Promise<z.infer<typeof databaseSchema> | null>
  database: (target: DailyProtectionTarget) => Promise<z.infer<typeof databaseSchema>>
  controlState: () => Promise<z.infer<typeof controlSchema>>
  assets: () => Promise<z.infer<typeof assetsSchema>>
  manifest: (
    target: DailyProtectionTarget,
    result: Required<Pick<DailyProtectionProgress, 'database' | 'controlState' | 'assets'>>,
  ) => Promise<{ key: string; sha256: string }>
}>

function hongKongDate(input: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(input))
}

export function createDailyProtectionManifest(
  target: DailyProtectionTarget,
  result: Required<Pick<DailyProtectionProgress, 'database' | 'controlState' | 'assets'>>,
  completedAt = new Date(),
) {
  const components = z
    .object({ database: databaseSchema, controlState: controlSchema, assets: assetsSchema })
    .strict()
    .parse(result)
  const key = recoveryObjectKey('daily-manifests/' + z.iso.date().parse(target.date) + '.json')
  const body = new TextEncoder().encode(
    JSON.stringify({
      version: 1,
      environment: 'production',
      date: target.date,
      timeZone: 'Asia/Hong_Kong',
      database: components.database,
      controlState: components.controlState,
      assets: components.assets,
      completedAt: completedAt.toISOString(),
    }) + '\n',
  )
  const sha256 = createHash('sha256').update(body).digest('hex')
  return { key, body, sha256 }
}

export async function replicateDailyProtectionManifest(
  manifest: ReturnType<typeof createDailyProtectionManifest>,
  replicas: readonly [
    Pick<ObjectStorage, 'putObject' | 'getObject'>,
    Pick<ObjectStorage, 'putObject' | 'getObject'>,
  ],
) {
  for (const storage of replicas) {
    await storage.putObject({
      key: manifest.key,
      body: manifest.body,
      contentType: 'application/json',
      cacheControl: 'private, no-store',
      metadata: { sha256: manifest.sha256 },
    })
    const readBack = new Uint8Array(
      await new Response((await storage.getObject(manifest.key)).body).arrayBuffer(),
    )
    if (createHash('sha256').update(readBack).digest('hex') !== manifest.sha256)
      throw new Error('Daily protection manifest read-back hash mismatch')
  }
  return { key: manifest.key, sha256: manifest.sha256 }
}

export function createDailyProtectionServices(
  configuration: RecoveryConfiguration,
  environment: Readonly<Record<string, string | undefined>>,
): DailyProtectionServices {
  const source = parseAssetStorageConfiguration(environment)
  if (
    source.bucket === configuration.offsite.bucket ||
    source.accessKeyId === configuration.offsite.accessKeyId
  ) {
    throw new Error('Asset source and off-site target must use separate buckets and credentials')
  }
  const component = (record: ReturnType<typeof listRecoveryBackups>[number]) =>
    databaseSchema.parse({
      status: 'completed',
      backupId: record.backupId,
      backupType: record.backupType,
      repositoryGeneration: record.repositoryGeneration,
      manifestSha256: record.manifestSha256,
      primaryReplicaStatus: record.primaryReplicaStatus,
      offsiteReplicaStatus: record.offsiteReplicaStatus,
    })
  return {
    async findExistingDatabase(target) {
      const record = listRecoveryBackups(configuration.controlStatePath, 100).find(
        (item) =>
          item.backupType === target.databaseBackupType &&
          item.primaryReplicaStatus === 'fresh' &&
          (hongKongDate(item.createdAt) === target.date ||
            hongKongDate(item.completedAt) === target.date),
      )
      if (!record) return null
      if (!record.valid || record.offsiteReplicaStatus !== 'fresh') {
        await executeOffsiteReplicaRetry(configuration, record.backupId)
        const retried = listRecoveryBackups(configuration.controlStatePath, 100).find(
          (item) => item.backupId === record.backupId,
        )
        if (!retried?.valid)
          throw new Error('Daily database replica retry did not verify both copies')
        return component(retried)
      }
      return component(record)
    },
    async database(target) {
      const result = await executeDatabaseBackup(configuration, target.databaseBackupType, {
        includeControlState: false,
        reuseCompletedDate: target.date,
      })
      return component(result.backup)
    },
    async controlState() {
      const result = await executeControlStateBackup(configuration)
      return controlSchema.parse({
        status: 'completed',
        objectKey: result.artifact.objectKey,
        sha256: result.artifact.encryptedSha256,
      })
    },
    async assets() {
      const report = await executeAssetBackup(source, configuration.offsite, { execute: true })
      if (report.sourceUnavailable > 0 || !report.manifestKey || !report.manifestSha256) {
        throw new Error('Asset backup did not verify every source object and its manifest')
      }
      return assetsSchema.parse({
        status: 'completed',
        sourceObjects: report.sourceObjects,
        copied: report.copied,
        updated: report.updated,
        unchanged: report.unchanged,
        targetOnlyPreserved: report.preservedTargetOnly,
        manifestKey: report.manifestKey,
        manifestSha256: report.manifestSha256,
      })
    },
    async manifest(target, result) {
      const manifest = createDailyProtectionManifest(target, result)
      const primary = new S3ObjectStorageAdapter(configuration.primary)
      const offsite = new S3ObjectStorageAdapter(configuration.offsite)
      try {
        return await replicateDailyProtectionManifest(manifest, [primary, offsite])
      } finally {
        primary.destroy()
        offsite.destroy()
      }
    },
  }
}

export async function runDailyProtection(
  target: DailyProtectionTarget,
  prior: unknown,
  services: DailyProtectionServices,
  checkpoint: (progress: DailyProtectionProgress) => void,
  beforeComponent: () => void = () => {},
) {
  const validated = z
    .object({
      date: z.iso.date(),
      databaseBackupType: z.enum(['full', 'diff']),
      environment: z.literal('production'),
    })
    .strict()
    .parse(target)
  let progress = dailyProtectionProgressSchema.parse(prior ?? {})
  const update = (value: DailyProtectionProgress) => {
    progress = dailyProtectionProgressSchema.parse(value)
    checkpoint(progress)
  }
  try {
    beforeComponent()
    const database =
      progress.database ??
      (await services.findExistingDatabase(validated)) ??
      (await services.database(validated))
    update({ ...progress, database, failedComponent: undefined })
  } catch (error: unknown) {
    update({ ...progress, failedComponent: 'database' })
    throw error
  }
  try {
    beforeComponent()
    const controlState = progress.controlState ?? (await services.controlState())
    update({ ...progress, controlState, failedComponent: undefined })
  } catch (error: unknown) {
    update({ ...progress, failedComponent: 'controlState' })
    throw error
  }
  try {
    beforeComponent()
    const assets = progress.assets ?? (await services.assets())
    update({ ...progress, assets, failedComponent: undefined })
  } catch (error: unknown) {
    update({ ...progress, failedComponent: 'assets' })
    throw error
  }
  try {
    beforeComponent()
    if (!progress.database || !progress.controlState || !progress.assets)
      throw new Error('Daily protection components are incomplete')
    const manifest = await services.manifest(validated, {
      database: progress.database,
      controlState: progress.controlState,
      assets: progress.assets,
    })
    update({
      ...progress,
      manifestKey: manifest.key,
      manifestSha256: manifest.sha256,
      failedComponent: undefined,
    })
  } catch (error: unknown) {
    update({ ...progress, failedComponent: 'manifest' })
    throw error
  }
  return progress
}
