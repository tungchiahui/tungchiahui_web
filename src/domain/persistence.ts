import { z } from 'zod'

export const localeValues = ['zh-cn', 'zh-hk', 'zh-tw', 'en-us'] as const
export const contentTypeValues = ['blog', 'wiki'] as const
export const translationSegmentStatusValues = [
  'pending',
  'translated',
  'fallback',
  'stale',
  'failed',
  'reviewed',
] as const
export const translationJobStatusValues = [
  'queued',
  'running',
  'completed',
  'partial',
  'failed',
  'cancelled',
] as const
export const applicationJobTypeValues = [
  'content_sync',
  'translation',
  'search_reindex',
  'cache_revalidation',
] as const
export const applicationJobStatusValues = [
  'queued',
  'running',
  'retry_wait',
  'completed',
  'failed',
  'cancelled',
] as const
export const ingestionRunStatusValues = ['running', 'completed', 'failed'] as const
export const translationScopeValues = ['pending', 'changed', 'article', 'all'] as const
export const ownerDatasetKeyValues = ['tech_footprint', 'weight_loss'] as const

export const localeSchema = z.enum(localeValues)
export const contentTypeSchema = z.enum(contentTypeValues)
export const translationSegmentStatusSchema = z.enum(translationSegmentStatusValues)
export const translationJobStatusSchema = z.enum(translationJobStatusValues)
export const applicationJobTypeSchema = z.enum(applicationJobTypeValues)
export const applicationJobStatusSchema = z.enum(applicationJobStatusValues)
export const ingestionRunStatusSchema = z.enum(ingestionRunStatusValues)
export const translationScopeSchema = z.enum(translationScopeValues)
export const ownerDatasetKeySchema = z.enum(ownerDatasetKeyValues)
export const jsonValueSchema = z.json()

export type Locale = z.infer<typeof localeSchema>
export type ContentType = z.infer<typeof contentTypeSchema>
export type TranslationSegmentStatus = z.infer<typeof translationSegmentStatusSchema>
export type TranslationJobStatus = z.infer<typeof translationJobStatusSchema>
export type ApplicationJobType = z.infer<typeof applicationJobTypeSchema>
export type ApplicationJobStatus = z.infer<typeof applicationJobStatusSchema>
export type IngestionRunStatus = z.infer<typeof ingestionRunStatusSchema>
export type TranslationScope = z.infer<typeof translationScopeSchema>
export type OwnerDatasetKey = z.infer<typeof ownerDatasetKeySchema>
export type JsonValue = z.infer<typeof jsonValueSchema>

const sourceCommitSchema = z
  .string()
  .regex(/^(?:[a-f0-9]{40}|[a-f0-9]{64})$/, 'Expected a lowercase Git commit hash')
const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/, 'Expected a lowercase SHA-256 hash')
const routePathSchema = z.string().startsWith('/').min(2)
const jsonObjectSchema = z.record(z.string(), jsonValueSchema)

export const documentWriteSchema = z.object({
  id: z.uuid(),
  contentType: contentTypeSchema,
  sourcePath: z.string().min(1),
  sourceCommit: sourceCommitSchema,
  title: z.string().min(1),
  rawFrontmatter: jsonObjectSchema,
  rawMarkdown: z.string().min(1),
  sourceHash: sha256Schema,
  routePath: routePathSchema,
  sourceUpdatedAt: z.date().nullable(),
})

export const ownerDatasetWriteSchema = z.object({
  datasetKey: ownerDatasetKeySchema,
  payload: jsonObjectSchema,
  revision: z.number().int().nonnegative(),
  updatedBy: z.string().min(1),
})

const contentSyncJobSchema = z.object({
  jobType: z.literal('content_sync'),
  payload: z.object({ sourceCommit: sourceCommitSchema }),
})
const translationJobPayloadSchema = z.object({
  jobType: z.literal('translation'),
  payload: z.object({ translationJobId: z.uuid() }),
})
const searchReindexJobSchema = z.object({
  jobType: z.literal('search_reindex'),
  payload: z.object({ locales: z.array(localeSchema).min(1) }),
})
const cacheRevalidationJobSchema = z.object({
  jobType: z.literal('cache_revalidation'),
  payload: z.object({ routes: z.array(routePathSchema).min(1) }),
})

export const applicationJobRequestSchema = z.discriminatedUnion('jobType', [
  contentSyncJobSchema,
  translationJobPayloadSchema,
  searchReindexJobSchema,
  cacheRevalidationJobSchema,
])

export type DocumentWrite = z.infer<typeof documentWriteSchema>
export type OwnerDatasetWrite = z.infer<typeof ownerDatasetWriteSchema>
export type ApplicationJobRequest = z.infer<typeof applicationJobRequestSchema>
