import { createHash } from 'node:crypto'
import {
  lstatSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'

import { z } from 'zod'
import type { S3ConnectionConfiguration } from '../storage/contracts'
import { S3ObjectStorageAdapter } from '../storage/s3-adapter'
import { recoveryObjectKey } from './object-policy'

const manifestEntrySchema = z.object({
  bytes: z.number().int().nonnegative(),
  linkTarget: z.string().min(1).optional(),
  path: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/),
  type: z.enum(['file', 'symlink']),
})

export const repositoryManifestSchema = z
  .object({
    backupId: z.string().min(1),
    createdAt: z.iso.datetime({ offset: true }),
    entries: z.array(manifestEntrySchema).min(1),
    generation: z.string().min(1),
    totalBytes: z.number().int().nonnegative(),
    version: z.literal(1),
  })
  .strict()

export type RepositoryManifest = Readonly<z.infer<typeof repositoryManifestSchema>>

function walkFiles(root: string, directory = root): string[] {
  return readdirSync(directory, { withFileTypes: true })
    .flatMap((entry) => {
      const path = join(directory, entry.name)
      if (entry.isDirectory()) return walkFiles(root, path)
      if (entry.isFile() || entry.isSymbolicLink()) return [path]
      throw new Error(`Backup repository contains an unsupported entry: ${path}`)
    })
    .sort()
}

function repositoryRelativePath(root: string, path: string) {
  const value = relative(root, path).split(sep).join('/')
  if (value.length === 0 || value.startsWith('../') || value.includes('/../')) {
    throw new Error('Backup repository file escaped the configured root')
  }
  return value
}

function serializeManifest(manifest: RepositoryManifest) {
  return `${JSON.stringify(manifest)}\n`
}

export function repositoryManifestSha256(manifest: RepositoryManifest) {
  return createHash('sha256').update(serializeManifest(manifest)).digest('hex')
}

export function createRepositoryManifest(
  repositoryPath: string,
  backupId: string,
  generation: string,
  now = new Date(),
): RepositoryManifest {
  const root = resolve(repositoryPath)
  const entries = walkFiles(root)
    .filter((path) => !path.endsWith('/phase13-manifest.json'))
    .map((path) => {
      if (lstatSync(path).isSymbolicLink()) {
        const linkTarget = readlinkSync(path)
        if (linkTarget.startsWith('/') || linkTarget.includes('..')) {
          throw new Error(`Backup repository contains an unsafe symbolic link: ${path}`)
        }
        const body = Buffer.from(linkTarget)
        return Object.freeze({
          bytes: body.byteLength,
          linkTarget,
          path: repositoryRelativePath(root, path),
          sha256: createHash('sha256').update(body).digest('hex'),
          type: 'symlink' as const,
        })
      }
      const body = readFileSync(path)
      return Object.freeze({
        bytes: body.byteLength,
        path: repositoryRelativePath(root, path),
        sha256: createHash('sha256').update(body).digest('hex'),
        type: 'file' as const,
      })
    })
  const totalBytes = entries.reduce((total, entry) => total + entry.bytes, 0)
  return Object.freeze(
    repositoryManifestSchema.parse({
      backupId,
      createdAt: now.toISOString(),
      entries,
      generation,
      totalBytes,
      version: 1,
    }),
  )
}

function replicaPrefix(manifest: RepositoryManifest) {
  return recoveryObjectKey(`database-backups/${manifest.generation}`)
}

function validatedConcurrency(value: number) {
  return z.number().int().min(1).max(32).parse(value)
}

async function runWithConcurrency<T>(
  values: readonly T[],
  concurrency: number,
  task: (value: T) => Promise<void>,
) {
  let nextIndex = 0
  async function worker() {
    while (true) {
      const value = values[nextIndex]
      nextIndex += 1
      if (value === undefined) return
      await task(value)
    }
  }
  await Promise.all(
    Array.from({ length: Math.min(validatedConcurrency(concurrency), values.length) }, worker),
  )
}

async function readBodyAndSha256(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader()
  const chunks: Uint8Array[] = []
  const digest = createHash('sha256')
  let bytes = 0
  while (true) {
    const chunk = await reader.read()
    if (chunk.done) break
    chunks.push(chunk.value)
    bytes += chunk.value.byteLength
    digest.update(chunk.value)
  }
  const value = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    value.set(chunk, offset)
    offset += chunk.byteLength
  }
  return Object.freeze({ body: value, sha256: digest.digest('hex') })
}

export function repositoryReplicaFileKeys(keys: readonly string[], repositoryPrefix: string) {
  return Object.freeze(
    Array.from(new Set(keys))
      .filter((key) => key !== repositoryPrefix)
      .sort(),
  )
}

export async function readRepositoryManifestFromReplica(
  generation: string,
  configuration: S3ConnectionConfiguration,
) {
  const parsedGeneration = z
    .string()
    .regex(/^[a-zA-Z0-9._:-]+$/)
    .parse(generation)
  const storage = new S3ObjectStorageAdapter(configuration)
  try {
    const object = await storage.getObject(
      recoveryObjectKey(`database-backups/${parsedGeneration}/manifest.json`),
    )
    return Object.freeze(
      repositoryManifestSchema.parse(JSON.parse(await new Response(object.body).text()) as unknown),
    )
  } finally {
    storage.destroy()
  }
}

export async function replicateRepository(
  repositoryPath: string,
  manifest: RepositoryManifest,
  configuration: S3ConnectionConfiguration,
  concurrency = 8,
) {
  const started = performance.now()
  const storage = new S3ObjectStorageAdapter(configuration)
  const prefix = replicaPrefix(manifest)
  try {
    await runWithConcurrency(manifest.entries, concurrency, async (entry) => {
      const body =
        entry.type === 'symlink'
          ? Buffer.from(entry.linkTarget ?? '')
          : readFileSync(join(repositoryPath, entry.path))
      await storage.putObject({
        body,
        cacheControl: 'private, no-store',
        contentType: 'application/octet-stream',
        key: `${prefix}/repository/${entry.path}`,
        metadata: { sha256: entry.sha256 },
      })
    })
    await storage.putObject({
      body: serializeManifest(manifest),
      cacheControl: 'private, no-store',
      contentType: 'application/json',
      key: `${prefix}/manifest.json`,
      metadata: { sha256: repositoryManifestSha256(manifest) },
    })
    const uploadedAt = performance.now()
    const verified = await verifyRepositoryReplica(manifest, configuration, concurrency)
    return Object.freeze({
      ...verified,
      totalSeconds: (performance.now() - started) / 1_000,
      transferSeconds: (uploadedAt - started) / 1_000,
      verificationSeconds: verified.verificationSeconds,
    })
  } finally {
    storage.destroy()
  }
}

export async function mirrorRepositoryReplica(
  manifest: RepositoryManifest,
  sourceConfiguration: S3ConnectionConfiguration,
  targetConfiguration: S3ConnectionConfiguration,
  concurrency = 8,
) {
  const started = performance.now()
  const source = new S3ObjectStorageAdapter(sourceConfiguration)
  const target = new S3ObjectStorageAdapter(targetConfiguration)
  const prefix = replicaPrefix(manifest)
  try {
    await runWithConcurrency(manifest.entries, concurrency, async (entry) => {
      const sourceObject = await source.getObject(`${prefix}/repository/${entry.path}`)
      const value = await readBodyAndSha256(sourceObject.body)
      if (value.sha256 !== entry.sha256) {
        throw new Error(`Primary backup replica checksum mismatch while mirroring: ${entry.path}`)
      }
      await target.putObject({
        body: value.body,
        cacheControl: 'private, no-store',
        contentType: 'application/octet-stream',
        key: `${prefix}/repository/${entry.path}`,
        metadata: { sha256: entry.sha256 },
      })
    })
    const manifestBody = serializeManifest(manifest)
    await target.putObject({
      body: manifestBody,
      cacheControl: 'private, no-store',
      contentType: 'application/json',
      key: `${prefix}/manifest.json`,
      metadata: { sha256: repositoryManifestSha256(manifest) },
    })
    const mirroredAt = performance.now()
    const verified = await verifyRepositoryReplica(manifest, targetConfiguration, concurrency)
    return Object.freeze({
      ...verified,
      totalSeconds: (performance.now() - started) / 1_000,
      transferSeconds: (mirroredAt - started) / 1_000,
      verificationSeconds: verified.verificationSeconds,
    })
  } finally {
    source.destroy()
    target.destroy()
  }
}

export async function verifyRepositoryReplica(
  manifest: RepositoryManifest,
  configuration: S3ConnectionConfiguration,
  concurrency = 8,
) {
  const started = performance.now()
  const storage = new S3ObjectStorageAdapter(configuration)
  const prefix = replicaPrefix(manifest)
  try {
    const object = await storage.getObject(`${prefix}/manifest.json`)
    const remoteManifest = repositoryManifestSchema.parse(
      JSON.parse(await new Response(object.body).text()) as unknown,
    )
    if (repositoryManifestSha256(remoteManifest) !== repositoryManifestSha256(manifest)) {
      throw new Error('Backup replica manifest hash does not match the local repository')
    }
    const repositoryPrefix = `${prefix}/repository/`
    const keys = repositoryReplicaFileKeys(
      await storage.listObjects(repositoryPrefix),
      repositoryPrefix,
    )
    const expectedKeys = new Set(
      manifest.entries.map((entry) => `${repositoryPrefix}${entry.path}`),
    )
    if (keys.length !== manifest.entries.length || keys.some((key) => !expectedKeys.has(key))) {
      throw new Error('Backup replica file count does not match the repository manifest')
    }
    await runWithConcurrency(manifest.entries, concurrency, async (entry) => {
      const remote = await storage.getObject(`${prefix}/repository/${entry.path}`)
      const digest = createHash('sha256')
      const reader = remote.body.getReader()
      while (true) {
        const chunk = await reader.read()
        if (chunk.done) break
        digest.update(chunk.value)
      }
      if (digest.digest('hex') !== entry.sha256) {
        throw new Error(`Backup replica checksum mismatch: ${entry.path}`)
      }
    })
    return Object.freeze({
      checkedAt: new Date().toISOString(),
      files: manifest.entries.length,
      manifestSha256: repositoryManifestSha256(manifest),
      status: 'fresh' as const,
      totalBytes: manifest.totalBytes,
      verificationSeconds: (performance.now() - started) / 1_000,
    })
  } finally {
    storage.destroy()
  }
}

export async function materializeRepositoryReplica(
  manifest: RepositoryManifest,
  destinationPath: string,
  configuration: S3ConnectionConfiguration,
) {
  const destination = resolve(destinationPath)
  mkdirSync(destination, { mode: 0o700, recursive: true })
  for (const entry of readdirSync(destination)) {
    rmSync(join(destination, entry), { force: true, recursive: true })
  }
  const storage = new S3ObjectStorageAdapter(configuration)
  const prefix = replicaPrefix(manifest)
  try {
    for (const entry of manifest.entries) {
      const object = await storage.getObject(`${prefix}/repository/${entry.path}`)
      const body = new Uint8Array(await new Response(object.body).arrayBuffer())
      if (createHash('sha256').update(body).digest('hex') !== entry.sha256) {
        throw new Error(`Backup replica checksum mismatch during restore: ${entry.path}`)
      }
      const path = join(destination, entry.path)
      mkdirSync(dirname(path), { mode: 0o700, recursive: true })
      repositorySafeParent(path, destination)
      if (entry.type === 'symlink') {
        if (!entry.linkTarget) {
          throw new Error(`Backup replica symlink target is missing: ${entry.path}`)
        }
        symlinkSync(entry.linkTarget, path)
      } else {
        writeFileSync(path, body, { mode: 0o600 })
      }
    }
    return verifyLocalRepository(destination, manifest)
  } finally {
    storage.destroy()
  }
}

function repositorySafeParent(path: string, root: string) {
  const parent = dirname(path)
  if (parent !== root && !parent.startsWith(`${root}${sep}`)) {
    throw new Error('Backup replica restore escaped the configured repository root')
  }
  return parent
}

export function verifyLocalRepository(repositoryPath: string, manifest: RepositoryManifest) {
  for (const entry of manifest.entries) {
    const path = join(repositoryPath, entry.path)
    const body = entry.type === 'symlink' ? Buffer.from(readlinkSync(path)) : readFileSync(path)
    if (body.byteLength !== entry.bytes) {
      throw new Error(`Backup repository size mismatch: ${entry.path}`)
    }
    if (createHash('sha256').update(body).digest('hex') !== entry.sha256) {
      throw new Error(`Backup repository checksum mismatch: ${entry.path}`)
    }
  }
  return Object.freeze({
    files: manifest.entries.length,
    manifestSha256: repositoryManifestSha256(manifest),
    status: 'readable' as const,
    totalBytes: manifest.totalBytes,
  })
}
