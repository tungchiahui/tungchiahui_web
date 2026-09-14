import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  index,
  integer,
  jsonb,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'

import {
  accountRoleValues,
  applicationJobStatusValues,
  applicationJobTypeValues,
  contentTypeValues,
  type JsonValue,
  ownerDatasetKeyValues,
} from '../domain/persistence'

export const applicationSchema = pgSchema('app')
// Browser sessions are outside app's public-reader/content-worker default grants.
export const ownerAuthSchema = pgSchema('owner_auth')
export const ownerSessions = ownerAuthSchema.table(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    credentialVersion: text('credential_version').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('owner_sessions_expiry_idx').on(table.expiresAt)],
)
export const accountAuthSchema = pgSchema('account_auth')
export const accountRoleEnum = applicationSchema.enum('account_role', accountRoleValues)
export const accounts = applicationSchema.table(
  'accounts',
  {
    id: uuid().primaryKey().defaultRandom(),
    username: text().notNull(),
    role: accountRoleEnum().notNull().default('user'),
    passwordHash: text('password_hash').notNull(),
    disabled: boolean().notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex('accounts_username_unique').on(table.username),
    check('accounts_username_not_empty', sql`length(${table.username}) BETWEEN 1 AND 80`),
    check('accounts_password_hash_not_empty', sql`length(${table.passwordHash}) > 0`),
  ],
)
export const accountSessions = accountAuthSchema.table(
  'sessions',
  {
    tokenHash: text('token_hash').primaryKey(),
    accountId: uuid('account_id')
      .notNull()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    credentialVersion: text('credential_version').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index('account_sessions_expiry_idx').on(table.expiresAt)],
)
export const contentTypeEnum = applicationSchema.enum('content_type', contentTypeValues)
export const applicationJobTypeEnum = applicationSchema.enum(
  'application_job_type',
  applicationJobTypeValues,
)
export const applicationJobStatusEnum = applicationSchema.enum(
  'application_job_status',
  applicationJobStatusValues,
)
export const ownerDatasetKeyEnum = applicationSchema.enum(
  'owner_dataset_key',
  ownerDatasetKeyValues,
)

export const documents = applicationSchema.table(
  'documents',
  {
    id: uuid().primaryKey().defaultRandom(),
    contentType: contentTypeEnum('content_type').notNull(),
    sourcePath: text('source_path').notNull(),
    sourceCommit: text('source_commit').notNull(),
    title: text().notNull(),
    rawFrontmatter: jsonb('raw_frontmatter').$type<Readonly<Record<string, JsonValue>>>().notNull(),
    rawMarkdown: text('raw_markdown').notNull(),
    sourceHash: text('source_hash').notNull(),
    routePath: text('route_path').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
    ingestedAt: timestamp('ingested_at', { withTimezone: true }).notNull().defaultNow(),
    isDeleted: boolean('is_deleted').notNull().default(false),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (table) => [
    uniqueIndex('documents_source_path_unique').on(table.sourcePath),
    uniqueIndex('documents_route_path_unique').on(table.routePath),
    index('documents_content_type_idx').on(table.contentType),
    check('documents_source_path_not_empty', sql`length(${table.sourcePath}) > 0`),
    check('documents_route_path_absolute', sql`${table.routePath} LIKE '/%'`),
    check('documents_source_hash_sha256', sql`${table.sourceHash} ~ '^[a-f0-9]{64}$'`),
    check(
      'documents_source_commit_hash',
      sql`${table.sourceCommit} ~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'`,
    ),
    check('documents_frontmatter_object', sql`jsonb_typeof(${table.rawFrontmatter}) = 'object'`),
    check(
      'documents_delete_timestamp_consistent',
      sql`(${table.isDeleted} AND ${table.deletedAt} IS NOT NULL) OR (NOT ${table.isDeleted} AND ${table.deletedAt} IS NULL)`,
    ),
  ],
)

export const operationalJobs = applicationSchema.table(
  'operational_jobs',
  {
    id: uuid().primaryKey().defaultRandom(),
    jobType: applicationJobTypeEnum('job_type').notNull(),
    status: applicationJobStatusEnum().notNull().default('queued'),
    requestedBy: text('requested_by').notNull(),
    idempotencyKey: text('idempotency_key').notNull(),
    payload: jsonb().$type<Readonly<Record<string, JsonValue>>>().notNull(),
    progress: jsonb().$type<Readonly<Record<string, JsonValue>>>().notNull().default({}),
    attemptCount: integer('attempt_count').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    availableAt: timestamp('available_at', { withTimezone: true }).notNull().defaultNow(),
    claimedAt: timestamp('claimed_at', { withTimezone: true }),
    claimedBy: text('claimed_by'),
    claimExpiresAt: timestamp('claim_expires_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    startedAt: timestamp('started_at', { withTimezone: true }),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    errorSummary: text('error_summary'),
  },
  (table) => [
    uniqueIndex('operational_jobs_idempotency_key_unique').on(table.idempotencyKey),
    index('operational_jobs_claim_idx').on(table.status, table.availableAt, table.createdAt),
    check('operational_jobs_requested_by_not_empty', sql`length(${table.requestedBy}) > 0`),
    check('operational_jobs_payload_object', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check('operational_jobs_progress_object', sql`jsonb_typeof(${table.progress}) = 'object'`),
    check('operational_jobs_attempt_nonnegative', sql`${table.attemptCount} >= 0`),
    check('operational_jobs_max_attempts_positive', sql`${table.maxAttempts} > 0`),
    check(
      'operational_jobs_attempt_within_limit',
      sql`${table.attemptCount} <= ${table.maxAttempts}`,
    ),
    check(
      'operational_jobs_claim_consistent',
      sql`(${table.status} = 'running' AND ${table.claimedAt} IS NOT NULL AND ${table.claimedBy} IS NOT NULL AND ${table.claimExpiresAt} IS NOT NULL) OR (${table.status} <> 'running' AND ${table.claimedAt} IS NULL AND ${table.claimedBy} IS NULL AND ${table.claimExpiresAt} IS NULL)`,
    ),
  ],
)

export const ownerManagedDatasets = applicationSchema.table(
  'owner_managed_datasets',
  {
    datasetKey: ownerDatasetKeyEnum('dataset_key').primaryKey(),
    payload: jsonb().$type<Readonly<Record<string, JsonValue>>>().notNull(),
    revision: bigint({ mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    check('owner_managed_datasets_payload_object', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check('owner_managed_datasets_revision_nonnegative', sql`${table.revision} >= 0`),
    check('owner_managed_datasets_updated_by_not_empty', sql`length(${table.updatedBy}) > 0`),
  ],
)
export const startDatasets = applicationSchema.table(
  'start_datasets',
  {
    accountId: uuid('account_id')
      .primaryKey()
      .references(() => accounts.id, { onDelete: 'cascade' }),
    payload: jsonb().$type<Readonly<Record<string, JsonValue>>>().notNull(),
    revision: bigint({ mode: 'number' }).notNull().default(0),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
    updatedBy: text('updated_by').notNull(),
  },
  (table) => [
    check('start_datasets_payload_object', sql`jsonb_typeof(${table.payload}) = 'object'`),
    check('start_datasets_revision_nonnegative', sql`${table.revision} >= 0`),
    check('start_datasets_updated_by_not_empty', sql`length(${table.updatedBy}) > 0`),
  ],
)
