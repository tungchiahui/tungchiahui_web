import { spawnSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { readFileSync, rmSync } from 'node:fs'

import { z } from 'zod'

import {
  type ControlStateEnvironment,
  createConsistentControlStateSnapshot,
  inspectControlStateSnapshot,
  restoreControlStateSnapshot,
} from '../control-plane/control-state'
import type { S3ConnectionConfiguration } from '../storage/contracts'
import { S3ObjectStorageAdapter } from '../storage/s3-adapter'
import { recoveryObjectKey } from './object-policy'

export const encryptedControlStateArtifactSchema = z
  .object({
    auditDigest: z.string().regex(/^[a-f0-9]{64}$/),
    auditEventMaxId: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }),
    encryptedSha256: z.string().regex(/^[a-f0-9]{64}$/),
    environment: z.enum(['local', 'test', 'production']),
    objectKey: z.string().min(1),
    schemaVersion: z.literal(7),
    snapshotId: z.uuid(),
    version: z.literal(1),
  })
  .strict()

export type EncryptedControlStateArtifact = Readonly<
  z.infer<typeof encryptedControlStateArtifactSchema>
>

function serializeArtifact(artifact: EncryptedControlStateArtifact) {
  return `${JSON.stringify(encryptedControlStateArtifactSchema.parse(artifact))}\n`
}

function latestArtifactKey(environment: ControlStateEnvironment) {
  return recoveryObjectKey(`control-state/${environment}/latest.json`)
}

function runAge(arguments_: readonly string[]) {
  const result = spawnSync('age', arguments_, { encoding: 'utf8' })
  if (result.error) throw new Error(`Unable to run age: ${result.error.message}`)
  if (result.status !== 0) throw new Error('age failed while processing control-state backup')
}

export function createEncryptedControlStateArtifact(
  controlStatePath: string,
  workingSnapshotPath: string,
  encryptedPath: string,
  recipient: string,
  now = new Date(),
): EncryptedControlStateArtifact {
  const snapshotId = randomUUID()
  const evidence = createConsistentControlStateSnapshot(controlStatePath, workingSnapshotPath)
  rmSync(encryptedPath, { force: true })
  runAge([
    '--encrypt',
    '--recipient',
    z.string().startsWith('age1').parse(recipient),
    '--output',
    encryptedPath,
    workingSnapshotPath,
  ])
  const encryptedSha256 = createHash('sha256').update(readFileSync(encryptedPath)).digest('hex')
  return Object.freeze(
    encryptedControlStateArtifactSchema.parse({
      auditDigest: evidence.auditDigest,
      auditEventMaxId: evidence.auditEventMaxId,
      createdAt: now.toISOString(),
      encryptedSha256,
      environment: evidence.environment,
      objectKey: recoveryObjectKey(
        `control-state/${evidence.environment}/${snapshotId}.sqlite.age`,
      ),
      schemaVersion: evidence.schemaVersion,
      snapshotId,
      version: 1,
    }),
  )
}

export function restoreEncryptedControlStateArtifact(
  encryptedPath: string,
  decryptedPath: string,
  targetPath: string,
  identityPath: string,
  artifact: EncryptedControlStateArtifact,
  expectedEnvironment: ControlStateEnvironment,
) {
  const validated = encryptedControlStateArtifactSchema.parse(artifact)
  const digest = createHash('sha256').update(readFileSync(encryptedPath)).digest('hex')
  if (digest !== validated.encryptedSha256) {
    throw new Error('Encrypted control-state artifact checksum does not match its manifest')
  }
  rmSync(decryptedPath, { force: true })
  runAge([
    '--decrypt',
    '--identity',
    z.string().min(1).parse(identityPath),
    '--output',
    decryptedPath,
    encryptedPath,
  ])
  const evidence = inspectControlStateSnapshot(decryptedPath)
  if (
    evidence.auditDigest !== validated.auditDigest ||
    evidence.auditEventMaxId !== validated.auditEventMaxId
  ) {
    throw new Error('Decrypted control-state artifact failed audit continuity validation')
  }
  return restoreControlStateSnapshot(decryptedPath, targetPath, expectedEnvironment)
}

export async function replicateControlStateArtifact(
  encryptedPath: string,
  artifact: EncryptedControlStateArtifact,
  configuration: S3ConnectionConfiguration,
) {
  const validated = encryptedControlStateArtifactSchema.parse(artifact)
  const storage = new S3ObjectStorageAdapter(configuration)
  try {
    const body = readFileSync(encryptedPath)
    await storage.putObject({
      body,
      cacheControl: 'private, no-store',
      contentType: 'application/octet-stream',
      key: validated.objectKey,
      metadata: { sha256: validated.encryptedSha256 },
    })
    const manifestBody = serializeArtifact(validated)
    const manifestSha256 = createHash('sha256').update(manifestBody).digest('hex')
    for (const key of [
      recoveryObjectKey(
        `control-state/${validated.environment}/manifests/${validated.snapshotId}.json`,
      ),
      latestArtifactKey(validated.environment),
    ]) {
      await storage.putObject({
        body: manifestBody,
        cacheControl: 'private, no-store',
        contentType: 'application/json',
        key,
        metadata: { sha256: manifestSha256 },
      })
    }
    const object = await storage.getObject(validated.objectKey)
    const remoteBody = new Uint8Array(await new Response(object.body).arrayBuffer())
    const digest = createHash('sha256').update(remoteBody).digest('hex')
    if (digest !== validated.encryptedSha256) {
      throw new Error('Control-state replica checksum validation failed')
    }
    const latest = await storage.getObject(latestArtifactKey(validated.environment))
    const remoteArtifact = encryptedControlStateArtifactSchema.parse(
      JSON.parse(await new Response(latest.body).text()) as unknown,
    )
    if (serializeArtifact(remoteArtifact) !== manifestBody) {
      throw new Error('Control-state replica latest manifest validation failed')
    }
    return Object.freeze({
      checkedAt: new Date().toISOString(),
      objectKey: validated.objectKey,
      status: 'fresh' as const,
    })
  } finally {
    storage.destroy()
  }
}

export async function readLatestControlStateArtifact(
  configuration: S3ConnectionConfiguration,
  environment: ControlStateEnvironment,
) {
  const storage = new S3ObjectStorageAdapter(configuration)
  try {
    const object = await storage.getObject(latestArtifactKey(environment))
    const artifact = encryptedControlStateArtifactSchema.parse(
      JSON.parse(await new Response(object.body).text()) as unknown,
    )
    if (artifact.environment !== environment) {
      throw new Error(
        'Latest control-state artifact environment does not match the requested target',
      )
    }
    return artifact
  } finally {
    storage.destroy()
  }
}
