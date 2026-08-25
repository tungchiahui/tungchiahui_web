import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { afterEach, describe, expect, it } from 'vitest'

import type { ActorIdentity } from '../../src/control-plane/contracts'
import {
  assertAuditAppendOnly,
  ControlStateConflictError,
  ControlStateLeaseError,
  checkpointControlState,
  claimNextInfrastructureOperation,
  consumeControlNonce,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  heartbeatInfrastructureOperation,
  initializeControlState,
  listControlAuditEvents,
  readControlState,
  reconcileInfrastructureOperations,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'

const temporaryDirectories: string[] = []
const actor: ActorIdentity = {
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
  id: 'operator:test',
  kind: 'operator',
}

afterEach(() => {
  for (const directory of temporaryDirectories.splice(0)) {
    rmSync(directory, { force: true, recursive: true })
  }
})

function statePath() {
  const directory = mkdtempSync(join(tmpdir(), 'control-state-unit-'))
  temporaryDirectories.push(directory)
  return join(directory, 'control.db')
}

function restoreRequest(backupId = 'backup-001') {
  return {
    operationType: 'restore' as const,
    reason: 'Phase 4 recovery-state test',
    target: { backupId, environment: 'test' as const },
  }
}

describe('control-state SQLite engine', () => {
  it('uses a versioned WAL/FULL/checkpoint baseline and migrates a Phase 2 database', () => {
    const path = statePath()
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      CREATE TABLE control_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
      CREATE TABLE local_control_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        environment TEXT NOT NULL CHECK (environment IN ('local', 'test')),
        initialized_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO control_schema_migrations VALUES (1, '2026-08-23T00:00:00.000Z');
      INSERT INTO local_control_metadata VALUES (1, 'test', '2026-08-23T00:00:00.000Z');
    `)
    legacy.close()

    expect(initializeControlState(path, 'test')).toEqual({
      checkpointPolicy: 'wal_autocheckpoint=1000',
      environment: 'test',
      incompleteOperations: 0,
      initializedAt: '2026-08-23T00:00:00.000Z',
      journalMode: 'wal',
      schemaVersion: 3,
      synchronous: 2,
    })
    checkpointControlState(path)
    expect(readControlState(path).schemaVersion).toBe(3)
  })

  it('refuses to reuse state from another environment', () => {
    const path = statePath()
    initializeControlState(path, 'local')
    expect(() => initializeControlState(path, 'test')).toThrow(
      'Control-state environment does not match',
    )
  })

  it('initializes the dedicated production recovery-state environment', () => {
    const path = statePath()
    const summary = initializeControlState(path, 'production')

    expect(summary.environment).toBe('production')
    expect(summary.schemaVersion).toBe(3)
  })

  it('does not relabel an existing pre-Version-3 state database as production', () => {
    const path = statePath()
    const legacy = new DatabaseSync(path)
    legacy.exec(`
      CREATE TABLE control_schema_migrations (version INTEGER PRIMARY KEY, applied_at TEXT NOT NULL) STRICT;
      CREATE TABLE local_control_metadata (
        singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
        environment TEXT NOT NULL CHECK (environment IN ('local', 'test')),
        initialized_at TEXT NOT NULL
      ) STRICT;
      INSERT INTO control_schema_migrations VALUES (1, '2026-08-23T00:00:00.000Z');
      INSERT INTO local_control_metadata VALUES (1, 'test', '2026-08-23T00:00:00.000Z');
    `)
    legacy.close()

    expect(() => initializeControlState(path, 'production')).toThrow(
      'Control-state environment does not match',
    )
    expect(readControlState(path).environment).toBe('test')
  })

  it('enforces replay nonces and infrastructure idempotency semantics', () => {
    const path = statePath()
    initializeControlState(path, 'test')
    const nonce = {
      actorId: actor.id,
      bodyHash: 'a'.repeat(64),
      expiresAt: '2026-08-24T12:05:00.000Z',
      nonce: 'nonce-000000000001',
    }
    expect(consumeControlNonce(path, nonce, new Date('2026-08-24T12:00:00.000Z'))).toBe(true)
    expect(consumeControlNonce(path, nonce, new Date('2026-08-24T12:00:01.000Z'))).toBe(false)

    const first = createInfrastructureOperation(
      path,
      restoreRequest(),
      actor,
      'restore:test:001',
      new Date('2026-08-24T12:00:00.000Z'),
    )
    const duplicate = createInfrastructureOperation(
      path,
      restoreRequest(),
      actor,
      'restore:test:001',
      new Date('2026-08-24T12:00:01.000Z'),
    )
    expect(first.created).toBe(true)
    expect(duplicate).toEqual({ created: false, operation: first.operation })
    expect(() =>
      createInfrastructureOperation(path, restoreRequest('other'), actor, 'restore:test:001'),
    ).toThrow(ControlStateConflictError)
  })

  it('serializes competing claims, fences expired leases and reconciles after restart', async () => {
    const path = statePath()
    initializeControlState(path, 'test')
    const created = createInfrastructureOperation(
      path,
      restoreRequest(),
      actor,
      'restore:test:claim',
      new Date('2026-08-24T12:00:00.000Z'),
    ).operation

    const claims = await Promise.all([
      Promise.resolve().then(() =>
        claimNextInfrastructureOperation(
          path,
          'deploy-agent:one',
          30,
          new Date('2026-08-24T12:00:01.000Z'),
        ),
      ),
      Promise.resolve().then(() =>
        claimNextInfrastructureOperation(
          path,
          'deploy-agent:two',
          30,
          new Date('2026-08-24T12:00:01.000Z'),
        ),
      ),
    ])
    expect(claims.filter(Boolean)).toHaveLength(1)
    expect(getInfrastructureOperation(path, created.id)).toMatchObject({
      fencingToken: 1,
      status: 'claimed',
    })

    initializeControlState(path, 'test')
    expect(reconcileInfrastructureOperations(path, new Date('2026-08-24T12:01:00.000Z'))).toBe(1)
    const reclaimed = claimNextInfrastructureOperation(
      path,
      'deploy-agent:two',
      30,
      new Date('2026-08-24T12:01:01.000Z'),
    )
    expect(reclaimed).toMatchObject({ fencingToken: 2, status: 'claimed' })

    if (!reclaimed) throw new Error('Expected reclaimed infrastructure operation')
    expect(() =>
      startInfrastructureOperation(
        path,
        reclaimed.id,
        { fencingToken: 1, leaseOwner: 'deploy-agent:one' },
        new Date('2026-08-24T12:01:02.000Z'),
      ),
    ).toThrow(ControlStateLeaseError)
    const running = startInfrastructureOperation(
      path,
      reclaimed.id,
      { fencingToken: reclaimed.fencingToken, leaseOwner: 'deploy-agent:two' },
      new Date('2026-08-24T12:01:02.000Z'),
    )
    expect(running).toMatchObject({ phase: 'executing', status: 'running' })
    const renewed = heartbeatInfrastructureOperation(
      path,
      running.id,
      { fencingToken: running.fencingToken, leaseOwner: 'deploy-agent:two' },
      60,
      new Date('2026-08-24T12:01:03.000Z'),
    )
    expect(renewed.leaseExpiresAt).toBe('2026-08-24T12:02:03.000Z')
    expect(reconcileInfrastructureOperations(path, new Date('2026-08-24T12:02:04.000Z'))).toBe(1)
    expect(getInfrastructureOperation(path, running.id)).toMatchObject({
      phase: 'reconcile-required',
      status: 'needs-attention',
    })
  })

  it('finishes an actively fenced operation and rejects further lease use', () => {
    const path = statePath()
    initializeControlState(path, 'test')
    createInfrastructureOperation(path, restoreRequest(), actor, 'restore:test:finish')
    const claimed = claimNextInfrastructureOperation(
      path,
      'deploy-agent:test',
      30,
      new Date('2026-08-24T12:00:00.000Z'),
    )
    if (!claimed) throw new Error('Expected claimed infrastructure operation')
    const lease = {
      fencingToken: claimed.fencingToken,
      leaseOwner: 'deploy-agent:test',
    }
    startInfrastructureOperation(path, claimed.id, lease, new Date('2026-08-24T12:00:01.000Z'))
    const completed = finishInfrastructureOperation(
      path,
      claimed.id,
      lease,
      { phase: 'verified', status: 'completed' },
      new Date('2026-08-24T12:00:02.000Z'),
    )
    expect(completed).toMatchObject({
      finishedAt: '2026-08-24T12:00:02.000Z',
      leaseExpiresAt: null,
      leaseOwner: null,
      phase: 'verified',
      status: 'completed',
    })
    expect(() =>
      heartbeatInfrastructureOperation(
        path,
        claimed.id,
        lease,
        30,
        new Date('2026-08-24T12:00:03.000Z'),
      ),
    ).toThrow(ControlStateLeaseError)
  })

  it('keeps audit events append-only across retry and restart', () => {
    const path = statePath()
    initializeControlState(path, 'test')
    const operation = createInfrastructureOperation(
      path,
      restoreRequest(),
      actor,
      'restore:test:audit',
    ).operation
    claimNextInfrastructureOperation(path, 'deploy-agent:test', 1)
    reconcileInfrastructureOperations(path, new Date(Date.now() + 2_000))
    const events = listControlAuditEvents(path, operation.id)
    expect(events.map((event) => event.eventType)).toEqual([
      'infrastructure_operation_created',
      'infrastructure_operation_claimed',
      'infrastructure_operation_lease_expired',
    ])
    expect(() => assertAuditAppendOnly(path)).toThrow('append-only')
    initializeControlState(path, 'test')
    expect(listControlAuditEvents(path, operation.id)).toEqual(events)
  })
})
