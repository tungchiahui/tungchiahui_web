import { randomUUID } from 'node:crypto'
import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { z } from 'zod'

import {
  type ActorIdentity,
  type InfrastructureOperationRequest,
  infrastructureOperationStatusSchema,
  infrastructureOperationTypeSchema,
} from './contracts'

const CONTROL_STATE_SCHEMA_VERSION = 2

const controlStateSummarySchema = z.object({
  environment: z.enum(['local', 'test']),
  incomplete_operations: z.number().int().nonnegative(),
  initialized_at: z.string(),
  journal_mode: z.literal('wal'),
  schema_version: z.literal(CONTROL_STATE_SCHEMA_VERSION),
  synchronous: z.union([z.literal(2), z.literal('2')]),
})

const infrastructureOperationRowSchema = z.object({
  actor_id: z.string(),
  created_at: z.string(),
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

export type ControlStateEnvironment = 'local' | 'test'

export type ControlStateSummary = Readonly<{
  checkpointPolicy: 'wal_autocheckpoint=1000'
  environment: ControlStateEnvironment
  incompleteOperations: number
  initializedAt: string
  journalMode: 'wal'
  schemaVersion: 2
  synchronous: 2
}>

export type InfrastructureOperation = Readonly<{
  actorId: string
  createdAt: string
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
] as const

function openControlState(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(path)
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA synchronous = FULL;')
  database.exec('PRAGMA wal_autocheckpoint = 1000;')
  database.exec('PRAGMA busy_timeout = 5000;')
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
      .run(environment, appliedAt)

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
      database
        .prepare(
          `INSERT INTO control_runtime_state
            (singleton_id, active_slot, previous_slot, updated_at)
           VALUES (1, 'none', 'none', ?)`,
        )
        .run(appliedAt)
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
      throw new Error('Control-state environment does not match the requested local/test mode')
    }
    return summary
  } finally {
    database.close()
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

export function claimNextInfrastructureOperation(
  path: string,
  leaseOwner: string,
  leaseSeconds: number,
  now = new Date(),
) {
  const owner = z.string().min(1).max(200).parse(leaseOwner)
  const duration = z.number().int().min(1).max(3_600).parse(leaseSeconds)
  const database = openControlState(path)
  try {
    return transaction(database, () => {
      const row = database
        .prepare(
          `SELECT * FROM infrastructure_operations
           WHERE status = 'queued'
           ORDER BY created_at, id
           LIMIT 1`,
        )
        .get()
      if (!row) {
        return null
      }
      const selected = mapOperation(row)
      const timestamp = now.toISOString()
      const leaseExpiresAt = new Date(now.getTime() + duration * 1_000).toISOString()
      database
        .prepare(
          `UPDATE infrastructure_operations
           SET status = 'claimed', phase = 'claimed', lease_owner = ?, lease_expires_at = ?,
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
           SET status = 'running', phase = 'executing', updated_at = ?
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

export function finishInfrastructureOperation(
  path: string,
  id: string,
  lease: LeaseIdentity,
  result: Readonly<{ phase: string; status: 'completed' | 'failed' }>,
  now = new Date(),
) {
  const phase = z.string().trim().min(1).max(200).parse(result.phase)
  const status = z.enum(['completed', 'failed']).parse(result.status)
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
           SET status = ?, phase = ?, finished_at = ?, lease_owner = NULL,
               lease_expires_at = NULL, updated_at = ?
           WHERE id = ? AND lease_owner = ? AND fencing_token = ?`,
        )
        .run(
          status,
          phase,
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
        const nextPhase = operation.status === 'claimed' ? 'lease-expired' : 'reconcile-required'
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
          details: { previousLeaseOwner: operation.leaseOwner, previousStatus: operation.status },
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
    database.exec('PRAGMA wal_checkpoint(PASSIVE);')
  } finally {
    database.close()
  }
}

export function assertAuditAppendOnly(path: string) {
  const database = openControlState(path)
  try {
    database.exec('UPDATE control_audit_events SET event_type = event_type')
  } finally {
    database.close()
  }
}
