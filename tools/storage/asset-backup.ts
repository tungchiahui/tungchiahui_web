import { createHash } from 'node:crypto'

import { z } from 'zod'

import type {
  ObjectStorage,
  ReadOnlyObjectStorage,
  StorageObject,
} from '../../src/storage/contracts'
import { StorageObjectNotFoundError } from '../../src/storage/contracts'

const reservedTargetPrefixes = Object.freeze(['asset-backups/'])

const manifestObjectSchema = z.object({
  bytes: z.number().int().nonnegative(),
  cacheControl: z.string().optional(),
  contentType: z.string().optional(),
  key: z.string().min(1),
  sha256: z.string().regex(/^[a-f0-9]{64}$/u),
})

const assetBackupManifestSchema = z.object({
  completedAt: z.iso.datetime(),
  objectCount: z.number().int().nonnegative(),
  objects: z.array(manifestObjectSchema),
  schemaVersion: z.literal(1),
  semantics: z.literal('copy-add-update-preserve-target-only'),
  totalBytes: z.number().int().nonnegative(),
})

export type AssetBackupProgress = Readonly<{
  checked: number
  copied: number
  listedSourceObjects: number
  sourceObjects: number
  sourceUnavailable: number
  updated: number
}>

export type AssetBackupReport = Readonly<{
  checked: number
  copied: number
  listedSourceObjects: number
  manifestKey?: string
  preservedTargetOnly: number
  sourceObjects: number
  sourceUnavailable: number
  totalBytes: number
  unchanged: number
  updated: number
  verifiedWrites: number
}>

type AssetBackupOptions = Readonly<{
  concurrency?: number
  execute: boolean
  now?: Date
  onProgress?: (progress: AssetBackupProgress) => void
}>

async function readObject(object: StorageObject) {
  const reader = object.body.getReader()
  const chunks: Uint8Array[] = []
  let bytes = 0
  while (true) {
    const result = await reader.read()
    if (result.done) break
    chunks.push(result.value)
    bytes += result.value.byteLength
  }
  const body = new Uint8Array(bytes)
  let offset = 0
  for (const chunk of chunks) {
    body.set(chunk, offset)
    offset += chunk.byteLength
  }
  return Object.freeze({
    body,
    sha256: createHash('sha256').update(body).digest('hex'),
  })
}

function manifestTimestamp(now: Date) {
  return now.toISOString().replaceAll(':', '-').replace('.000Z', 'Z')
}

function isReservedTargetKey(key: string) {
  return reservedTargetPrefixes.some((prefix) => key.startsWith(prefix))
}

function bodyStream(body: Uint8Array): ReadableStream<Uint8Array> {
  return new ReadableStream({
    start(controller) {
      controller.enqueue(body)
      controller.close()
    },
  })
}

async function putAndVerify(
  target: ObjectStorage,
  sourceObject: StorageObject,
  key: string,
  body: Uint8Array,
  expectedSha256: string,
) {
  await target.putObject({
    body,
    cacheControl: sourceObject.cacheControl ?? 'no-cache',
    contentType: sourceObject.contentType ?? 'application/octet-stream',
    key,
    metadata: {
      ...sourceObject.metadata,
      'source-sha256': expectedSha256,
    },
  })
  const verified = await readObject(await getObjectWithRetry(target, key))
  if (verified.sha256 !== expectedSha256) {
    throw new Error(`Asset backup read-back hash mismatch for ${key}`)
  }
}

async function getObjectWithRetry(storage: ReadOnlyObjectStorage, key: string) {
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await storage.getObject(key)
    } catch (error: unknown) {
      if (!(error instanceof StorageObjectNotFoundError) || attempt === 3) throw error
      await new Promise<void>((resolve) => setTimeout(resolve, attempt * 250))
    }
  }
  throw new Error('Unreachable object retry state')
}

export async function backupAssets(
  source: ReadOnlyObjectStorage,
  target: ObjectStorage,
  options: AssetBackupOptions,
): Promise<AssetBackupReport> {
  const sourceKeys = await source.listObjects('')
  const targetKeys = await target.listObjects('')
  const unsafeSourceKey = sourceKeys.find(isReservedTargetKey)
  if (unsafeSourceKey !== undefined) {
    throw new Error(`Asset source key collides with reserved backup namespace: ${unsafeSourceKey}`)
  }

  const targetAssetKeys = targetKeys.filter((key) => !isReservedTargetKey(key))
  const targetAssetSet = new Set(targetAssetKeys)
  const availableSourceSet = new Set<string>()
  const objects: Array<z.infer<typeof manifestObjectSchema> | undefined> = new Array(
    sourceKeys.length,
  )
  const concurrency = z
    .number()
    .int()
    .min(1)
    .max(32)
    .parse(options.concurrency ?? 12)
  let copied = 0
  let completed = 0
  let nextIndex = 0
  let sourceUnavailable = 0
  let totalBytes = 0
  let unchanged = 0
  let updated = 0
  let verifiedWrites = 0

  async function worker() {
    while (true) {
      const index = nextIndex
      nextIndex += 1
      const key = sourceKeys[index]
      if (key === undefined) return

      let sourceObject: StorageObject
      try {
        sourceObject = await getObjectWithRetry(source, key)
      } catch (error: unknown) {
        if (!(error instanceof StorageObjectNotFoundError)) throw error
        sourceUnavailable += 1
        completed += 1
        if (completed === sourceKeys.length || completed % 100 === 0) {
          options.onProgress?.({
            checked: completed,
            copied,
            listedSourceObjects: sourceKeys.length,
            sourceObjects: completed - sourceUnavailable,
            sourceUnavailable,
            updated,
          })
        }
        continue
      }
      availableSourceSet.add(key)
      const sourceContent = await readObject(sourceObject)
      totalBytes += sourceContent.body.byteLength

      let matches = false
      if (targetAssetSet.has(key)) {
        try {
          const targetContent = await readObject(await getObjectWithRetry(target, key))
          matches = targetContent.sha256 === sourceContent.sha256
        } catch (error: unknown) {
          if (!(error instanceof StorageObjectNotFoundError)) throw error
          targetAssetSet.delete(key)
        }
      }

      if (matches) {
        unchanged += 1
      } else if (options.execute) {
        await putAndVerify(target, sourceObject, key, sourceContent.body, sourceContent.sha256)
        verifiedWrites += 1
        if (targetAssetSet.has(key)) updated += 1
        else copied += 1
      } else if (targetAssetSet.has(key)) {
        updated += 1
      } else {
        copied += 1
      }

      objects[index] = {
        bytes: sourceContent.body.byteLength,
        ...(sourceObject.cacheControl === undefined
          ? {}
          : { cacheControl: sourceObject.cacheControl }),
        ...(sourceObject.contentType === undefined
          ? {}
          : { contentType: sourceObject.contentType }),
        key,
        sha256: sourceContent.sha256,
      }

      completed += 1
      if (completed === sourceKeys.length || completed % 100 === 0) {
        options.onProgress?.({
          checked: completed,
          copied,
          listedSourceObjects: sourceKeys.length,
          sourceObjects: completed - sourceUnavailable,
          sourceUnavailable,
          updated,
        })
      }
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, sourceKeys.length) }, async () => worker()),
  )

  const completedObjects = objects.filter(
    (object): object is z.infer<typeof manifestObjectSchema> => object !== undefined,
  )
  const preservedTargetOnly = targetAssetKeys.filter((key) => !availableSourceSet.has(key)).length
  let manifestKey: string | undefined
  if (options.execute) {
    const completedAt = options.now ?? new Date()
    const manifest = assetBackupManifestSchema.parse({
      completedAt: completedAt.toISOString(),
      objectCount: completedObjects.length,
      objects: completedObjects,
      schemaVersion: 1,
      semantics: 'copy-add-update-preserve-target-only',
      totalBytes,
    })
    const manifestBody = new TextEncoder().encode(`${JSON.stringify(manifest)}\n`)
    const manifestSha256 = createHash('sha256').update(manifestBody).digest('hex')
    manifestKey = `asset-backups/manifests/${manifestTimestamp(completedAt)}-${manifestSha256}.json`
    await putAndVerify(
      target,
      { body: bodyStream(manifestBody), metadata: {} },
      manifestKey,
      manifestBody,
      manifestSha256,
    )
    const latestBody = new TextEncoder().encode(
      `${JSON.stringify({ manifestKey, manifestSha256, schemaVersion: 1 })}\n`,
    )
    await putAndVerify(
      target,
      { body: bodyStream(latestBody), metadata: {} },
      'asset-backups/latest.json',
      latestBody,
      createHash('sha256').update(latestBody).digest('hex'),
    )
  }

  return Object.freeze({
    checked: sourceKeys.length,
    copied,
    listedSourceObjects: sourceKeys.length,
    ...(manifestKey === undefined ? {} : { manifestKey }),
    preservedTargetOnly,
    sourceObjects: completedObjects.length,
    sourceUnavailable,
    totalBytes,
    unchanged,
    updated,
    verifiedWrites,
  })
}
