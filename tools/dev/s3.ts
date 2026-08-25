import {
  CreateBucketCommand,
  HeadBucketCommand,
  ListBucketsCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'
import { assetCachePolicy } from '../../src/storage/policy'
import { S3ObjectStorageAdapter } from '../../src/storage/s3-adapter'
import type { LocalInfrastructureConfig } from './config'

function createClient(configuration: LocalInfrastructureConfig) {
  return new S3Client({
    credentials: {
      accessKeyId: configuration.s3AccessKeyId,
      secretAccessKey: configuration.s3SecretAccessKey,
    },
    endpoint: configuration.s3Endpoint.toString(),
    forcePathStyle: true,
    region: 'us-east-1',
  })
}

function isMissingBucket(error: unknown) {
  if (typeof error !== 'object' || error === null || !('$metadata' in error)) {
    return false
  }

  const metadata = error.$metadata
  return (
    typeof metadata === 'object' &&
    metadata !== null &&
    'httpStatusCode' in metadata &&
    metadata.httpStatusCode === 404
  )
}

export async function waitForS3(configuration: LocalInfrastructureConfig) {
  const client = createClient(configuration)

  try {
    for (let attempt = 1; attempt <= 45; attempt += 1) {
      try {
        await client.send(new ListBucketsCommand({}))
        return
      } catch (error: unknown) {
        if (attempt === 45) {
          throw error
        }

        await new Promise<void>((resolveWait) => {
          setTimeout(resolveWait, 1000)
        })
      }
    }
  } finally {
    client.destroy()
  }
}

export async function ensureBucket(configuration: LocalInfrastructureConfig) {
  const client = createClient(configuration)

  try {
    try {
      await client.send(new HeadBucketCommand({ Bucket: configuration.s3Bucket }))
    } catch (error: unknown) {
      if (!isMissingBucket(error)) {
        throw error
      }

      await client.send(new CreateBucketCommand({ Bucket: configuration.s3Bucket }))
    }
    await client.send(
      new PutObjectCommand({
        Body: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 240"><rect width="640" height="240" rx="28" fill="#2563eb"/><circle cx="170" cy="120" r="68" fill="#dbeafe"/><path d="M290 82h210v28H290zm0 48h150v28H290z" fill="#eff6ff"/></svg>',
        Bucket: configuration.s3Bucket,
        CacheControl: 'public, max-age=300',
        ContentType: 'image/svg+xml; charset=utf-8',
        Key: 'fixtures/phase-6.svg',
      }),
    )
  } finally {
    client.destroy()
  }
}

export async function runS3Smoke(configuration: LocalInfrastructureConfig) {
  const storage = new S3ObjectStorageAdapter({
    accessKeyId: configuration.s3AccessKeyId,
    bucket: configuration.s3Bucket,
    endpoint: configuration.s3Endpoint,
    forcePathStyle: true,
    region: 'us-east-1',
    secretAccessKey: configuration.s3SecretAccessKey,
  })
  const key = 'phase-2/smoke.txt'
  const expected = `isolated-${configuration.mode}`

  try {
    await storage.putObject({
      body: expected,
      cacheControl: assetCachePolicy.mutable,
      contentType: 'text/plain; charset=utf-8',
      key,
    })
    const object = await storage.getObject(key)
    const actual = await new Response(object.body).text()

    if (actual !== expected) {
      throw new Error('S3Mock smoke object content did not round-trip')
    }

    await storage.deleteObject(key)
  } finally {
    storage.destroy()
  }
}
