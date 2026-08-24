import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3'
import { z } from 'zod'

export const dynamic = 'force-dynamic'

const assetConfigurationSchema = z.object({
  S3_ACCESS_KEY_ID: z.string().min(1),
  S3_BUCKET: z.string().min(3),
  S3_ENDPOINT: z.url(),
  S3_SECRET_ACCESS_KEY: z.string().min(1),
})
const keySchema = z
  .array(z.string().regex(/^[\p{L}\p{N}._-]+$/u))
  .min(1)
  .max(20)

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
  const key = parsedKey.data.join('/')
  const configuration = assetConfigurationSchema.parse(process.env)
  const client = new S3Client({
    credentials: {
      accessKeyId: configuration.S3_ACCESS_KEY_ID,
      secretAccessKey: configuration.S3_SECRET_ACCESS_KEY,
    },
    endpoint: configuration.S3_ENDPOINT,
    forcePathStyle: true,
    region: 'us-east-1',
  })
  try {
    const object = await client.send(
      new GetObjectCommand({ Bucket: configuration.S3_BUCKET, Key: key }),
    )
    if (!object.Body) throw new Error('S3 asset response did not include a body')
    const headers = new Headers({
      'cache-control': object.CacheControl ?? 'public, max-age=300',
      'content-security-policy': "default-src 'none'; style-src 'unsafe-inline'; sandbox",
      'content-type': object.ContentType ?? 'application/octet-stream',
      'x-content-type-options': 'nosniff',
    })
    if (object.ETag) headers.set('etag', object.ETag)
    return new Response(object.Body.transformToWebStream(), { headers })
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'public_asset_read_failed',
        key,
        message: error instanceof Error ? error.name : 'unknown_error',
      }),
    )
    return Response.json(
      { error: 'asset_not_found' },
      { headers: { 'cache-control': 'no-store' }, status: 404 },
    )
  } finally {
    client.destroy()
  }
}
