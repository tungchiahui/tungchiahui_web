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
) {
  const storage = new S3ObjectStorageAdapter(configuration)
  const prefix = replicaPrefix(manifest)
  try {
    for (const entry of manifest.entries) {
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
    }
    await storage.putObject({
      body: serializeManifest(manifest),
      cacheControl: 'private, no-store',
      contentType: 'application/json',
      key: `${prefix}/manifest.json`,
      metadata: { sha256: repositoryManifestSha256(manifest) },
    })
    return await verifyRepositoryReplica(manifest, configuration)
  } finally {
    storage.destroy()
  }
}

export async function verifyRepositoryReplica(
  manifest: RepositoryManifest,
  configuration: S3ConnectionConfiguration,
) {
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
    for (const entry of manifest.entries) {
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
    }
    return Object.freeze({
      checkedAt: new Date().toISOString(),
      files: manifest.entries.length,
      manifestSha256: repositoryManifestSha256(manifest),
      status: 'fresh' as const,
      totalBytes: manifest.totalBytes,
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
