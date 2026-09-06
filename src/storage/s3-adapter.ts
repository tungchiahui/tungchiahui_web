import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3'

import {
  type ObjectStorage,
  type PutStorageObject,
  parseS3ConnectionConfiguration,
  type ReadOnlyObjectStorage,
  type S3ConnectionConfiguration,
  type StorageObject,
  type StorageObjectMetadata,
  StorageObjectNotFoundError,
  storageMetadataSchema,
  storageObjectIdentifierSchema,
  storageObjectKeySchema,
  storageObjectPrefixSchema,
} from './contracts'

function isMissingObject(error: unknown) {
  if (typeof error !== 'object' || error === null) return false
  const candidate = error as Readonly<{
    $metadata?: Readonly<{ httpStatusCode?: number }>
    name?: string
  }>
  return (
    candidate.$metadata?.httpStatusCode === 404 ||
    candidate.name === 'NoSuchKey' ||
    candidate.name === 'NotFound'
  )
}

function metadataFromOutput(output: {
  CacheControl?: string | undefined
  ContentLength?: number | undefined
  ContentType?: string | undefined
  ETag?: string | undefined
  Metadata?: Record<string, string> | undefined
}): StorageObjectMetadata {
  const metadata = storageMetadataSchema.parse(output.Metadata ?? {})
  const etag = output.ETag?.replaceAll('"', '').trim() === '' ? undefined : output.ETag
  return Object.freeze({
    ...(output.CacheControl === undefined ? {} : { cacheControl: output.CacheControl }),
    ...(output.ContentLength === undefined ? {} : { contentLength: output.ContentLength }),
    ...(output.ContentType === undefined ? {} : { contentType: output.ContentType }),
    ...(etag === undefined ? {} : { etag }),
    metadata: Object.freeze(metadata),
  })
}

export class S3ObjectStorageAdapter implements ObjectStorage {
  readonly #bucket: string
  readonly #client: S3Client

  constructor(configuration: S3ConnectionConfiguration) {
    const validated = parseS3ConnectionConfiguration({
      accessKeyId: configuration.accessKeyId,
      bucket: configuration.bucket,
      endpoint: configuration.endpoint.toString(),
      forcePathStyle: configuration.forcePathStyle,
      region: configuration.region,
      secretAccessKey: configuration.secretAccessKey,
    })
    this.#bucket = validated.bucket
    this.#client = new S3Client({
      credentials: {
        accessKeyId: validated.accessKeyId,
        secretAccessKey: validated.secretAccessKey,
      },
      endpoint: validated.endpoint.toString(),
      forcePathStyle: validated.forcePathStyle,
      region: validated.region,
    })
  }

  destroy() {
    this.#client.destroy()
  }

  async deleteObject(key: string) {
    await this.#client.send(
      new DeleteObjectCommand({
        Bucket: this.#bucket,
        Key: storageObjectIdentifierSchema.parse(key),
      }),
    )
  }

  async getObject(key: string): Promise<StorageObject> {
    const parsedKey = storageObjectKeySchema.parse(key)
    try {
      const output = await this.#client.send(
        new GetObjectCommand({ Bucket: this.#bucket, Key: parsedKey }),
      )
      if (!output.Body) throw new Error('S3 response did not include an object body')
      return Object.freeze({
        ...metadataFromOutput(output),
        body: output.Body.transformToWebStream() as ReadableStream<Uint8Array>,
      })
    } catch (error: unknown) {
      if (isMissingObject(error)) throw new StorageObjectNotFoundError(parsedKey)
      throw error
    }
  }

  async headObject(key: string): Promise<StorageObjectMetadata> {
    const parsedKey = storageObjectKeySchema.parse(key)
    try {
      const output = await this.#client.send(
        new HeadObjectCommand({ Bucket: this.#bucket, Key: parsedKey }),
      )
      return metadataFromOutput(output)
    } catch (error: unknown) {
      if (isMissingObject(error)) throw new StorageObjectNotFoundError(parsedKey)
      throw error
    }
  }

  async listObjects(prefix: string) {
    const parsedPrefix = storageObjectPrefixSchema.parse(prefix)
    const keys: string[] = []
    let continuationToken: string | undefined

    do {
      const output = await this.#client.send(
        new ListObjectsV2Command({
          Bucket: this.#bucket,
          ...(continuationToken === undefined ? {} : { ContinuationToken: continuationToken }),
          Prefix: parsedPrefix,
        }),
      )
      for (const object of output.Contents ?? []) {
        if (object.Key === undefined) continue
        const key = storageObjectIdentifierSchema.parse(object.Key)
        if (key.startsWith(parsedPrefix)) keys.push(key)
      }
      continuationToken = output.IsTruncated ? output.NextContinuationToken : undefined
    } while (continuationToken !== undefined)

    return Object.freeze(keys.sort())
  }

  async putObject(object: PutStorageObject): Promise<StorageObjectMetadata> {
    const key = storageObjectKeySchema.parse(object.key)
    const metadata = storageMetadataSchema.parse(object.metadata ?? {})
    const output = await this.#client.send(
      new PutObjectCommand({
        Body: object.body,
        Bucket: this.#bucket,
        CacheControl: zNonEmpty(object.cacheControl, 'cacheControl'),
        ContentType: zNonEmpty(object.contentType, 'contentType'),
        Key: key,
        Metadata: metadata,
      }),
    )
    return Object.freeze({
      ...(output.ETag === undefined ? {} : { etag: output.ETag }),
      metadata: Object.freeze(metadata),
    })
  }
}

export class S3ReadOnlyObjectStorageAdapter implements ReadOnlyObjectStorage {
  readonly #delegate: S3ObjectStorageAdapter

  constructor(configuration: S3ConnectionConfiguration) {
    this.#delegate = new S3ObjectStorageAdapter(configuration)
  }

  destroy() {
    this.#delegate.destroy()
  }

  getObject(key: string) {
    return this.#delegate.getObject(key)
  }

  headObject(key: string) {
    return this.#delegate.headObject(key)
  }

  listObjects(prefix: string) {
    return this.#delegate.listObjects(prefix)
  }
}

function zNonEmpty(value: string, field: string) {
  if (value.trim().length === 0) throw new Error(`${field} must not be empty`)
  return value
}
