import { DatabaseSync } from 'node:sqlite'
import { z } from 'zod'
import { type HostRelease, hostReleaseSchema } from './contracts'

const phaseSchema = z.enum([
  'prepared',
  'web-verified',
  'services-verified',
  'committed',
  'compensating',
  'reverted',
])
export const convergenceSnapshotSchema = z
  .object({
    hostSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable()
      .default(null),
    hostPreviousSha: z
      .string()
      .regex(/^[a-f0-9]{40}$/)
      .nullable()
      .default(null),
    deploymentPollingEnabled: z.boolean().default(false),
    serviceImage: z.string(),
    recoveryImage: z.string(),
    postgresImage: z.string(),
    webDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
    webImage: z.string(),
    sha: z.string().regex(/^[a-f0-9]{40}$/),
    files: z.record(
      z.enum(['compose.yaml', 'openresty.conf', 'pgbouncer.ini', 'pgbackrest.conf']),
      z.string(),
    ),
    backupScheduleEnabled: z.boolean(),
    maintenanceScheduleEnabled: z.boolean(),
  })
  .strict()
export type ConvergenceSnapshot = Readonly<z.infer<typeof convergenceSnapshotSchema>>

function database(path: string) {
  const db = new DatabaseSync(path)
  db.exec(
    'PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA synchronous=FULL; PRAGMA foreign_keys=ON;',
  )
  return db
}

// An additive, independently journaled component migration in the existing recovery database.
// Core Schema 8 readers continue to work throughout the first service activation.
export function initializeHostReleaseState(path: string) {
  const db = database(path)
  try {
    db.exec(`BEGIN IMMEDIATE;
      CREATE TABLE IF NOT EXISTS host_release_bootstrap_baseline(singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1),sha TEXT NOT NULL,digest TEXT NOT NULL,operation_id TEXT NOT NULL REFERENCES infrastructure_operations(id));
      CREATE TABLE IF NOT EXISTS host_release_executor_lock(singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1), owner TEXT NOT NULL, expires_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS host_release_schema_migrations(version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS host_release_generations(sha TEXT PRIMARY KEY, release_json TEXT NOT NULL, created_at TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS host_release_runtime(singleton_id INTEGER PRIMARY KEY CHECK(singleton_id=1), current_sha TEXT REFERENCES host_release_generations(sha), previous_sha TEXT REFERENCES host_release_generations(sha), pending_sha TEXT REFERENCES host_release_generations(sha));
      INSERT OR IGNORE INTO host_release_runtime(singleton_id) VALUES(1);
      CREATE TABLE IF NOT EXISTS host_release_operations(operation_id TEXT PRIMARY KEY REFERENCES infrastructure_operations(id), release_json TEXT NOT NULL, before_json TEXT NOT NULL, phase TEXT NOT NULL, updated_at TEXT NOT NULL);
      INSERT OR IGNORE INTO host_release_schema_migrations(version,applied_at) VALUES(1,strftime('%Y-%m-%dT%H:%M:%fZ','now'));
      COMMIT;`)
    const row = z
      .object({ version: z.literal(1) })
      .parse(db.prepare('SELECT max(version) AS version FROM host_release_schema_migrations').get())
    return row.version
  } finally {
    db.close()
  }
}

export function readHostRuntime(path: string) {
  const db = database(path)
  try {
    return z
      .object({
        current_sha: z.string().nullable(),
        previous_sha: z.string().nullable(),
        pending_sha: z.string().nullable(),
      })
      .parse(
        db
          .prepare(
            'SELECT current_sha,previous_sha,pending_sha FROM host_release_runtime WHERE singleton_id=1',
          )
          .get(),
      )
  } finally {
    db.close()
  }
}

export function readHostGeneration(path: string, sha: string): HostRelease {
  const db = database(path)
  try {
    const row = z
      .object({ release_json: z.string() })
      .parse(db.prepare('SELECT release_json FROM host_release_generations WHERE sha=?').get(sha))
    return hostReleaseSchema.parse(JSON.parse(row.release_json) as unknown)
  } finally {
    db.close()
  }
}

type HostOperationLease = Readonly<{
  operationId: string
  leaseOwner: string
  fencingToken: number
}>
function requireHostOperationLease(db: DatabaseSync, identity: HostOperationLease | undefined) {
  if (!identity) return // Server-console bootstrap is explicitly administrator-only.
  const operation = z
    .object({
      status: z.string(),
      lease_owner: z.string().nullable(),
      fencing_token: z.number(),
      lease_expires_at: z.string().nullable(),
    })
    .parse(
      db
        .prepare(
          'SELECT status,lease_owner,fencing_token,lease_expires_at FROM infrastructure_operations WHERE id=?',
        )
        .get(z.uuid().parse(identity.operationId)),
    )
  const lock = z
    .object({ owner: z.string(), expires_at: z.string() })
    .parse(
      db
        .prepare('SELECT owner,expires_at FROM host_release_executor_lock WHERE singleton_id=1')
        .get(),
    )
  if (
    operation.status !== 'running' ||
    operation.lease_owner !== identity.leaseOwner ||
    operation.fencing_token !== identity.fencingToken ||
    !operation.lease_expires_at ||
    operation.lease_expires_at <= new Date().toISOString() ||
    lock.owner !== identity.leaseOwner ||
    lock.expires_at <= new Date().toISOString()
  )
    throw new Error('Host generation lease is stale')
}

export function stageHostGeneration(
  path: string,
  release: HostRelease,
  identity?: HostOperationLease,
) {
  const validated = hostReleaseSchema.parse(release)
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    requireHostOperationLease(db, identity)
    const existing = db
      .prepare('SELECT release_json FROM host_release_generations WHERE sha=?')
      .get(validated.sha)
    if (
      existing &&
      z.object({ release_json: z.string() }).parse(existing).release_json !==
        JSON.stringify(validated)
    )
      throw new Error('Host generation identity changed for an existing SHA')
    db.prepare(
      'INSERT OR IGNORE INTO host_release_generations(sha,release_json,created_at) VALUES(?,?,?)',
    ).run(validated.sha, JSON.stringify(validated), new Date().toISOString())
    db.prepare('UPDATE host_release_runtime SET pending_sha=? WHERE singleton_id=1').run(
      validated.sha,
    )
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function commitHostGeneration(path: string, sha: string, identity?: HostOperationLease) {
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    requireHostOperationLease(db, identity)
    const runtime = z
      .object({ current_sha: z.string().nullable(), pending_sha: z.string().nullable() })
      .parse(
        db
          .prepare('SELECT current_sha,pending_sha FROM host_release_runtime WHERE singleton_id=1')
          .get(),
      )
    if (runtime.pending_sha !== sha)
      throw new Error('Host generation does not match the pending candidate')
    if (runtime.current_sha === sha)
      db.prepare('UPDATE host_release_runtime SET pending_sha=NULL WHERE singleton_id=1').run()
    else
      db.prepare(
        'UPDATE host_release_runtime SET previous_sha=current_sha,current_sha=?,pending_sha=NULL WHERE singleton_id=1',
      ).run(sha)
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function discardHostCandidate(path: string) {
  const db = database(path)
  try {
    db.exec('UPDATE host_release_runtime SET pending_sha=NULL WHERE singleton_id=1')
  } finally {
    db.close()
  }
}

export function checkpointHostRelease(
  path: string,
  operationId: string,
  lease: Readonly<{ leaseOwner: string; fencingToken: number }>,
  release: HostRelease,
  before: ConvergenceSnapshot,
  phase: z.infer<typeof phaseSchema>,
) {
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    const operation = z
      .object({
        lease_owner: z.string().nullable(),
        fencing_token: z.number(),
        lease_expires_at: z.string().nullable(),
        status: z.string(),
      })
      .parse(
        db
          .prepare(
            'SELECT lease_owner,fencing_token,lease_expires_at,status FROM infrastructure_operations WHERE id=?',
          )
          .get(z.uuid().parse(operationId)),
      )
    if (
      operation.status !== 'running' ||
      operation.lease_owner !== lease.leaseOwner ||
      operation.fencing_token !== lease.fencingToken ||
      !operation.lease_expires_at ||
      operation.lease_expires_at <= new Date().toISOString()
    )
      throw new Error('Host release lease is stale')
    db.prepare(
      `INSERT INTO host_release_operations(operation_id,release_json,before_json,phase,updated_at) VALUES(?,?,?,?,?) ON CONFLICT(operation_id) DO UPDATE SET phase=excluded.phase,updated_at=excluded.updated_at`,
    ).run(
      operationId,
      JSON.stringify(hostReleaseSchema.parse(release)),
      JSON.stringify(convergenceSnapshotSchema.parse(before)),
      phaseSchema.parse(phase),
      new Date().toISOString(),
    )
    db.prepare(
      `INSERT INTO control_audit_events(operation_id,actor_id,event_type,outcome,details_json,created_at) VALUES(?,?,'host_release_checkpoint','accepted',?,?)`,
    ).run(
      operationId,
      lease.leaseOwner,
      JSON.stringify({ sha: release.sha, phase, fencingToken: lease.fencingToken }),
      new Date().toISOString(),
    )
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function readHostCheckpoint(path: string, operationId: string) {
  const db = database(path)
  try {
    const row = db
      .prepare(
        'SELECT release_json,before_json,phase FROM host_release_operations WHERE operation_id=?',
      )
      .get(z.uuid().parse(operationId))
    if (!row) return undefined
    const parsed = z
      .object({ release_json: z.string(), before_json: z.string(), phase: phaseSchema })
      .parse(row)
    return {
      release: hostReleaseSchema.parse(JSON.parse(parsed.release_json) as unknown),
      before: convergenceSnapshotSchema.parse(JSON.parse(parsed.before_json) as unknown),
      phase: parsed.phase,
    }
  } finally {
    db.close()
  }
}

export function acquireHostExecutor(path: string, owner: string, now = new Date()) {
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    const prior = db
      .prepare('SELECT owner,expires_at FROM host_release_executor_lock WHERE singleton_id=1')
      .get()
    const parsed = prior
      ? z.object({ owner: z.string(), expires_at: z.string() }).parse(prior)
      : undefined
    if (parsed && parsed.expires_at > now.toISOString() && parsed.owner !== owner) {
      db.exec('COMMIT')
      return false
    }
    db.prepare(
      'INSERT INTO host_release_executor_lock(singleton_id,owner,expires_at) VALUES(1,?,?) ON CONFLICT(singleton_id) DO UPDATE SET owner=excluded.owner,expires_at=excluded.expires_at',
    ).run(owner, new Date(now.getTime() + 30_000).toISOString())
    if (parsed && parsed.owner !== owner) {
      // The prior supervisor is fenced before any interrupted child is stopped/restarted.
      db.prepare(
        "UPDATE infrastructure_operations SET lease_expires_at=?,fencing_token=fencing_token+1 WHERE operation_type IN ('deploy','rollback') AND status IN ('running','claimed') AND lease_owner=?",
      ).run(now.toISOString(), parsed.owner)
    }
    db.exec('COMMIT')
    return true
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function releaseHostExecutor(path: string, owner: string) {
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    const lock = z
      .object({ owner: z.string() })
      .parse(db.prepare('SELECT owner FROM host_release_executor_lock WHERE singleton_id=1').get())
    if (lock.owner === owner) {
      db.prepare(
        "UPDATE infrastructure_operations SET lease_expires_at=?,fencing_token=fencing_token+1 WHERE operation_type IN ('deploy','rollback') AND status IN ('running','claimed') AND lease_owner=?",
      ).run(new Date().toISOString(), owner)
      db.prepare('DELETE FROM host_release_executor_lock WHERE singleton_id=1 AND owner=?').run(
        owner,
      )
    }
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function readHostExecutorStatus(path: string, now = new Date()) {
  const db = database(path)
  try {
    if (
      !db
        .prepare(
          "SELECT name FROM sqlite_master WHERE type='table' AND name='host_release_runtime'",
        )
        .get()
    )
      return {
        installed: false,
        healthy: false,
        currentSha: null,
        previousSha: null,
        pendingSha: null,
      }
    const runtime = readHostRuntime(path)
    const lock = db
      .prepare('SELECT expires_at FROM host_release_executor_lock WHERE singleton_id=1')
      .get()
    const expiresAt = lock ? z.object({ expires_at: z.string() }).parse(lock).expires_at : null
    return {
      installed: runtime.current_sha !== null,
      healthy: expiresAt !== null && expiresAt > now.toISOString(),
      currentSha: runtime.current_sha,
      previousSha: runtime.previous_sha,
      pendingSha: runtime.pending_sha,
    }
  } finally {
    db.close()
  }
}

export function restoreHostGeneration(
  path: string,
  currentSha: string | null,
  previousSha: string | null,
  identity?: HostOperationLease,
) {
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    requireHostOperationLease(db, identity)
    db.prepare(
      'UPDATE host_release_runtime SET current_sha=?,previous_sha=?,pending_sha=NULL WHERE singleton_id=1',
    ).run(currentSha, previousSha)
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function requeueHostBootstrap(path: string, id: string) {
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    const operation = z
      .object({
        operation_type: z.literal('server-migration'),
        status: z.literal('needs-attention'),
        idempotency_key: z.string().startsWith('host-bootstrap:'),
      })
      .parse(
        db
          .prepare(
            'SELECT operation_type,status,idempotency_key FROM infrastructure_operations WHERE id=?',
          )
          .get(z.uuid().parse(id)),
      )
    db.prepare(
      "UPDATE infrastructure_operations SET status='queued',lease_owner=NULL,lease_expires_at=NULL,updated_at=? WHERE id=?",
    ).run(new Date().toISOString(), id)
    db.prepare(
      "INSERT INTO control_audit_events(operation_id,actor_id,event_type,outcome,details_json,created_at) VALUES(?,'server-console:bootstrap','host_bootstrap_requeued','accepted',?,?)",
    ).run(id, JSON.stringify({ identity: operation.idempotency_key }), new Date().toISOString())
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

// The first activation retains the existing application slot independently of the new
// PostgreSQL-independent control/execution layer. Later releases use full paired manifests.
export function recordHostBootstrapBaseline(
  path: string,
  before: ConvergenceSnapshot,
  operationId: string,
  lease: Readonly<{ leaseOwner: string; fencingToken: number }>,
) {
  const snapshot = convergenceSnapshotSchema.parse(before)
  if (snapshot.hostSha !== null) return
  const db = database(path)
  try {
    db.exec('BEGIN IMMEDIATE')
    const operation = z
      .object({
        operation_type: z.literal('server-migration'),
        actor_id: z.literal('server-console:bootstrap'),
        status: z.literal('running'),
        lease_owner: z.literal(lease.leaseOwner),
        fencing_token: z.literal(lease.fencingToken),
        lease_expires_at: z.string(),
      })
      .parse(
        db
          .prepare(
            'SELECT operation_type,actor_id,status,lease_owner,fencing_token,lease_expires_at FROM infrastructure_operations WHERE id=?',
          )
          .get(z.uuid().parse(operationId)),
      )
    if (operation.lease_expires_at <= new Date().toISOString())
      throw new Error('Bootstrap baseline lease is stale')
    db.prepare(
      'INSERT OR IGNORE INTO host_release_bootstrap_baseline(singleton_id,sha,digest,operation_id) VALUES(1,?,?,?)',
    ).run(snapshot.sha, snapshot.webDigest, operationId)
    const stored = z
      .object({ sha: z.literal(snapshot.sha), digest: z.literal(snapshot.webDigest) })
      .parse(
        db
          .prepare('SELECT sha,digest FROM host_release_bootstrap_baseline WHERE singleton_id=1')
          .get(),
      )
    db.prepare(
      "INSERT INTO control_audit_events(operation_id,actor_id,event_type,outcome,details_json,created_at) VALUES(?,'server-console:bootstrap','legacy_web_baseline_retained','accepted',?,?)",
    ).run(operationId, JSON.stringify(stored), new Date().toISOString())
    db.exec('COMMIT')
  } catch (error: unknown) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.close()
  }
}

export function readHostBootstrapBaseline(path: string) {
  const db = database(path)
  try {
    const row = db
      .prepare('SELECT sha,digest FROM host_release_bootstrap_baseline WHERE singleton_id=1')
      .get()
    return row
      ? z
          .object({
            sha: z.string().regex(/^[a-f0-9]{40}$/),
            digest: z.string().regex(/^sha256:[a-f0-9]{64}$/),
          })
          .parse(row)
      : null
  } finally {
    db.close()
  }
}
