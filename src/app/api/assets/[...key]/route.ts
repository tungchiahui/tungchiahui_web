import { z } from 'zod'

import { RECOVERY_OBJECT_PREFIX } from '@/recovery/object-policy'
import { parseAssetStorageConfiguration } from '@/storage/configuration'
import { StorageObjectNotFoundError } from '@/storage/contracts'
import { resolveAssetResponseCacheControl } from '@/storage/policy'
import { S3ReadOnlyObjectStorageAdapter } from '@/storage/s3-adapter'

export const dynamic = 'force-dynamic'

const keySchema = z
  .array(z.string().regex(/^[\p{L}\p{N}._-]+$/u))
  .min(1)
  .max(20)

const privateTopLevelPrefixes = new Set([
  RECOVERY_OBJECT_PREFIX,
  'asset-backups',
  'control-state',
  'database-backups',
])

export async function GET(
  _request: Request,
  { params }: Readonly<{ params: Promise<{ key: string[] }> }>,
) {
  const parsedKey = keySchema.safeParse((await params).key)
  if (!parsedKey.success) {
    return Response.json(
      { error: 'invalid_asset_key' },
      { headers: { 'cache-control': 'no-store' }, status: 400 },
    )
  }
  if (privateTopLevelPrefixes.has(parsedKey.data[0] ?? '')) {
    return Response.json(
      { error: 'asset_not_found' },
      { headers: { 'cache-control': 'no-store' }, status: 404 },
    )
  }
  const key = parsedKey.data.join('/')
  const storage = new S3ReadOnlyObjectStorageAdapter(parseAssetStorageConfiguration(process.env))
  try {
    const object = await storage.getObject(key)
    const headers = new Headers({
      'cache-control': resolveAssetResponseCacheControl(key, object.cacheControl),
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'content-type': object.contentType ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    if (object.etag) headers.set('etag', object.etag)
    return new Response(object.body, { headers })
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'public_asset_read_failed',
        key,
        message: error instanceof Error ? error.name : 'unknown_error',
      }),
    )
    const missing = error instanceof StorageObjectNotFoundError
    return Response.json(
      { error: missing ? 'asset_not_found' : 'asset_upstream_unavailable' },
      { headers: { 'cache-control': 'no-store' }, status: missing ? 404 : 502 },
    )
  } finally {
    storage.destroy()
  }
}
