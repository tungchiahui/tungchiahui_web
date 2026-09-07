import { createHash, randomUUID } from 'node:crypto'
import {
  chmodSync,
  copyFileSync,
  existsSync,
  mkdirSync,
  renameSync,
  rmSync,
  statSync,
} from 'node:fs'
import { dirname, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { z } from 'zod'

import {
  type ActorIdentity,
  type InfrastructureOperationRequest,
  infrastructureOperationStatusSchema,
  infrastructureOperationTypeSchema,
} from './contracts'

const CONTROL_STATE_SCHEMA_VERSION = 7

const controlStateSummarySchema = z.object({
  environment: z.enum(['local', 'test', 'production']),
  incomplete_operations: z.number().int().nonnegative(),
  initialized_at: z.string(),
  journal_mode: z.literal('wal'),
  schema_version: z.literal(CONTROL_STATE_SCHEMA_VERSION),
  synchronous: z.union([z.literal(2), z.literal('2')]),
})

const infrastructureOperationRowSchema = z.object({
  actor_id: z.string(),
  created_at: z.string(),
  error_summary: z.string().nullable(),
  fencing_token: z.number().int().nonnegative(),
  finished_at: z.string().nullable(),
  id: z.uuid(),
  idempotency_key: z.string(),
  lease_expires_at: z.string().nullable(),
  lease_owner: z.string().nullable(),
  operation_type: infrastructureOperationTypeSchema,
  phase: z.string(),
  reason: z.string(),
  requested_at: z.string(),
  status: infrastructureOperationStatusSchema,
  target_json: z.string(),
  updated_at: z.string(),
})

const auditEventRowSchema = z.object({
  actor_id: z.string(),
  created_at: z.string(),
  details_json: z.string(),
  event_id: z.number().int().positive(),
  event_type: z.string(),
  operation_id: z.uuid().nullable(),
  outcome: z.enum(['accepted', 'denied', 'failed', 'succeeded']),
})

export type ControlStateEnvironment = 'local' | 'production' | 'test'

export type ControlStateSummary = Readonly<{
  checkpointPolicy: 'wal_autocheckpoint=1000'
  environment: ControlStateEnvironment
  incompleteOperations: number
  initializedAt: string
  journalMode: 'wal'
  schemaVersion: 7
  synchronous: 2
}>

export type InfrastructureOperation = Readonly<{
  actorId: string
  createdAt: string
  errorSummary: string | null
  fencingToken: number
  finishedAt: string | null
  id: string
  idempotencyKey: string
  leaseExpiresAt: string | null
  leaseOwner: string | null
  operationType: z.infer<typeof infrastructureOperationTypeSchema>
  phase: string
  reason: string
  requestedAt: string
  status: z.infer<typeof infrastructureOperationStatusSchema>
  target: Readonly<Record<string, unknown>>
  updatedAt: string
}>

export type ControlAuditEvent = Readonly<{
  actorId: string
  createdAt: string
  details: Readonly<Record<string, unknown>>
  eventId: number
  eventType: string
  operationId: string | null
  outcome: 'accepted' | 'denied' | 'failed' | 'succeeded'
}>

const backupRecordSchema = z.object({
  backup_id: z.string().min(1),
  backup_type: z.enum(['full', 'diff', 'incr']),
  completed_at: z.string(),
  created_at: z.string(),
  manifest_sha256: z.string().regex(/^[a-f0-9]{64}$/),
  measured_bytes: z.number().int().nonnegative(),
  measured_seconds: z.number().nonnegative(),
  offsite_replica_status: z.enum(['fresh', 'failed', 'pending']),
  primary_replica_status: z.enum(['fresh', 'failed', 'pending']),
  r2_replica_status: z.enum(['fresh', 'failed', 'pending']),
  repository_generation: z.string().min(1),
  stanza: z.string().min(1),
  valid: z.union([z.literal(0), z.literal(1)]),
  wal_archive_max: z.string().nullable(),
})

export type RecoveryBackupRecord = Readonly<{
  backupId: string
  backupType: 'diff' | 'full' | 'incr'
  completedAt: string
  createdAt: string
  manifestSha256: string
  measuredBytes: number
  measuredSeconds: number
  offsiteReplicaStatus: 'failed' | 'fresh' | 'pending'
  primaryReplicaStatus: 'failed' | 'fresh' | 'pending'
  repositoryGeneration: string
  stanza: string
  valid: boolean
  walArchiveMax: string | null
}>

export type ControlStateSnapshotEvidence = Readonly<{
  activeSlot: 'blue' | 'green' | 'none'
  auditDigest: string
  auditEventCount: number
  auditEventMaxId: number
  currentSha: string | null
  environment: ControlStateEnvironment
  integrity: 'ok'
  lastSha: string | null
  previousSlot: 'blue' | 'green' | 'none'
  schemaVersion: 7
}>

const deploymentRuntimeStateRowSchema = z.object({
  active_slot: z.enum(['blue', 'green', 'none']),
  current_digest: z.string().nullable(),
  current_sha: z.string().nullable(),
  cutover_at: z.string().nullable(),
  last_digest: z.string().nullable(),
  last_sha: z.string().nullable(),
  pending_digest: z.string().nullable(),
  pending_sha: z.string().nullable(),
  pending_slot: z.enum(['blue', 'green', 'none']),
  previous_slot: z.enum(['blue', 'green', 'none']),
  stabilization_until: z.string().nullable(),
  updated_at: z.string(),
})

export type DeploymentRuntimeState = Readonly<{
  activeSlot: 'blue' | 'green' | 'none'
  currentDigest: string | null
  currentSha: string | null
  cutoverAt: string | null
  lastDigest: string | null
  lastSha: string | null
  pendingDigest: string | null
  pendingSha: string | null
  pendingSlot: 'blue' | 'green' | 'none'
  previousSlot: 'blue' | 'green' | 'none'
  stabilizationUntil: string | null
  updatedAt: string
}>

export class ControlStateConflictError extends Error {
  override readonly name = 'ControlStateConflictError'
}

export class ControlStateLeaseError extends Error {
  override readonly name = 'ControlStateLeaseError'
}

const migrations = [
  {
    sql: `
      CREATE TABLE IF NOT EXISTS control_schema_migrations (
        version INTEGER PRIMARY KEY,
        applied_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE IF NOT EXISTS local_control_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        environment TEXT NOT NULL CHECK (environment IN ('local', 'test')),
        initialized_at TEXT NOT NULL
      ) STRICT;
    `,
    version: 1,
  },
  {
    sql: `
      CREATE TABLE control_runtime_state (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        active_slot TEXT NOT NULL DEFAULT 'none' CHECK (active_slot IN ('none', 'blue', 'green')),
        previous_slot TEXT NOT NULL DEFAULT 'none' CHECK (previous_slot IN ('none', 'blue', 'green')),
        current_sha TEXT,
        last_sha TEXT,
        updated_at TEXT NOT NULL
      ) STRICT;

      CREATE TABLE request_nonces (
        actor_id TEXT NOT NULL,
        nonce TEXT NOT NULL,
        body_hash TEXT NOT NULL CHECK (body_hash GLOB '[0-9a-f]*' AND length(body_hash) = 64),
        expires_at TEXT NOT NULL,
        consumed_at TEXT NOT NULL,
        PRIMARY KEY (actor_id, nonce)
      ) STRICT;

      CREATE INDEX request_nonces_expiry_idx ON request_nonces (expires_at);

      CREATE TABLE infrastructure_operations (
        id TEXT PRIMARY KEY,
        operation_type TEXT NOT NULL CHECK (operation_type IN ('deploy', 'rollback', 'restore', 'recovery', 'server-migration')),
        status TEXT NOT NULL CHECK (status IN ('queued', 'claimed', 'running', 'needs-attention', 'completed', 'failed', 'cancelled')),
        phase TEXT NOT NULL,
        target_json TEXT NOT NULL CHECK (json_valid(target_json) AND json_type(target_json) = 'object'),
        idempotency_key TEXT NOT NULL UNIQUE,
        actor_id TEXT NOT NULL,
        reason TEXT NOT NULL,
        requested_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        finished_at TEXT,
        lease_owner TEXT,
        lease_expires_at TEXT,
        fencing_token INTEGER NOT NULL DEFAULT 0 CHECK (fencing_token >= 0),
        CHECK ((lease_owner IS NULL) = (lease_expires_at IS NULL))
      ) STRICT;

      CREATE INDEX infrastructure_operations_claim_idx
        ON infrastructure_operations (status, created_at);
      CREATE INDEX infrastructure_operations_lease_idx
        ON infrastructure_operations (lease_expires_at)
        WHERE lease_expires_at IS NOT NULL;

      CREATE TABLE control_audit_events (
        event_id INTEGER PRIMARY KEY AUTOINCREMENT,
        operation_id TEXT REFERENCES infrastructure_operations(id) ON DELETE RESTRICT,
        actor_id TEXT NOT NULL,
        event_type TEXT NOT NULL,
        outcome TEXT NOT NULL CHECK (outcome IN ('accepted', 'denied', 'failed', 'succeeded')),
        details_json TEXT NOT NULL CHECK (json_valid(details_json) AND json_type(details_json) = 'object'),
        created_at TEXT NOT NULL
      ) STRICT;

      CREATE TRIGGER control_audit_events_no_update
      BEFORE UPDATE ON control_audit_events
      BEGIN
        SELECT RAISE(ABORT, 'control audit events are append-only');
      END;

      CREATE TRIGGER control_audit_events_no_delete
      BEFORE DELETE ON control_audit_events
      BEGIN
        SELECT RAISE(ABORT, 'control audit events are append-only');
      END;
    `,
    version: 2,
  },
  {
    sql: `
      ALTER TABLE local_control_metadata RENAME TO local_control_metadata_v2;

      CREATE TABLE local_control_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        environment TEXT NOT NULL CHECK (environment IN ('local', 'test', 'production')),
        initialized_at TEXT NOT NULL
      ) STRICT;

      INSERT INTO local_control_metadata (singleton_id, environment, initialized_at)
      SELECT singleton_id, environment, initialized_at
      FROM local_control_metadata_v2;
    `,
    version: 3,
  },
  {
    sql: `
      CREATE TABLE recovery_backup_records (
        backup_id TEXT PRIMARY KEY,
        backup_type TEXT NOT NULL CHECK (backup_type IN ('full', 'diff', 'incr')),
        stanza TEXT NOT NULL,
        repository_generation TEXT NOT NULL,
        manifest_sha256 TEXT NOT NULL CHECK (manifest_sha256 GLOB '[0-9a-f]*' AND length(manifest_sha256) = 64),
        wal_archive_max TEXT,
        primary_replica_status TEXT NOT NULL CHECK (primary_replica_status IN ('pending', 'fresh', 'failed')),
        r2_replica_status TEXT NOT NULL CHECK (r2_replica_status IN ('pending', 'fresh', 'failed')),
        valid INTEGER NOT NULL CHECK (valid IN (0, 1)),
        measured_seconds REAL NOT NULL CHECK (measured_seconds >= 0),
        measured_bytes INTEGER NOT NULL CHECK (measured_bytes >= 0),
        created_at TEXT NOT NULL,
        completed_at TEXT NOT NULL
      ) STRICT;

      CREATE INDEX recovery_backup_freshness_idx
        ON recovery_backup_records (completed_at DESC, backup_id);
    `,
    version: 4,
  },
  {
    sql: `
      ALTER TABLE control_runtime_state ADD COLUMN current_digest TEXT;
      ALTER TABLE control_runtime_state ADD COLUMN last_digest TEXT;
      ALTER TABLE control_runtime_state ADD COLUMN pending_slot TEXT NOT NULL DEFAULT 'none'
        CHECK (pending_slot IN ('none', 'blue', 'green'));
      ALTER TABLE control_runtime_state ADD COLUMN pending_sha TEXT;
      ALTER TABLE control_runtime_state ADD COLUMN pending_digest TEXT;
      ALTER TABLE control_runtime_state ADD COLUMN cutover_at TEXT;
      ALTER TABLE control_runtime_state ADD COLUMN stabilization_until TEXT;
      ALTER TABLE infrastructure_operations ADD COLUMN error_summary TEXT;
    `,
    version: 5,
  },
  {
    sql: `
      ALTER TABLE recovery_backup_records ADD COLUMN offsite_replica_status TEXT NOT NULL DEFAULT 'pending'
        CHECK (offsite_replica_status IN ('pending', 'fresh', 'failed'));
      UPDATE recovery_backup_records SET offsite_replica_status = r2_replica_status;
    `,
    version: 6,
  },
  {
    sql: `
      UPDATE recovery_backup_records
      SET primary_replica_status = 'pending', valid = 0;
    `,
    version: 7,
  },
] as const

function openControlState(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(path)
  database.exec('PRAGMA busy_timeout = 5000;')
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA synchronous = FULL;')
  database.exec('PRAGMA wal_autocheckpoint = 1000;')
  return database
}

function transaction<T>(database: DatabaseSync, operation: () => T) {
  database.exec('BEGIN IMMEDIATE;')
  try {
    const result = operation()
    database.exec('COMMIT;')
    return result
  } catch (error: unknown) {
    database.exec('ROLLBACK;')
    throw error
  }
}

function appendAudit(
  database: DatabaseSync,
  event: {
    actorId: string
    createdAt: string
    details: Readonly<Record<string, unknown>>
    eventType: string
    operationId: string | null
    outcome: ControlAuditEvent['outcome']
  },
) {
  database
    .prepare(
      `INSERT INTO control_audit_events
        (operation_id, actor_id, event_type, outcome, details_json, created_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    .run(
      event.operationId,
      event.actorId,
      event.eventType,
      event.outcome,
      JSON.stringify(event.details),
      event.createdAt,
    )
}

function applyMigrations(database: DatabaseSync, environment: ControlStateEnvironment) {
  const appliedAt = new Date().toISOString()
  transaction(database, () => {
    database.exec(migrations[0].sql)
    const alreadyInitialized =
      z
        .object({ count: z.number().int().nonnegative() })
        .parse(
          database
            .prepare('SELECT count(*) AS count FROM local_control_metadata WHERE singleton_id = 1')
            .get(),
        ).count > 0
    database
      .prepare(
        'INSERT OR IGNORE INTO control_schema_migrations (version, applied_at) VALUES (1, ?)',
      )
      .run(appliedAt)
    database
      .prepare(
        `INSERT OR IGNORE INTO local_control_metadata
          (singleton_id, environment, initialized_at)
         VALUES (1, ?, ?)`,
      )
      .run(environment === 'production' ? 'test' : environment, appliedAt)

    const applied = new Set(
      database
        .prepare('SELECT version FROM control_schema_migrations ORDER BY version')
        .all()
        .map((row) => z.object({ version: z.number().int() }).parse(row).version),
    )
    for (const migration of migrations.slice(1)) {
      if (applied.has(migration.version)) {
        continue
      }
      database.exec(migration.sql)
      database
        .prepare('INSERT INTO control_schema_migrations (version, applied_at) VALUES (?, ?)')
        .run(migration.version, appliedAt)
      if (migration.version === 2) {
        database
          .prepare(
            `INSERT INTO control_runtime_state
              (singleton_id, active_slot, previous_slot, updated_at)
             VALUES (1, 'none', 'none', ?)`,
          )
          .run(appliedAt)
      }
      if (migration.version === 3 && environment === 'production' && !alreadyInitialized) {
        database
          .prepare('UPDATE local_control_metadata SET environment = ? WHERE singleton_id = 1')
          .run(environment)
      }
    }
  })
}

export function initializeControlState(
  path: string,
  environment: ControlStateEnvironment,
): ControlStateSummary {
  const database = openControlState(path)
  try {
    applyMigrations(database, environment)
    const summary = readSummary(database)
    if (summary.environment !== environment) {
      throw new Error('Control-state environment does not match the requested runtime mode')
    }
    return summary
  } finally {
    database.close()
    for (const sharedPath of [path, `${path}-wal`, `${path}-shm`]) {
      if (existsSync(sharedPath) && statSync(sharedPath).uid === process.getuid?.()) {
        chmodSync(sharedPath, 0o660)
      }
    }
  }
}

export function readControlState(path: string): ControlStateSummary {
  const database = openControlState(path)
  try {
    return readSummary(database)
  } finally {
    database.close()
  }
}

export function readControlObservabilitySnapshot(path: string, now = new Date()) {
  const database = openControlState(path)
  try {
    const integrity = z
      .object({ integrity_check: z.literal('ok') })
      .parse(database.prepare('SELECT integrity_check FROM pragma_integrity_check').get())
    const operations = z
      .object({
        expired_lease_count: z.number().int().nonnegative(),
        failed_24h_count: z.number().int().nonnegative(),
        incomplete_count: z.number().int().nonnegative(),
        needs_attention_count: z.number().int().nonnegative(),
        oldest_incomplete_age_seconds: z.number().nonnegative(),
      })
      .parse(
        database
          .prepare(
            `SELECT
               count(*) FILTER (WHERE status IN ('queued', 'claimed', 'running', 'needs-attention')) AS incomplete_count,
               count(*) FILTER (WHERE status = 'needs-attention') AS needs_attention_count,
               count(*) FILTER (WHERE status = 'failed' AND finished_at >= datetime(?, '-24 hours')) AS failed_24h_count,
               count(*) FILTER (WHERE status IN ('claimed', 'running') AND lease_expires_at <= ?) AS expired_lease_count,
               COALESCE(max(0, (julianday(?) - julianday(min(created_at) FILTER (WHERE status IN ('queued', 'claimed', 'running', 'needs-attention')))) * 86400), 0) AS oldest_incomplete_age_seconds
             FROM infrastructure_operations`,
          )
          .get(now.toISOString(), now.toISOString(), now.toISOString()),
      )
    const audit = z
      .object({ count: z.number().int().nonnegative(), max_id: z.number().int().nonnegative() })
      .parse(
        database
          .prepare(
            'SELECT count(*) AS count, COALESCE(max(event_id), 0) AS max_id FROM control_audit_events',
          )
          .get(),
      )
    const latestBackup = database
      .prepare(
        `SELECT completed_at, primary_replica_status, offsite_replica_status, valid, wal_archive_max
         FROM recovery_backup_records ORDER BY completed_at DESC, backup_id DESC LIMIT 1`,
      )
      .get()
    const backup = latestBackup
      ? z
          .object({
            completed_at: z.iso.datetime({ offset: true }),
            offsite_replica_status: z.enum(['pending', 'fresh', 'failed']),
            primary_replica_status: z.enum(['pending', 'fresh', 'failed']),
            valid: z.union([z.literal(0), z.literal(1)]),
            wal_archive_max: z.string().nullable(),
          })
          .parse(latestBackup)
      : null
    const schema = z
      .object({ version: z.number().int().positive() })
      .parse(
        database.prepare('SELECT max(version) AS version FROM control_schema_migrations').get(),
      )
    return Object.freeze({
      audit: Object.freeze({ count: audit.count, maxId: audit.max_id }),
      backup:
        backup === null
          ? null
          : Object.freeze({
              ageSeconds: Math.max(
                0,
                (now.getTime() - new Date(backup.completed_at).getTime()) / 1_000,
              ),
              offsiteReplicaStatus: backup.offsite_replica_status,
              primaryReplicaStatus: backup.primary_replica_status,
              valid: backup.valid === 1,
              walArchivePresent: backup.wal_archive_max !== null,
            }),
      integrity: integrity.integrity_check,
      operations: Object.freeze({
        expiredLeaseCount: operations.expired_lease_count,
        failed24hCount: operations.failed_24h_count,
        incompleteCount: operations.incomplete_count,
        needsAttentionCount: operations.needs_attention_count,
        oldestIncompleteAgeSeconds: operations.oldest_incomplete_age_seconds,
      }),
      schemaVersion: schema.version,
    })
  } finally {
    database.close()
  }
}

function readSummary(database: DatabaseSync): ControlStateSummary {
  const metadata = database
    .prepare(
      `SELECT
        environment,
        initialized_at,
        (SELECT MAX(version) FROM control_schema_migrations) AS schema_version,
        (SELECT journal_mode FROM pragma_journal_mode) AS journal_mode,
        (SELECT synchronous FROM pragma_synchronous) AS synchronous,
        (SELECT count(*) FROM infrastructure_operations
          WHERE status IN ('queued', 'claimed', 'running', 'needs-attention')) AS incomplete_operations
       FROM local_control_metadata
       WHERE singleton_id = 1`,
    )
    .get()
  const parsed = controlStateSummarySchema.parse(metadata)
  z.object({ wal_autocheckpoint: z.literal(1_000) }).parse(
    database.prepare('PRAGMA wal_autocheckpoint').get(),
  )
  return Object.freeze({
    checkpointPolicy: 'wal_autocheckpoint=1000',
    environment: parsed.environment,
    incompleteOperations: parsed.incomplete_operations,
    initializedAt: parsed.initialized_at,
    journalMode: parsed.journal_mode,
    schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
    synchronous: 2,
  })
}

function mapOperation(row: unknown): InfrastructureOperation {
  const parsed = infrastructureOperationRowSchema.parse(row)
  return Object.freeze({
    actorId: parsed.actor_id,
    createdAt: parsed.created_at,
    errorSummary: parsed.error_summary,
    fencingToken: parsed.fencing_token,
    finishedAt: parsed.finished_at,
    id: parsed.id,
    idempotencyKey: parsed.idempotency_key,
    leaseExpiresAt: parsed.lease_expires_at,
    leaseOwner: parsed.lease_owner,
    operationType: parsed.operation_type,
    phase: parsed.phase,
    reason: parsed.reason,
    requestedAt: parsed.requested_at,
    status: parsed.status,
    target: z.record(z.string(), z.unknown()).parse(JSON.parse(parsed.target_json) as unknown),
    updatedAt: parsed.updated_at,
  })
}

function mapDeploymentRuntimeState(row: unknown): DeploymentRuntimeState {
  const parsed = deploymentRuntimeStateRowSchema.parse(row)
  return Object.freeze({
    activeSlot: parsed.active_slot,
    currentDigest: parsed.current_digest,
    currentSha: parsed.current_sha,
    cutoverAt: parsed.cutover_at,
    lastDigest: parsed.last_digest,
    lastSha: parsed.last_sha,
    pendingDigest: parsed.pending_digest,
    pendingSha: parsed.pending_sha,
    pendingSlot: parsed.pending_slot,
    previousSlot: parsed.previous_slot,
    stabilizationUntil: parsed.stabilization_until,
    updatedAt: parsed.updated_at,
  })
}

function readDeploymentRuntimeState(database: DatabaseSync) {
  return mapDeploymentRuntimeState(
    database.prepare('SELECT * FROM control_runtime_state WHERE singleton_id = 1').get(),
  )
}

export function readDeploymentState(path: string) {
  const database = openControlState(path)
  try {
    return readDeploymentRuntimeState(database)
  } finally {
    database.close()
  }
}

export function consumeControlNonce(
  path: string,
  nonce: { actorId: string; bodyHash: string; expiresAt: string; nonce: string },
  now = new Date(),
) {
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const nowIso = now.toISOString()
      database.prepare('DELETE FROM request_nonces WHERE expires_at < ?').run(nowIso)
      const result = database
        .prepare(
          `INSERT OR IGNORE INTO request_nonces
            (actor_id, nonce, body_hash, expires_at, consumed_at)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .run(nonce.actorId, nonce.nonce, nonce.bodyHash, nonce.expiresAt, nowIso)
      return result.changes === 1
    })
  } finally {
    database.close()
  }
}

export function createInfrastructureOperation(
  path: string,
  request: InfrastructureOperationRequest,
  actor: ActorIdentity,
  idempotencyKey: string,
  now = new Date(),
) {
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const existingRow = database
        .prepare('SELECT * FROM infrastructure_operations WHERE idempotency_key = ?')
        .get(idempotencyKey)
      if (existingRow) {
        const existing = mapOperation(existingRow)
        if (
          existing.actorId !== actor.id ||
          existing.operationType !== request.operationType ||
          existing.reason !== request.reason ||
          JSON.stringify(existing.target) !== JSON.stringify(request.target)
        ) {
          throw new ControlStateConflictError(
            'Idempotency key was already used for a different infrastructure operation',
          )
        }
        return Object.freeze({ created: false, operation: existing })
      }

      if (request.operationType === 'deploy' || request.operationType === 'rollback') {
        const competing = database
          .prepare(
            `SELECT id FROM infrastructure_operations
             WHERE operation_type IN ('deploy', 'rollback')
               AND status IN ('queued', 'claimed', 'running', 'needs-attention')
             LIMIT 1`,
          )
          .get()
        if (competing) {
          throw new ControlStateConflictError('Another deployment operation is already active')
        }
      }

      if (request.operationType === 'server-migration') {
        const competing = database
          .prepare(
            `SELECT id FROM infrastructure_operations
             WHERE status IN ('queued', 'claimed', 'running', 'needs-attention')
             LIMIT 1`,
          )
          .get()
        if (competing) {
          throw new ControlStateConflictError(
            'Server migration requires an exclusive infrastructure-operation window',
          )
        }
      } else {
        const migration = database
          .prepare(
            `SELECT id FROM infrastructure_operations
             WHERE operation_type = 'server-migration'
               AND status IN ('queued', 'claimed', 'running', 'needs-attention')
             LIMIT 1`,
          )
          .get()
        if (migration) {
          throw new ControlStateConflictError('A server migration is already active')
        }
      }

      const id = randomUUID()
      const timestamp = now.toISOString()
      database
        .prepare(
          `INSERT INTO infrastructure_operations
            (id, operation_type, status, phase, target_json, idempotency_key, actor_id,
             reason, requested_at, created_at, updated_at)
           VALUES (?, ?, 'queued', 'accepted', ?, ?, ?, ?, ?, ?, ?)`,
        )
        .run(
          id,
          request.operationType,
          JSON.stringify(request.target),
          idempotencyKey,
          actor.id,
          request.reason,
          timestamp,
          timestamp,
          timestamp,
        )
      appendAudit(database, {
        actorId: actor.id,
        createdAt: timestamp,
        details: { operationType: request.operationType },
        eventType: 'infrastructure_operation_created',
        operationId: id,
        outcome: 'accepted',
      })
      return Object.freeze({
        created: true,
        operation: mapOperation(
          database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(id),
        ),
      })
    })
  } finally {
    database.close()
  }
}

export function getInfrastructureOperation(path: string, id: string) {
  const database = openControlState(path)
  try {
    const row = database
      .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
      .get(z.uuid().parse(id))
    return row ? mapOperation(row) : null
  } finally {
    database.close()
  }
}

export function listInfrastructureOperations(
  path: string,
  filter: Readonly<{
    operationTypes?: readonly InfrastructureOperation['operationType'][]
    statuses?: readonly InfrastructureOperation['status'][]
  }> = {},
) {
  const operationTypes = z
    .array(z.enum(['deploy', 'rollback', 'restore', 'recovery', 'server-migration']))
    .parse(filter.operationTypes ?? [])
  const statuses = z
    .array(
      z.enum([
        'queued',
        'claimed',
        'running',
        'needs-attention',
        'completed',
        'failed',
        'cancelled',
      ]),
    )
    .parse(filter.statuses ?? [])
  const clauses: string[] = []
  const values: string[] = []
  if (operationTypes.length > 0) {
    clauses.push(`operation_type IN (${operationTypes.map(() => '?').join(', ')})`)
    values.push(...operationTypes)
  }
  if (statuses.length > 0) {
    clauses.push(`status IN (${statuses.map(() => '?').join(', ')})`)
    values.push(...statuses)
  }
  const database = openControlState(path)
  try {
    return database
      .prepare(
        `SELECT * FROM infrastructure_operations
         ${clauses.length === 0 ? '' : `WHERE ${clauses.join(' AND ')}`}
         ORDER BY created_at, id`,
      )
      .all(...values)
      .map(mapOperation)
  } finally {
    database.close()
  }
}

export function claimNextInfrastructureOperation(
  path: string,
  leaseOwner: string,
  leaseSeconds: number,
  now = new Date(),
  allowedOperationTypes?: readonly InfrastructureOperation['operationType'][],
) {
  const owner = z.string().min(1).max(200).parse(leaseOwner)
  const duration = z.number().int().min(1).max(3_600).parse(leaseSeconds)
  const allowed =
    allowedOperationTypes === undefined
      ? null
      : z
          .array(z.enum(['deploy', 'rollback', 'restore', 'recovery', 'server-migration']))
          .min(1)
          .parse(allowedOperationTypes)
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const row =
        allowed === null
          ? database
              .prepare(
                `SELECT * FROM infrastructure_operations
                 WHERE status = 'queued'
                 ORDER BY created_at, id
                 LIMIT 1`,
              )
              .get()
          : database
              .prepare(
                `SELECT * FROM infrastructure_operations
                 WHERE status = 'queued'
                   AND operation_type IN (${allowed.map(() => '?').join(', ')})
                 ORDER BY created_at, id
                 LIMIT 1`,
              )
              .get(...allowed)
      if (!row) {
        return null
      }
      const selected = mapOperation(row)
      const timestamp = now.toISOString()
      const leaseExpiresAt = new Date(now.getTime() + duration * 1_000).toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET status = 'claimed',
               phase = CASE WHEN phase IN ('accepted', 'lease-expired') THEN 'claimed' ELSE phase END,
               lease_owner = ?, lease_expires_at = ?,
               fencing_token = fencing_token + 1, updated_at = ?
           WHERE id = ? AND status = 'queued'`,
        )
        .run(owner, leaseExpiresAt, timestamp, selected.id)
      appendAudit(database, {
        actorId: owner,
        createdAt: timestamp,
        details: { leaseExpiresAt },
        eventType: 'infrastructure_operation_claimed',
        operationId: selected.id,
        outcome: 'accepted',
      })
      return mapOperation(
        database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(selected.id),
      )
    })
  } finally {
    database.close()
  }
}

type LeaseIdentity = Readonly<{
  fencingToken: number
  leaseOwner: string
}>

function requireActiveLease(
  operation: InfrastructureOperation,
  lease: LeaseIdentity,
  now: Date,
  allowedStatuses: readonly InfrastructureOperation['status'][],
) {
  const owner = z.string().min(1).max(200).parse(lease.leaseOwner)
  const fencingToken = z.number().int().positive().parse(lease.fencingToken)
  if (
    !allowedStatuses.includes(operation.status) ||
    operation.leaseOwner !== owner ||
    operation.fencingToken !== fencingToken ||
    operation.leaseExpiresAt === null ||
    operation.leaseExpiresAt <= now.toISOString()
  ) {
    throw new ControlStateLeaseError('Infrastructure operation lease is stale or inactive')
  }
}

export function startInfrastructureOperation(
  path: string,
  id: string,
  lease: LeaseIdentity,
  now = new Date(),
) {
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(id)),
      )
      requireActiveLease(operation, lease, now, ['claimed'])
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET status = 'running',
               phase = CASE WHEN phase = 'claimed' THEN 'executing' ELSE phase END,
               updated_at = ?
           WHERE id = ? AND status = 'claimed' AND lease_owner = ? AND fencing_token = ?`,
        )
        .run(timestamp, operation.id, lease.leaseOwner, lease.fencingToken)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: { fencingToken: lease.fencingToken },
        eventType: 'infrastructure_operation_started',
        operationId: operation.id,
        outcome: 'accepted',
      })
      return mapOperation(
        database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(operation.id),
      )
    })
  } finally {
    database.close()
  }
}

export function heartbeatInfrastructureOperation(
  path: string,
  id: string,
  lease: LeaseIdentity,
  leaseSeconds: number,
  now = new Date(),
) {
  const duration = z.number().int().min(1).max(3_600).parse(leaseSeconds)
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(id)),
      )
      requireActiveLease(operation, lease, now, ['claimed', 'running'])
      const timestamp = now.toISOString()
      const leaseExpiresAt = new Date(now.getTime() + duration * 1_000).toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET lease_expires_at = ?, updated_at = ?
           WHERE id = ? AND lease_owner = ? AND fencing_token = ?`,
        )
        .run(leaseExpiresAt, timestamp, operation.id, lease.leaseOwner, lease.fencingToken)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: { fencingToken: lease.fencingToken, leaseExpiresAt },
        eventType: 'infrastructure_operation_heartbeat',
        operationId: operation.id,
        outcome: 'accepted',
      })
      return mapOperation(
        database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(operation.id),
      )
    })
  } finally {
    database.close()
  }
}

export function updateInfrastructureOperationPhase(
  path: string,
  id: string,
  lease: LeaseIdentity,
  phaseInput: string,
  details: Readonly<Record<string, unknown>> = {},
  now = new Date(),
) {
  const phase = z.string().trim().min(1).max(200).parse(phaseInput)
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(id)),
      )
      requireActiveLease(operation, lease, now, ['running'])
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET phase = ?, updated_at = ?
           WHERE id = ? AND status = 'running' AND lease_owner = ? AND fencing_token = ?`,
        )
        .run(phase, timestamp, operation.id, lease.leaseOwner, lease.fencingToken)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: { ...details, fencingToken: lease.fencingToken, phase },
        eventType: 'infrastructure_operation_phase_changed',
        operationId: operation.id,
        outcome: 'accepted',
      })
      return mapOperation(
        database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(operation.id),
      )
    })
  } finally {
    database.close()
  }
}

export function requeueDeploymentOperationForReconciliation(
  path: string,
  id: string,
  now = new Date(),
) {
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(id)),
      )
      if (
        operation.status !== 'needs-attention' ||
        (operation.operationType !== 'deploy' && operation.operationType !== 'rollback')
      ) {
        throw new ControlStateConflictError('Only interrupted deployment operations can reconcile')
      }
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET status = 'queued', updated_at = ?
           WHERE id = ? AND status = 'needs-attention'`,
        )
        .run(timestamp, operation.id)
      appendAudit(database, {
        actorId: 'deploy-agent:deployment-reconciliation',
        createdAt: timestamp,
        details: { persistedPhase: operation.phase },
        eventType: 'deployment_operation_requeued_for_reconciliation',
        operationId: operation.id,
        outcome: 'accepted',
      })
      return mapOperation(
        database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(operation.id),
      )
    })
  } finally {
    database.close()
  }
}

const deploymentSlotSchema = z.enum(['blue', 'green'])
const deploymentShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const deploymentDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)

export function initializeDeploymentRuntime(
  path: string,
  release: Readonly<{ digest: string; sha: string; slot: 'blue' | 'green' }>,
  actorId = 'deploy-agent:deployment-reconciliation',
  now = new Date(),
) {
  const validated = {
    digest: deploymentDigestSchema.parse(release.digest),
    sha: deploymentShaSchema.parse(release.sha),
    slot: deploymentSlotSchema.parse(release.slot),
  }
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const current = readDeploymentRuntimeState(database)
      if (current.activeSlot !== 'none') {
        if (
          current.activeSlot !== validated.slot ||
          current.currentSha !== validated.sha ||
          current.currentDigest !== validated.digest
        ) {
          throw new ControlStateConflictError('Deployment runtime is already initialized')
        }
        return current
      }
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE control_runtime_state
           SET active_slot = ?, current_sha = ?, current_digest = ?, updated_at = ?
           WHERE singleton_id = 1 AND active_slot = 'none'`,
        )
        .run(validated.slot, validated.sha, validated.digest, timestamp)
      appendAudit(database, {
        actorId,
        createdAt: timestamp,
        details: validated,
        eventType: 'deployment_runtime_initialized',
        operationId: null,
        outcome: 'accepted',
      })
      return readDeploymentRuntimeState(database)
    })
  } finally {
    database.close()
  }
}

export function recordDeploymentCutoverIntent(
  path: string,
  operationId: string,
  lease: LeaseIdentity,
  release: Readonly<{ digest: string; sha: string; slot: 'blue' | 'green' }>,
  now = new Date(),
) {
  const validated = {
    digest: deploymentDigestSchema.parse(release.digest),
    sha: deploymentShaSchema.parse(release.sha),
    slot: deploymentSlotSchema.parse(release.slot),
  }
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(operationId)),
      )
      requireActiveLease(operation, lease, now, ['running'])
      const runtime = readDeploymentRuntimeState(database)
      if (runtime.activeSlot === 'none' || runtime.activeSlot === validated.slot) {
        throw new ControlStateConflictError('Cutover target must be the inactive slot')
      }
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE control_runtime_state
           SET pending_slot = ?, pending_sha = ?, pending_digest = ?, updated_at = ?
           WHERE singleton_id = 1`,
        )
        .run(validated.slot, validated.sha, validated.digest, timestamp)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: validated,
        eventType: 'deployment_cutover_intent_recorded',
        operationId: operation.id,
        outcome: 'accepted',
      })
      return readDeploymentRuntimeState(database)
    })
  } finally {
    database.close()
  }
}

export function commitDeploymentCutover(
  path: string,
  operationId: string,
  lease: LeaseIdentity,
  stabilizationSeconds: number,
  now = new Date(),
) {
  const stabilization = z.number().int().nonnegative().max(86_400).parse(stabilizationSeconds)
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(operationId)),
      )
      requireActiveLease(operation, lease, now, ['running'])
      const runtime = readDeploymentRuntimeState(database)
      if (
        runtime.activeSlot === 'none' ||
        runtime.pendingSlot === 'none' ||
        runtime.pendingSha === null ||
        runtime.pendingDigest === null
      ) {
        throw new ControlStateConflictError('No complete deployment cutover intent exists')
      }
      const timestamp = now.toISOString()
      const stabilizationUntil = new Date(now.getTime() + stabilization * 1_000).toISOString()
      database
        .prepare(
          `UPDATE control_runtime_state
           SET previous_slot = active_slot,
               last_sha = current_sha,
               last_digest = current_digest,
               active_slot = pending_slot,
               current_sha = pending_sha,
               current_digest = pending_digest,
               pending_slot = 'none', pending_sha = NULL, pending_digest = NULL,
               cutover_at = ?, stabilization_until = ?, updated_at = ?
           WHERE singleton_id = 1`,
        )
        .run(timestamp, stabilizationUntil, timestamp)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: { stabilizationUntil },
        eventType: 'deployment_cutover_committed',
        operationId: operation.id,
        outcome: 'succeeded',
      })
      return readDeploymentRuntimeState(database)
    })
  } finally {
    database.close()
  }
}

export function clearDeploymentCutoverIntent(
  path: string,
  operationId: string,
  lease: LeaseIdentity,
  now = new Date(),
) {
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(operationId)),
      )
      requireActiveLease(operation, lease, now, ['running'])
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE control_runtime_state
           SET pending_slot = 'none', pending_sha = NULL, pending_digest = NULL, updated_at = ?
           WHERE singleton_id = 1`,
        )
        .run(timestamp)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: {},
        eventType: 'deployment_cutover_intent_cleared',
        operationId: operation.id,
        outcome: 'accepted',
      })
      return readDeploymentRuntimeState(database)
    })
  } finally {
    database.close()
  }
}

export function discardDeploymentRollbackTarget(
  path: string,
  operationId: string,
  lease: LeaseIdentity,
  release: Readonly<{ digest: string; sha: string; slot: 'blue' | 'green' }>,
  now = new Date(),
) {
  const validated = {
    digest: deploymentDigestSchema.parse(release.digest),
    sha: deploymentShaSchema.parse(release.sha),
    slot: deploymentSlotSchema.parse(release.slot),
  }
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(operationId)),
      )
      requireActiveLease(operation, lease, now, ['running'])
      const runtime = readDeploymentRuntimeState(database)
      if (
        runtime.previousSlot !== validated.slot ||
        runtime.lastSha !== validated.sha ||
        runtime.lastDigest !== validated.digest
      ) {
        throw new ControlStateConflictError('Rollback target does not match the expected release')
      }
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE control_runtime_state
           SET previous_slot = 'none', last_sha = NULL, last_digest = NULL, updated_at = ?
           WHERE singleton_id = 1`,
        )
        .run(timestamp)
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: validated,
        eventType: 'deployment_rollback_target_discarded',
        operationId: operation.id,
        outcome: 'succeeded',
      })
      return readDeploymentRuntimeState(database)
    })
  } finally {
    database.close()
  }
}

export function finishInfrastructureOperation(
  path: string,
  id: string,
  lease: LeaseIdentity,
  result: Readonly<{
    errorSummary?: string | null
    phase: string
    status: 'completed' | 'failed'
  }>,
  now = new Date(),
) {
  const phase = z.string().trim().min(1).max(200).parse(result.phase)
  const status = z.enum(['completed', 'failed']).parse(result.status)
  const errorSummary = z
    .string()
    .trim()
    .min(1)
    .max(2_000)
    .nullable()
    .parse(result.errorSummary ?? null)
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const operation = mapOperation(
        database
          .prepare('SELECT * FROM infrastructure_operations WHERE id = ?')
          .get(z.uuid().parse(id)),
      )
      requireActiveLease(operation, lease, now, ['claimed', 'running'])
      const timestamp = now.toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET status = ?, phase = ?, error_summary = ?, finished_at = ?, lease_owner = NULL,
               lease_expires_at = NULL, updated_at = ?
           WHERE id = ? AND lease_owner = ? AND fencing_token = ?`,
        )
        .run(
          status,
          phase,
          errorSummary,
          timestamp,
          timestamp,
          operation.id,
          lease.leaseOwner,
          lease.fencingToken,
        )
      appendAudit(database, {
        actorId: lease.leaseOwner,
        createdAt: timestamp,
        details: { fencingToken: lease.fencingToken, phase },
        eventType: 'infrastructure_operation_finished',
        operationId: operation.id,
        outcome: status === 'completed' ? 'succeeded' : 'failed',
      })
      return mapOperation(
        database.prepare('SELECT * FROM infrastructure_operations WHERE id = ?').get(operation.id),
      )
    })
  } finally {
    database.close()
  }
}

export function reconcileInfrastructureOperations(path: string, now = new Date()) {
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const timestamp = now.toISOString()
      const expiredRows = database
        .prepare(
          `SELECT * FROM infrastructure_operations
           WHERE status IN ('claimed', 'running')
             AND lease_expires_at IS NOT NULL
             AND lease_expires_at <= ?
           ORDER BY created_at, id`,
        )
        .all(timestamp)
        .map(mapOperation)
      for (const operation of expiredRows) {
        const nextStatus = operation.status === 'claimed' ? 'queued' : 'needs-attention'
        const nextPhase =
          operation.status === 'claimed'
            ? 'lease-expired'
            : operation.operationType === 'deploy' || operation.operationType === 'rollback'
              ? operation.phase
              : 'reconcile-required'
        database
          .prepare(
            `UPDATE infrastructure_operations
             SET status = ?, phase = ?, lease_owner = NULL, lease_expires_at = NULL, updated_at = ?
             WHERE id = ? AND fencing_token = ?`,
          )
          .run(nextStatus, nextPhase, timestamp, operation.id, operation.fencingToken)
        appendAudit(database, {
          actorId: 'control-api:restart-reconciliation',
          createdAt: timestamp,
          details: {
            persistedPhase: nextPhase,
            previousLeaseOwner: operation.leaseOwner,
            previousStatus: operation.status,
          },
          eventType: 'infrastructure_operation_lease_expired',
          operationId: operation.id,
          outcome: 'accepted',
        })
      }
      return expiredRows.length
    })
  } finally {
    database.close()
  }
}

export function appendControlAuditEvent(path: string, event: Omit<ControlAuditEvent, 'eventId'>) {
  const database = openControlState(path)
  try {
    transaction(database, () => appendAudit(database, event))
  } finally {
    database.close()
  }
}

export function listControlAuditEvents(path: string, operationId?: string) {
  const database = openControlState(path)
  try {
    const rows = operationId
      ? database
          .prepare('SELECT * FROM control_audit_events WHERE operation_id = ? ORDER BY event_id')
          .all(z.uuid().parse(operationId))
      : database.prepare('SELECT * FROM control_audit_events ORDER BY event_id').all()
    return rows.map((row) => {
      const parsed = auditEventRowSchema.parse(row)
      return Object.freeze({
        actorId: parsed.actor_id,
        createdAt: parsed.created_at,
        details: z
          .record(z.string(), z.unknown())
          .parse(JSON.parse(parsed.details_json) as unknown),
        eventId: parsed.event_id,
        eventType: parsed.event_type,
        operationId: parsed.operation_id,
        outcome: parsed.outcome,
      })
    })
  } finally {
    database.close()
  }
}

export function checkpointControlState(path: string) {
  const database = openControlState(path)
  try {
    const result = z
      .object({ busy: z.literal(0), checkpointed: z.number().int(), log: z.number().int() })
      .parse(database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get())
    if (result.checkpointed !== result.log) {
      throw new Error('Control-state WAL checkpoint did not copy every frame')
    }
  } finally {
    database.close()
  }
}

function mapBackupRecord(row: unknown): RecoveryBackupRecord {
  const parsed = backupRecordSchema.parse(row)
  return Object.freeze({
    backupId: parsed.backup_id,
    backupType: parsed.backup_type,
    completedAt: parsed.completed_at,
    createdAt: parsed.created_at,
    manifestSha256: parsed.manifest_sha256,
    measuredBytes: parsed.measured_bytes,
    measuredSeconds: parsed.measured_seconds,
    offsiteReplicaStatus: parsed.offsite_replica_status,
    primaryReplicaStatus: parsed.primary_replica_status,
    repositoryGeneration: parsed.repository_generation,
    stanza: parsed.stanza,
    valid: parsed.valid === 1,
    walArchiveMax: parsed.wal_archive_max,
  })
}

export function recordRecoveryBackup(path: string, record: RecoveryBackupRecord) {
  const validated = z
    .object({
      backupId: z.string().min(1).max(200),
      backupType: z.enum(['full', 'diff', 'incr']),
      completedAt: z.iso.datetime({ offset: true }),
      createdAt: z.iso.datetime({ offset: true }),
      manifestSha256: z.string().regex(/^[a-f0-9]{64}$/),
      measuredBytes: z.number().int().nonnegative(),
      measuredSeconds: z.number().nonnegative(),
      offsiteReplicaStatus: z.enum(['fresh', 'failed', 'pending']),
      primaryReplicaStatus: z.enum(['fresh', 'failed', 'pending']),
      repositoryGeneration: z.string().min(1).max(200),
      stanza: z.string().min(1).max(100),
      valid: z.boolean(),
      walArchiveMax: z.string().min(1).max(200).nullable(),
    })
    .strict()
    .parse(record)
  const database = openControlState(path)
  try {
    transaction(database, () => {
      database
        .prepare(
          `INSERT INTO recovery_backup_records
            (backup_id, backup_type, stanza, repository_generation, manifest_sha256,
             wal_archive_max, primary_replica_status, r2_replica_status,
             offsite_replica_status, valid, measured_seconds, measured_bytes, created_at, completed_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
           ON CONFLICT (backup_id) DO UPDATE SET
             primary_replica_status = excluded.primary_replica_status,
             r2_replica_status = excluded.r2_replica_status,
             offsite_replica_status = excluded.offsite_replica_status,
             valid = excluded.valid,
             measured_seconds = excluded.measured_seconds,
             measured_bytes = excluded.measured_bytes,
             completed_at = excluded.completed_at`,
        )
        .run(
          validated.backupId,
          validated.backupType,
          validated.stanza,
          validated.repositoryGeneration,
          validated.manifestSha256,
          validated.walArchiveMax,
          validated.primaryReplicaStatus,
          validated.offsiteReplicaStatus,
          validated.offsiteReplicaStatus,
          validated.valid ? 1 : 0,
          validated.measuredSeconds,
          validated.measuredBytes,
          validated.createdAt,
          validated.completedAt,
        )
      appendAudit(database, {
        actorId: 'deploy-agent:recovery',
        createdAt: validated.completedAt,
        details: {
          backupId: validated.backupId,
          manifestSha256: validated.manifestSha256,
          offsiteReplicaStatus: validated.offsiteReplicaStatus,
          primaryReplicaStatus: validated.primaryReplicaStatus,
          valid: validated.valid,
        },
        eventType: 'recovery_backup_recorded',
        operationId: null,
        outcome: validated.valid ? 'succeeded' : 'failed',
      })
    })
  } finally {
    database.close()
  }
}

export function listRecoveryBackups(path: string, limit = 20) {
  const parsedLimit = z.number().int().min(1).max(100).parse(limit)
  const database = openControlState(path)
  try {
    return database
      .prepare(
        `SELECT * FROM recovery_backup_records
         ORDER BY completed_at DESC, backup_id DESC
         LIMIT ?`,
      )
      .all(parsedLimit)
      .map(mapBackupRecord)
  } finally {
    database.close()
  }
}

export function getRecoveryBackup(path: string, backupId: string) {
  const database = openControlState(path)
  try {
    const row = database
      .prepare('SELECT * FROM recovery_backup_records WHERE backup_id = ?')
      .get(z.string().min(1).max(200).parse(backupId))
    return row ? mapBackupRecord(row) : null
  } finally {
    database.close()
  }
}

function inspectControlStateDatabase(database: DatabaseSync): ControlStateSnapshotEvidence {
  const integrityRows = database.prepare('PRAGMA integrity_check').all()
  const integrity = z.array(z.object({ integrity_check: z.literal('ok') })).parse(integrityRows)
  if (integrity.length !== 1) throw new Error('Control-state SQLite integrity check failed')
  const foreignKeyViolations = database.prepare('PRAGMA foreign_key_check').all()
  if (foreignKeyViolations.length !== 0) {
    throw new Error('Control-state SQLite foreign-key check failed')
  }
  const metadata = z
    .object({
      active_slot: z.enum(['none', 'blue', 'green']),
      audit_event_count: z.number().int().nonnegative(),
      audit_event_max_id: z.number().int().nonnegative(),
      current_sha: z.string().nullable(),
      environment: z.enum(['local', 'test', 'production']),
      last_sha: z.string().nullable(),
      previous_slot: z.enum(['none', 'blue', 'green']),
      schema_version: z.literal(CONTROL_STATE_SCHEMA_VERSION),
    })
    .parse(
      database
        .prepare(
          `SELECT
             runtime.active_slot,
             runtime.previous_slot,
             runtime.current_sha,
             runtime.last_sha,
             metadata.environment,
             (SELECT MAX(version) FROM control_schema_migrations) AS schema_version,
             (SELECT count(*) FROM control_audit_events) AS audit_event_count,
             COALESCE((SELECT MAX(event_id) FROM control_audit_events), 0) AS audit_event_max_id
           FROM control_runtime_state AS runtime
           CROSS JOIN local_control_metadata AS metadata
           WHERE runtime.singleton_id = 1 AND metadata.singleton_id = 1`,
        )
        .get(),
    )
  const auditRows = database
    .prepare(
      `SELECT event_id, operation_id, actor_id, event_type, outcome, details_json, created_at
       FROM control_audit_events ORDER BY event_id`,
    )
    .all()
  const auditDigest = createHash('sha256').update(JSON.stringify(auditRows)).digest('hex')
  return Object.freeze({
    activeSlot: metadata.active_slot,
    auditDigest,
    auditEventCount: metadata.audit_event_count,
    auditEventMaxId: metadata.audit_event_max_id,
    currentSha: metadata.current_sha,
    environment: metadata.environment,
    integrity: 'ok',
    lastSha: metadata.last_sha,
    previousSlot: metadata.previous_slot,
    schemaVersion: CONTROL_STATE_SCHEMA_VERSION,
  })
}

export function inspectControlStateSnapshot(path: string) {
  const database = new DatabaseSync(resolve(path), { readOnly: true })
  try {
    database.exec('PRAGMA foreign_keys = ON;')
    return inspectControlStateDatabase(database)
  } finally {
    database.close()
  }
}

function sqliteString(value: string) {
  return `'${value.replaceAll("'", "''")}'`
}

export function createConsistentControlStateSnapshot(sourcePath: string, snapshotPath: string) {
  const source = resolve(sourcePath)
  const snapshot = resolve(snapshotPath)
  if (source === snapshot) throw new Error('Control-state snapshot target must differ from source')
  mkdirSync(dirname(snapshot), { mode: 0o700, recursive: true })
  rmSync(snapshot, { force: true })
  const database = openControlState(source)
  let sourceEvidence: ControlStateSnapshotEvidence
  try {
    const checkpoint = z
      .object({ busy: z.literal(0), checkpointed: z.number().int(), log: z.number().int() })
      .parse(database.prepare('PRAGMA wal_checkpoint(TRUNCATE)').get())
    if (checkpoint.checkpointed !== checkpoint.log) {
      throw new Error('Control-state WAL checkpoint did not copy every frame')
    }
    sourceEvidence = inspectControlStateDatabase(database)
    database.exec(`VACUUM INTO ${sqliteString(snapshot)};`)
  } finally {
    database.close()
  }
  const snapshotEvidence = inspectControlStateSnapshot(snapshot)
  if (JSON.stringify(snapshotEvidence) !== JSON.stringify(sourceEvidence)) {
    rmSync(snapshot, { force: true })
    throw new Error('Control-state snapshot does not preserve runtime state or audit continuity')
  }
  return snapshotEvidence
}

export function restoreControlStateSnapshot(
  snapshotPath: string,
  targetPath: string,
  expectedEnvironment: ControlStateEnvironment,
) {
  const evidence = inspectControlStateSnapshot(snapshotPath)
  if (evidence.environment !== expectedEnvironment) {
    throw new Error('Control-state snapshot environment does not match restore target')
  }
  const target = resolve(targetPath)
  const temporary = `${target}.restore-${randomUUID()}`
  mkdirSync(dirname(target), { mode: 0o700, recursive: true })
  copyFileSync(resolve(snapshotPath), temporary)
  const copiedEvidence = inspectControlStateSnapshot(temporary)
  if (copiedEvidence.auditDigest !== evidence.auditDigest) {
    rmSync(temporary, { force: true })
    throw new Error('Control-state restored copy failed audit continuity validation')
  }
  renameSync(temporary, target)
  rmSync(`${target}-wal`, { force: true })
  rmSync(`${target}-shm`, { force: true })
  return copiedEvidence
}

export function assertAuditAppendOnly(path: string) {
  const database = openControlState(path)
  try {
    database.exec('UPDATE control_audit_events SET event_type = event_type')
  } finally {
    database.close()
  }
}
