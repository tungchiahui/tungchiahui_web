import { z } from 'zod'

const bucketSchema = z.string().min(3).max(255)
const credentialSchema = z.string().min(1)
const endpointSchema = z.url()
const regionSchema = z.string().min(1).max(100)

function containsControlCharacter(value: string) {
  return [...value].some((character) => {
    const codePoint = character.codePointAt(0) ?? 0
    return codePoint <= 31 || codePoint === 127
  })
}

export const storageObjectKeySchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith('/'), 'Object key must not start with a slash')
  .refine((value) => !value.endsWith('/'), 'Object key must not end with a slash')
  .refine(
    (value) =>
      !value.split('/').some((segment) => segment === '' || segment === '.' || segment === '..'),
    'Object key contains an unsafe path segment',
  )
  .refine((value) => !containsControlCharacter(value), 'Object key contains control characters')

export const storageObjectPrefixSchema = z
  .string()
  .min(1)
  .max(1_024)
  .refine((value) => !value.startsWith('/'), 'Object prefix must not start with a slash')
  .refine(
    (value) =>
      !value
        .split('/')
        .filter((segment, index, segments) => !(segment === '' && index === segments.length - 1))
        .some((segment) => segment === '' || segment === '.' || segment === '..'),
    'Object prefix contains an unsafe path segment',
  )
  .refine((value) => !containsControlCharacter(value), 'Object prefix contains control characters')

export const storageObjectIdentifierSchema = storageObjectPrefixSchema

export const storageMetadataSchema = z.record(
  z.string().regex(/^[a-z0-9][a-z0-9-]*$/u),
  z.string().max(2_048),
)

const rawS3ConnectionSchema = z.object({
  accessKeyId: credentialSchema,
  bucket: bucketSchema,
  endpoint: endpointSchema,
  forcePathStyle: z.boolean(),
  region: regionSchema,
  secretAccessKey: credentialSchema,
})

export type S3ConnectionConfiguration = Readonly<{
  accessKeyId: string
  bucket: string
  endpoint: URL
  forcePathStyle: boolean
  region: string
  secretAccessKey: string
}>

export type StorageObjectMetadata = Readonly<{
  cacheControl?: string
  contentLength?: number
  contentType?: string
  etag?: string
  metadata: Readonly<Record<string, string>>
}>

export type StorageObject = StorageObjectMetadata &
  Readonly<{
    body: ReadableStream<Uint8Array>
  }>

export type PutStorageObject = Readonly<{
  body: string | Uint8Array
  cacheControl: string
  contentType: string
  key: string
  metadata?: Readonly<Record<string, string>>
}>

export interface ReadOnlyObjectStorage {
  getObject(key: string): Promise<StorageObject>
  headObject(key: string): Promise<StorageObjectMetadata>
  listObjects(prefix: string): Promise<readonly string[]>
}

export interface ObjectStorage extends ReadOnlyObjectStorage {
  deleteObject(key: string): Promise<void>
  putObject(object: PutStorageObject): Promise<StorageObjectMetadata>
}

export class StorageConfigurationError extends Error {
  override readonly name = 'StorageConfigurationError'

  constructor(issues: readonly string[]) {
    super(`Invalid storage configuration: ${issues.join('; ')}`)
  }
}

export class StorageObjectNotFoundError extends Error {
  override readonly name = 'StorageObjectNotFoundError'
  readonly key: string

  constructor(key: string) {
    super(`Storage object was not found: ${key}`)
    this.key = key
  }
}

export function parseS3ConnectionConfiguration(input: unknown): S3ConnectionConfiguration {
  const result = rawS3ConnectionSchema.safeParse(input)
  if (!result.success) {
    throw new StorageConfigurationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  return Object.freeze({
    accessKeyId: result.data.accessKeyId,
    bucket: result.data.bucket,
    endpoint: new URL(result.data.endpoint),
    forcePathStyle: result.data.forcePathStyle,
    region: result.data.region,
    secretAccessKey: result.data.secretAccessKey,
  })
}

export function encodeObjectKeyForUrl(key: string) {
  return storageObjectKeySchema.parse(key).split('/').map(encodeURIComponent).join('/')
}
