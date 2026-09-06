import { sql } from 'drizzle-orm'
import {
  boolean,
  check,
  index,
  integer,
  numeric,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  ingestionRunStatusValues,
  localeValues,
  translationExecutionModeValues,
  translationJobStatusValues,
  translationScopeValues,
  translationSegmentStatusValues,
} from '../domain/persistence'
import {
  applicationSchema,
  contentTypeEnum,
  documents,
  operationalJobs,
  ownerManagedDatasets,
} from './schema-core'

export * from './schema-core'

export const localeEnum = applicationSchema.enum('locale', localeValues)
export const translationSegmentStatusEnum = applicationSchema.enum(
  'translation_segment_status',
  translationSegmentStatusValues,
)
export const translationJobStatusEnum = applicationSchema.enum(
  'translation_job_status',
  translationJobStatusValues,
)
export const translationExecutionModeEnum = applicationSchema.enum(
  'translation_execution_mode',
  translationExecutionModeValues,
)
export const ingestionRunStatusEnum = applicationSchema.enum(
  'ingestion_run_status',
  ingestionRunStatusValues,
)
export const translationScopeEnum = applicationSchema.enum(
  'translation_scope',
  translationScopeValues,
)

export const documentTranslations = applicationSchema.table(
  'document_translations',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    translatedMarkdown: text('translated_markdown').notNull(),
    translationHash: text('translation_hash').notNull(),
    translationVersion: integer('translation_version').notNull(),
    sourceHash: text('source_hash'),
    pendingSegmentCount: integer('pending_segment_count').notNull().default(0),
    translatedSegmentCount: integer('translated_segment_count').notNull().default(0),
    fallbackSegmentCount: integer('fallback_segment_count').notNull().default(0),
    translationMemoryHits: integer('translation_memory_hits').notNull().default(0),
    generatedAt: timestamp('generated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.locale] }),
    check('document_translations_noncanonical_locale', sql`${table.locale} <> 'zh-cn'`),
    check('document_translations_hash_sha256', sql`${table.translationHash} ~ '^[a-f0-9]{64}$'`),
    check('document_translations_version_positive', sql`${table.translationVersion} > 0`),
    check(
      'document_translations_source_hash_sha256',
      sql`${table.sourceHash} IS NULL OR ${table.sourceHash} ~ '^[a-f0-9]{64}$'`,
    ),
    check('document_translations_pending_nonnegative', sql`${table.pendingSegmentCount} >= 0`),
    check(
      'document_translations_translated_nonnegative',
      sql`${table.translatedSegmentCount} >= 0`,
    ),
    check('document_translations_fallback_nonnegative', sql`${table.fallbackSegmentCount} >= 0`),
    check('document_translations_hits_nonnegative', sql`${table.translationMemoryHits} >= 0`),
  ],
)

export const searchDocuments = applicationSchema.table(
  'search_documents',
  {
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    contentType: contentTypeEnum('content_type').notNull(),
    routePath: text('route_path').notNull(),
    title: text().notNull(),
    headings: text().notNull(),
    body: text().notNull(),
    metadata: text().notNull(),
    sourceHash: text('source_hash').notNull(),
    projectionHash: text('projection_hash').notNull(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    primaryKey({ columns: [table.documentId, table.locale] }),
    index('search_documents_locale_type_idx').on(table.locale, table.contentType),
    index('search_documents_full_text_idx').using(
      'pgroonga',
      table.title,
      table.headings,
      table.body,
      table.metadata,
    ),
    check('search_documents_route_path_absolute', sql`${table.routePath} LIKE '/%'`),
    check('search_documents_title_not_empty', sql`length(${table.title}) > 0`),
    check('search_documents_source_hash_sha256', sql`${table.sourceHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'search_documents_projection_hash_sha256',
      sql`${table.projectionHash} ~ '^[a-f0-9]{64}$'`,
    ),
  ],
)

export const translationSegments = applicationSchema.table(
  'translation_segments',
  {
    id: uuid().primaryKey().defaultRandom(),
    sourceHash: text('source_hash').notNull(),
    sourceText: text('source_text').notNull(),
    sourceAstType: text('source_ast_type').notNull(),
    locale: localeEnum().notNull(),
    translatedText: text('translated_text'),
    isTranslatable: boolean('is_translatable').notNull().default(true),
    normalizationVersion: integer('normalization_version').notNull().default(1),
    contextFingerprint: text('context_fingerprint').notNull(),
    status: translationSegmentStatusEnum().notNull(),
    provider: text(),
    model: text(),
    inputTokens: integer('input_tokens').notNull().default(0),
    outputTokens: integer('output_tokens').notNull().default(0),
    costUsd: numeric('cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('translation_segments_memory_unique').on(
      table.sourceHash,
      table.locale,
      table.contextFingerprint,
    ),
    index('translation_segments_pending_idx').on(table.locale, table.status),
    check('translation_segments_noncanonical_locale', sql`${table.locale} <> 'zh-cn'`),
    check('translation_segments_source_hash_sha256', sql`${table.sourceHash} ~ '^[a-f0-9]{64}$'`),
    check('translation_segments_context_not_empty', sql`length(${table.contextFingerprint}) > 0`),
    check(
      'translation_segments_normalization_version_positive',
      sql`${table.normalizationVersion} > 0`,
    ),
    check('translation_segments_input_tokens_nonnegative', sql`${table.inputTokens} >= 0`),
    check('translation_segments_output_tokens_nonnegative', sql`${table.outputTokens} >= 0`),
    check('translation_segments_cost_nonnegative', sql`${table.costUsd} >= 0`),
  ],
)

export const documentTranslationSegments = applicationSchema.table(
  'document_translation_segments',
  {
    id: uuid().primaryKey().defaultRandom(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    locale: localeEnum().notNull(),
    segmentId: uuid('segment_id')
      .notNull()
      .references(() => translationSegments.id, { onDelete: 'restrict' }),
    previousSegmentId: uuid('previous_segment_id').references(() => translationSegments.id, {
      onDelete: 'set null',
    }),
    ordinal: integer().notNull(),
    sourceStart: integer('source_start').notNull(),
    sourceEnd: integer('source_end').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('document_translation_segments_ordinal_unique').on(
      table.documentId,
      table.locale,
      table.ordinal,
    ),
    index('document_translation_segments_segment_idx').on(table.segmentId),
    index('document_translation_segments_previous_idx').on(table.previousSegmentId),
    check('document_translation_segments_english_only', sql`${table.locale} = 'en-us'`),
    check('document_translation_segments_ordinal_nonnegative', sql`${table.ordinal} >= 0`),
    check('document_translation_segments_start_nonnegative', sql`${table.sourceStart} >= 0`),
    check(
      'document_translation_segments_range_valid',
      sql`${table.sourceEnd} > ${table.sourceStart}`,
    ),
    check(
      'document_translation_segments_previous_distinct',
      sql`${table.previousSegmentId} IS NULL OR ${table.previousSegmentId} <> ${table.segmentId}`,
    ),
  ],
)

export const translationJobs = applicationSchema.table(
  'translation_jobs',
  {
    id: uuid()
      .primaryKey()
      .references(() => operationalJobs.id, { onDelete: 'cascade' }),
    status: translationJobStatusEnum().notNull().default('queued'),
    executionMode: translationExecutionModeEnum('execution_mode').notNull().default('dry-run'),
    scope: translationScopeEnum().notNull(),
    documentId: uuid('document_id').references(() => documents.id, { onDelete: 'set null' }),
    requestedBy: text('requested_by').notNull(),
    force: boolean().notNull().default(false),
    budgetUsd: numeric('budget_usd', { precision: 12, scale: 6 }).notNull(),
    estimatedInputTokens: integer('estimated_input_tokens').notNull().default(0),
    estimatedOutputTokens: integer('estimated_output_tokens').notNull().default(0),
    estimatedCostUsd: numeric('estimated_cost_usd', { precision: 12, scale: 6 })
      .notNull()
      .default('0'),
    actualInputTokens: integer('actual_input_tokens').notNull().default(0),
    actualOutputTokens: integer('actual_output_tokens').notNull().default(0),
    actualCostUsd: numeric('actual_cost_usd', { precision: 12, scale: 6 }).notNull().default('0'),
    providerRequestCount: integer('provider_request_count').notNull().default(0),
    completedSegmentCount: integer('completed_segment_count').notNull().default(0),
    remainingSegmentCount: integer('remaining_segment_count').notNull().default(0),
    cancelRequestedAt: timestamp('cancel_requested_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorSummary: text('error_summary'),
  },
  (table) => [
    check('translation_jobs_requested_by_not_empty', sql`length(${table.requestedBy}) > 0`),
    check('translation_jobs_budget_nonnegative', sql`${table.budgetUsd} >= 0`),
    check('translation_jobs_estimated_input_nonnegative', sql`${table.estimatedInputTokens} >= 0`),
    check(
      'translation_jobs_estimated_output_nonnegative',
      sql`${table.estimatedOutputTokens} >= 0`,
    ),
    check('translation_jobs_estimated_cost_nonnegative', sql`${table.estimatedCostUsd} >= 0`),
    check('translation_jobs_actual_input_nonnegative', sql`${table.actualInputTokens} >= 0`),
    check('translation_jobs_actual_output_nonnegative', sql`${table.actualOutputTokens} >= 0`),
    check('translation_jobs_actual_cost_nonnegative', sql`${table.actualCostUsd} >= 0`),
    check(
      'translation_jobs_provider_requests_nonnegative',
      sql`${table.providerRequestCount} >= 0`,
    ),
    check(
      'translation_jobs_completed_segments_nonnegative',
      sql`${table.completedSegmentCount} >= 0`,
    ),
    check(
      'translation_jobs_remaining_segments_nonnegative',
      sql`${table.remainingSegmentCount} >= 0`,
    ),
    check(
      'translation_jobs_article_scope_document',
      sql`(${table.scope} = 'article' AND ${table.documentId} IS NOT NULL) OR (${table.scope} <> 'article' AND ${table.documentId} IS NULL)`,
    ),
  ],
)

export const ingestionRuns = applicationSchema.table(
  'ingestion_runs',
  {
    id: uuid().primaryKey().defaultRandom(),
    operationalJobId: uuid('operational_job_id')
      .notNull()
      .references(() => operationalJobs.id, { onDelete: 'restrict' }),
    sourceCommit: text('source_commit').notNull(),
    startedAt: timestamp('started_at', { withTimezone: true }).notNull().defaultNow(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    status: ingestionRunStatusEnum().notNull(),
    filesSeen: integer('files_seen').notNull().default(0),
    filesChanged: integer('files_changed').notNull().default(0),
    filesDeleted: integer('files_deleted').notNull().default(0),
    errorSummary: text('error_summary'),
  },
  (table) => [
    uniqueIndex('ingestion_runs_operational_job_unique').on(table.operationalJobId),
    index('ingestion_runs_source_commit_idx').on(table.sourceCommit),
    check(
      'ingestion_runs_source_commit_hash',
      sql`${table.sourceCommit} ~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'`,
    ),
    check('ingestion_runs_files_seen_nonnegative', sql`${table.filesSeen} >= 0`),
    check('ingestion_runs_files_changed_nonnegative', sql`${table.filesChanged} >= 0`),
    check('ingestion_runs_files_deleted_nonnegative', sql`${table.filesDeleted} >= 0`),
  ],
)

export const contentAliases = applicationSchema.table(
  'content_aliases',
  {
    aliasPath: text('alias_path').primaryKey(),
    documentId: uuid('document_id')
      .notNull()
      .references(() => documents.id, { onDelete: 'cascade' }),
    approvalReference: text('approval_reference').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index('content_aliases_document_idx').on(table.documentId),
    check(
      'content_aliases_content_route',
      sql`${table.aliasPath} LIKE '/wiki/%' OR ${table.aliasPath} LIKE '/blog/%'`,
    ),
    check('content_aliases_approval_not_empty', sql`length(${table.approvalReference}) > 0`),
  ],
)

export const persistenceSchema = {
  contentAliases,
  documentTranslationSegments,
  documentTranslations,
  documents,
  ingestionRuns,
  operationalJobs,
  ownerManagedDatasets,
  searchDocuments,
  translationJobs,
  translationSegments,
}

export type Document = typeof documents.$inferSelect
export type NewDocument = typeof documents.$inferInsert
export type OperationalJob = typeof operationalJobs.$inferSelect
export type NewOperationalJob = typeof operationalJobs.$inferInsert
