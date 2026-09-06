import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { type ObjectStorage, StorageObjectNotFoundError } from '../../src/storage/contracts'
import { assetCachePolicy, buildCdnAssetUrl } from '../../src/storage/policy'

const contractReportSchema = z.object({
  cases: z.array(z.string().min(1)),
  cleanup: z.literal('complete'),
  objectCount: z.number().int().positive(),
  prefix: z.string().min(1),
})

export type StorageContractReport = z.infer<typeof contractReportSchema>

async function readBody(body: ReadableStream<Uint8Array>) {
  return new Uint8Array(await new Response(body).arrayBuffer())
}

function normalizedContentType(value: string | undefined) {
  return value?.replaceAll(/\s/gu, '').toLowerCase()
}

function equalBytes(actual: Uint8Array, expected: Uint8Array, label: string) {
  if (
    actual.length !== expected.length ||
    actual.some((value, index) => value !== expected[index])
  ) {
    throw new Error(`${label} did not round-trip exactly`)
  }
}

async function expectMissing(operation: () => Promise<unknown>, label: string) {
  try {
    await operation()
  } catch (error: unknown) {
    if (error instanceof StorageObjectNotFoundError) return
    throw error
  }
  throw new Error(`${label} unexpectedly found a missing object`)
}

async function fetchPublicAsset(url: URL, expectedBody: Uint8Array) {
  let lastResult = 'no response'
  for (let attempt = 1; attempt <= 10; attempt += 1) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) })
      if (response.ok) {
        const body = new Uint8Array(await response.arrayBuffer())
        equalBytes(body, expectedBody, 'CDN object')
        if (
          normalizedContentType(response.headers.get('content-type') ?? undefined) !==
          'image/svg+xml'
        ) {
          throw new Error('CDN did not preserve the expected Content-Type')
        }
        const cacheControl = response.headers.get('cache-control') ?? ''
        const maxAge = /(?:^|,)\s*max-age=(\d+)/iu.exec(cacheControl)?.[1]
        if (maxAge === undefined || Number.parseInt(maxAge, 10) < 86_400) {
          throw new Error('CDN did not provide the minimum immutable-asset cache lifetime')
        }
        const anonymousWrite = await fetch(url, {
          body: 'anonymous-write-must-fail',
          method: 'PUT',
          signal: AbortSignal.timeout(10_000),
        })
        if (anonymousWrite.ok) {
          throw new Error('Public CDN read path unexpectedly accepted an anonymous write')
        }
        return
      }
      lastResult = `HTTP ${response.status}`
    } catch (error: unknown) {
      lastResult = error instanceof Error ? error.message : String(error)
    }
    if (attempt < 10) await new Promise<void>((resolveWait) => setTimeout(resolveWait, 1_000))
  }
  throw new Error(`CDN object was not readable after bounded propagation retries: ${lastResult}`)
}

export async function runStorageContract(
  storage: ObjectStorage,
  options: Readonly<{ cdnBaseUrl?: URL; prefix?: string }> = {},
): Promise<StorageContractReport> {
  const prefix = options.prefix ?? `tungchiahui-contract/${randomUUID()}-`
  const keys = Object.freeze({
    delete: `${prefix}delete-me.txt`,
    immutable: `${prefix}immutable-phase-11-中文.svg`,
    large: `${prefix}representative-size.bin`,
    mutable: `${prefix}mutable-current.txt`,
    overwrite: `${prefix}overwrite.txt`,
  })
  const createdKeys = new Set<string>()
  const cases: string[] = []
  let contractFailure: unknown

  try {
    const immutableBody = new TextEncoder().encode(
      '<svg xmlns="http://www.w3.org/2000/svg" width="1" height="1"><title>Phase 11 中文</title></svg>',
    )
    createdKeys.add(keys.immutable)
    await storage.putObject({
      body: immutableBody,
      cacheControl: assetCachePolicy.immutable,
      contentType: 'image/svg+xml',
      key: keys.immutable,
      metadata: { 'asset-class': 'images', 'contract-version': 'phase-11' },
    })
    const immutableHead = await storage.headObject(keys.immutable)
    const immutableGet = await storage.getObject(keys.immutable)
    equalBytes(await readBody(immutableGet.body), immutableBody, 'Unicode object')
    if (
      normalizedContentType(immutableHead.contentType) !== 'image/svg+xml' ||
      !immutableHead.cacheControl?.trim() ||
      immutableHead.metadata['asset-class'] !== 'images' ||
      immutableHead.metadata['contract-version'] !== 'phase-11'
    ) {
      throw new Error('HEAD did not expose Content-Type, Cache-Control, or metadata semantics')
    }
    if (
      (immutableHead.etag === undefined) !== (immutableGet.etag === undefined) ||
      (immutableHead.etag !== undefined && immutableGet.etag !== immutableHead.etag)
    ) {
      throw new Error('GET and HEAD exposed inconsistent optional opaque ETag behavior')
    }
    cases.push('put-get-head-metadata-content-type-cache-control-etag-unicode')

    createdKeys.add(keys.mutable)
    await storage.putObject({
      body: 'mutable-v1',
      cacheControl: assetCachePolicy.mutable,
      contentType: 'text/plain; charset=utf-8',
      key: keys.mutable,
    })
    const mutable = await storage.headObject(keys.mutable)
    if (!mutable.cacheControl?.trim()) {
      throw new Error('Mutable object did not expose observable Cache-Control behavior')
    }
    cases.push('immutable-and-mutable-cache-policy')

    createdKeys.add(keys.overwrite)
    await storage.putObject({
      body: 'before-overwrite',
      cacheControl: assetCachePolicy.mutable,
      contentType: 'text/plain; charset=utf-8',
      key: keys.overwrite,
    })
    const beforeOverwrite = await storage.headObject(keys.overwrite)
    createdKeys.add(keys.large)
    await storage.putObject({
      body: 'after-overwrite-with-different-content',
      cacheControl: assetCachePolicy.mutable,
      contentType: 'text/plain; charset=utf-8',
      key: keys.overwrite,
    })
    const afterOverwrite = await storage.getObject(keys.overwrite)
    const overwrittenBody = new TextDecoder().decode(await readBody(afterOverwrite.body))
    if (overwrittenBody !== 'after-overwrite-with-different-content') {
      throw new Error('Overwrite did not replace the previous object body')
    }
    if (
      beforeOverwrite.etag !== undefined &&
      afterOverwrite.etag !== undefined &&
      beforeOverwrite.etag === afterOverwrite.etag
    ) {
      throw new Error('Overwrite did not produce a new opaque ETag for different content')
    }
    cases.push('overwrite-semantics')

    const representativeBody = new Uint8Array(2 * 1_024 * 1_024)
    for (let index = 0; index < representativeBody.length; index += 1) {
      representativeBody[index] = index % 251
    }
    await storage.putObject({
      body: representativeBody,
      cacheControl: assetCachePolicy.immutable,
      contentType: 'application/octet-stream',
      key: keys.large,
    })
    const representativeHead = await storage.headObject(keys.large)
    const representativeGet = await storage.getObject(keys.large)
    if (representativeHead.contentLength !== representativeBody.length) {
      throw new Error('Representative object HEAD returned an unexpected Content-Length')
    }
    equalBytes(await readBody(representativeGet.body), representativeBody, 'Representative object')
    cases.push('representative-object-size')

    const listed = (await storage.listObjects(prefix)).filter((key) => !key.endsWith('/'))
    const expectedListed = [...createdKeys].sort()
    if (
      listed.length !== expectedListed.length ||
      listed.some((key, index) => key !== expectedListed[index])
    ) {
      throw new Error('Prefix listing did not return the exact contract object set')
    }
    cases.push('list-prefix')

    await expectMissing(() => storage.getObject(`${prefix}/missing.txt`), 'GET')
    await expectMissing(() => storage.headObject(`${prefix}/missing.txt`), 'HEAD')
    cases.push('missing-key')

    createdKeys.add(keys.delete)
    await storage.putObject({
      body: 'delete-me',
      cacheControl: assetCachePolicy.mutable,
      contentType: 'text/plain; charset=utf-8',
      key: keys.delete,
    })
    await storage.deleteObject(keys.delete)
    createdKeys.delete(keys.delete)
    await expectMissing(() => storage.headObject(keys.delete), 'DELETE verification')
    cases.push('delete')

    if (options.cdnBaseUrl !== undefined) {
      const url = buildCdnAssetUrl(options.cdnBaseUrl, keys.immutable)
      await fetchPublicAsset(url, immutableBody)
      cases.push('cdn-public-read-private-write')
    }
  } catch (error: unknown) {
    contractFailure = error
  }

  const cleanupFailures: string[] = []
  for (const key of [...createdKeys].reverse()) {
    try {
      await storage.deleteObject(key)
    } catch (error: unknown) {
      cleanupFailures.push(`${key}: ${error instanceof Error ? error.name : 'unknown_error'}`)
    }
  }
  try {
    const directoryMarkers = (await storage.listObjects(prefix))
      .filter((key) => key.endsWith('/'))
      .sort((left, right) => right.length - left.length)
    for (const marker of directoryMarkers) await storage.deleteObject(marker)
    const remaining = await storage.listObjects(prefix)
    if (remaining.length > 0) cleanupFailures.push(`remaining objects: ${remaining.join(', ')}`)
  } catch (error: unknown) {
    cleanupFailures.push(
      `cleanup listing failed: ${error instanceof Error ? error.name : 'unknown_error'}`,
    )
  }

  if (cleanupFailures.length > 0) {
    throw new Error(`Storage contract cleanup failed: ${cleanupFailures.join('; ')}`, {
      cause: contractFailure,
    })
  }
  if (contractFailure !== undefined) throw contractFailure

  return contractReportSchema.parse({
    cases,
    cleanup: 'complete',
    objectCount: Object.keys(keys).length,
    prefix,
  })
}
