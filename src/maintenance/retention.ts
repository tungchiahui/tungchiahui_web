import { createHash } from 'node:crypto'

import { z } from 'zod'

import type { InfrastructureOperation, RecoveryBackupRecord } from '../control-plane/control-state'
import type { DeploymentConfiguration } from '../deployment/configuration'
import { requestDockerJson } from '../deployment/docker-platform'
import type { RecoveryConfiguration } from '../recovery/configuration'
import { recoveryObjectKey } from '../recovery/object-policy'
import { S3ObjectStorageAdapter } from '../storage/s3-adapter'

export const retentionPolicy = Object.freeze({
  backupMinimumVerifiedFullChains: 4,
  backupRetentionDays: 90,
  dockerReleaseCount: 5,
  ghcrMinimumAgeDays: 30,
  ghcrReleaseCount: 20,
})

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const releaseShaSchema = z.string().regex(/^[a-f0-9]{40}$/)

const dockerImageSummarySchema = z.object({
  Created: z.number().int().nonnegative(),
  Id: z.string().regex(/^sha256:[a-f0-9]{64}$/),
  Labels: z.record(z.string(), z.string()).nullable().optional(),
  RepoTags: z.array(z.string()).nullable().optional(),
})

const dockerContainerSummarySchema = z.object({
  ImageID: z.string().regex(/^sha256:[a-f0-9]{64}$/),
})

export const retentionCleanupPlanSchema = z
  .object({
    backup: z.object({
      blockedReason: z.string().nullable(),
      cutoff: z.iso.datetime({ offset: true }),
      delete: z.array(
        z.object({
          backupId: z.string().min(1),
          completedAt: z.iso.datetime({ offset: true }),
          offsiteObjectKeys: z.array(z.string()),
          primaryObjectKeys: z.array(z.string()),
          repositoryGeneration: z.string().min(1),
        }),
      ),
      protectedFullChains: z.array(z.string()),
    }),
    docker: z.object({
      delete: z.array(
        z.object({
          createdAt: z.iso.datetime({ offset: true }),
          imageId: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          releaseShas: z.array(releaseShaSchema),
          repoTags: z.array(z.string()),
        }),
      ),
      protectedContainerImageIds: z.array(z.string()),
      protectedReleaseShas: z.array(releaseShaSchema),
      repositories: z.array(z.string()).length(4),
    }),
    evaluatedAt: z.iso.datetime({ offset: true }),
    planSha256: sha256Schema,
    policy: z.object({
      backupMinimumVerifiedFullChains: z.literal(4),
      backupRetentionDays: z.literal(90),
      dockerReleaseCount: z.literal(5),
      ghcrMinimumAgeDays: z.literal(30),
      ghcrReleaseCount: z.literal(20),
    }),
    version: z.literal(1),
  })
  .strict()

export type RetentionCleanupPlan = Readonly<z.infer<typeof retentionCleanupPlanSchema>>

function fullChainId(backupId: string) {
  return /^(\d{8}-\d{6}F)(?:_|$)/.exec(backupId)?.[1] ?? null
}

function canonicalPlanSha256(plan: unknown) {
  return createHash('sha256').update(JSON.stringify(plan)).digest('hex')
}

function projectRepositories(configuration: DeploymentConfiguration) {
  const base = z.string().min(1).parse(configuration.DEPLOYMENT_IMAGE_REPOSITORY)
  return Object.freeze([base, `${base}-postgres`, `${base}-recovery`, `${base}-service`].toSorted())
}

function tagParts(tag: string) {
  const separator = tag.lastIndexOf(':')
  if (separator <= tag.lastIndexOf('/')) return null
  const repository = tag.slice(0, separator)
  const releaseSha = releaseShaSchema.safeParse(tag.slice(separator + 1))
  return releaseSha.success ? Object.freeze({ releaseSha: releaseSha.data, repository }) : null
}

export function planDockerRetention(
  rawImages: unknown,
  rawContainers: unknown,
  repositories: readonly string[],
  explicitProtectedReleaseShas: readonly string[],
) {
  const images = z.array(dockerImageSummarySchema).parse(rawImages)
  const containers = z.array(dockerContainerSummarySchema).parse(rawContainers)
  const allowed = new Set(repositories)
  const containerImageIds = new Set(containers.map((container) => container.ImageID))
  const releaseCreated = new Map<string, number>()
  for (const image of images) {
    for (const tag of image.RepoTags ?? []) {
      const parts = tagParts(tag)
      if (parts && allowed.has(parts.repository)) {
        releaseCreated.set(
          parts.releaseSha,
          Math.max(releaseCreated.get(parts.releaseSha) ?? 0, image.Created),
        )
      }
    }
  }
  const newest = [...releaseCreated.entries()]
    .toSorted(
      ([shaA, createdA], [shaB, createdB]) => createdB - createdA || shaA.localeCompare(shaB),
    )
    .slice(0, retentionPolicy.dockerReleaseCount)
    .map(([sha]) => sha)
  const protectedReleaseShas = new Set([
    ...newest,
    ...explicitProtectedReleaseShas.map((sha) => releaseShaSchema.parse(sha)),
  ])
  const deletions = images.flatMap((image) => {
    if (containerImageIds.has(image.Id)) return []
    const repoTags = (image.RepoTags ?? []).toSorted()
    if (repoTags.length === 0) return []
    const parts = repoTags.map(tagParts)
    if (parts.some((part) => part === null || !allowed.has(part.repository))) return []
    const releaseShas = Array.from(
      new Set(parts.flatMap((part) => (part === null ? [] : [part.releaseSha]))),
    ).toSorted()
    if (releaseShas.some((sha) => protectedReleaseShas.has(sha))) return []
    return [
      Object.freeze({
        createdAt: new Date(image.Created * 1_000).toISOString(),
        imageId: image.Id,
        releaseShas,
        repoTags,
      }),
    ]
  })
  return Object.freeze({
    delete: Object.freeze(deletions.toSorted((a, b) => a.imageId.localeCompare(b.imageId))),
    protectedContainerImageIds: Object.freeze([...containerImageIds].toSorted()),
    protectedReleaseShas: Object.freeze([...protectedReleaseShas].toSorted()),
    repositories: Object.freeze([...repositories].toSorted()),
  })
}

export function planBackupRetention(
  records: readonly RecoveryBackupRecord[],
  operations: readonly InfrastructureOperation[],
  evaluatedAt: Date,
) {
  const cutoff = new Date(
    evaluatedAt.getTime() - retentionPolicy.backupRetentionDays * 24 * 60 * 60 * 1_000,
  )
  const competing = operations.find(
    (operation) =>
      operation.status !== 'completed' &&
      operation.status !== 'failed' &&
      operation.status !== 'cancelled' &&
      (operation.operationType === 'restore' ||
        (operation.operationType === 'recovery' &&
          operation.target.action !== 'retention-cleanup')),
  )
  const verifiedRoots = records
    .filter(
      (record) =>
        record.retiredAt === null &&
        record.backupType === 'full' &&
        record.valid &&
        record.primaryReplicaStatus === 'fresh' &&
        record.offsiteReplicaStatus === 'fresh',
    )
    .toSorted(
      (a, b) => b.completedAt.localeCompare(a.completedAt) || b.backupId.localeCompare(a.backupId),
    )
    .flatMap((record) => {
      const root = fullChainId(record.backupId)
      return root === null ? [] : [root]
    })
  const protectedFullChains = Array.from(new Set(verifiedRoots)).slice(
    0,
    retentionPolicy.backupMinimumVerifiedFullChains,
  )
  const blockedReason =
    competing !== undefined
      ? `incomplete ${competing.operationType} operation ${competing.id}`
      : protectedFullChains.length < retentionPolicy.backupMinimumVerifiedFullChains
        ? `only ${String(protectedFullChains.length)} verified Full chains are available`
        : null
  const protectedRoots = new Set(protectedFullChains)
  const candidates =
    blockedReason === null
      ? records.filter((record) => {
          const root = fullChainId(record.backupId)
          return (
            record.retiredAt === null &&
            new Date(record.completedAt).getTime() < cutoff.getTime() &&
            root !== null &&
            !protectedRoots.has(root)
          )
        })
      : []
  return Object.freeze({
    blockedReason,
    candidates: Object.freeze(candidates),
    cutoff: cutoff.toISOString(),
    protectedFullChains: Object.freeze(protectedFullChains),
  })
}

async function listReplicaKeys(configuration: RecoveryConfiguration, generation: string) {
  const prefix = `${recoveryObjectKey(`database-backups/${generation}`)}/`
  const primary = new S3ObjectStorageAdapter(configuration.primary)
  const offsite = new S3ObjectStorageAdapter(configuration.offsite)
  try {
    const [primaryObjectKeys, offsiteObjectKeys] = await Promise.all([
      primary.listObjects(prefix),
      offsite.listObjects(prefix),
    ])
    return Object.freeze({ offsiteObjectKeys, primaryObjectKeys })
  } finally {
    primary.destroy()
    offsite.destroy()
  }
}

export async function createRetentionCleanupPlan(
  input: Readonly<{
    backups: readonly RecoveryBackupRecord[]
    deployment: DeploymentConfiguration
    dockerSocketPath: string
    evaluatedAt: Date
    operations: readonly InfrastructureOperation[]
    recovery: RecoveryConfiguration
    runtimeReleaseShas: readonly string[]
  }>,
) {
  const evaluatedAt = new Date(input.evaluatedAt)
  if (!Number.isFinite(evaluatedAt.getTime()))
    throw new Error('Retention evaluation time is invalid')
  const repositories = projectRepositories(input.deployment)
  const [rawImages, rawContainers] = await Promise.all([
    requestDockerJson(input.dockerSocketPath, 'GET', '/images/json?all=1'),
    requestDockerJson(input.dockerSocketPath, 'GET', '/containers/json?all=1'),
  ])
  if (rawImages.status !== 200 || rawContainers.status !== 200) {
    throw new Error('Docker inventory could not be read for retention planning')
  }
  const docker = planDockerRetention(
    rawImages.body,
    rawContainers.body,
    repositories,
    input.runtimeReleaseShas,
  )
  const backupCandidates = planBackupRetention(input.backups, input.operations, evaluatedAt)
  const backupDelete = await Promise.all(
    backupCandidates.candidates.map(async (record) => {
      const keys = await listReplicaKeys(input.recovery, record.repositoryGeneration)
      return Object.freeze({
        backupId: record.backupId,
        completedAt: record.completedAt,
        offsiteObjectKeys: keys.offsiteObjectKeys,
        primaryObjectKeys: keys.primaryObjectKeys,
        repositoryGeneration: record.repositoryGeneration,
      })
    }),
  )
  const withoutHash = Object.freeze({
    backup: Object.freeze({
      blockedReason: backupCandidates.blockedReason,
      cutoff: backupCandidates.cutoff,
      delete: Object.freeze(backupDelete.toSorted((a, b) => a.backupId.localeCompare(b.backupId))),
      protectedFullChains: backupCandidates.protectedFullChains,
    }),
    docker,
    evaluatedAt: evaluatedAt.toISOString(),
    policy: retentionPolicy,
    version: 1 as const,
  })
  return retentionCleanupPlanSchema.parse({
    ...withoutHash,
    planSha256: canonicalPlanSha256(withoutHash),
  })
}

async function deleteKeys(configuration: RecoveryConfiguration, plan: RetentionCleanupPlan) {
  const primary = new S3ObjectStorageAdapter(configuration.primary)
  const offsite = new S3ObjectStorageAdapter(configuration.offsite)
  try {
    for (const candidate of plan.backup.delete) {
      for (const key of candidate.primaryObjectKeys) await primary.deleteObject(key)
      for (const key of candidate.offsiteObjectKeys) await offsite.deleteObject(key)
      const prefix = `${recoveryObjectKey(`database-backups/${candidate.repositoryGeneration}`)}/`
      const [primaryRemaining, offsiteRemaining] = await Promise.all([
        primary.listObjects(prefix),
        offsite.listObjects(prefix),
      ])
      if (primaryRemaining.length > 0 || offsiteRemaining.length > 0) {
        throw new Error(`Backup generation ${candidate.repositoryGeneration} was not fully deleted`)
      }
    }
  } finally {
    primary.destroy()
    offsite.destroy()
  }
}

export async function executeRetentionCleanup(
  plan: RetentionCleanupPlan,
  recovery: RecoveryConfiguration,
  dockerSocketPath: string,
) {
  await deleteKeys(recovery, plan)
  for (const image of plan.docker.delete) {
    const response = await requestDockerJson(
      dockerSocketPath,
      'DELETE',
      `/images/${encodeURIComponent(image.imageId)}?force=0&noprune=1`,
    )
    if (response.status !== 200 && response.status !== 404) {
      throw new Error(`Docker refused retention deletion for ${image.imageId}`)
    }
  }
  return Object.freeze({
    backupRecordsDeleted: plan.backup.delete.length,
    dockerImagesDeleted: plan.docker.delete.length,
    planSha256: plan.planSha256,
  })
}
