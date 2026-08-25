import { mkdtempSync, rmSync } from 'node:fs'
import type { AddressInfo } from 'node:net'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { parseControlApiConfiguration } from '../../src/control-plane/configuration'
import type { Capability } from '../../src/control-plane/contracts'
import {
  initializeControlState,
  listControlAuditEvents,
} from '../../src/control-plane/control-state'
import { createControlApiServer } from '../../src/control-plane/http-server'
import { createLocalOperatorHeaders } from '../../tools/dev/control-auth-fixture'

const cleanup: Array<() => Promise<void> | void> = []

afterEach(async () => {
  for (const operation of cleanup.splice(0).reverse()) {
    await operation()
  }
})

async function serverFixture(rateLimitPerMinute = 120, capabilities?: readonly Capability[]) {
  const directory = mkdtempSync(join(tmpdir(), 'control-http-unit-'))
  const statePath = join(directory, 'control.db')
  initializeControlState(statePath, 'test')
  const baseline = parseControlApiConfiguration({
    CONTROL_API_HOST: '127.0.0.1',
    CONTROL_API_PORT: 8080,
    CONTROL_RATE_LIMIT_PER_MINUTE: rateLimitPerMinute,
    CONTROL_REPLAY_WINDOW_SECONDS: 300,
    CONTROL_STATE_PATH: '/control-state/control.db',
    SITE_RUNTIME_MODE: 'test',
  })
  const operator = baseline.authentication.operatorKeys[0]
  if (!operator) throw new Error('Missing local operator fixture')
  const controlApi = createControlApiServer({
    ...baseline,
    authentication:
      capabilities === undefined
        ? baseline.authentication
        : {
            ...baseline.authentication,
            operatorKeys: [{ ...operator, capabilities: [...capabilities] }],
          },
    statePath,
  })
  await new Promise<void>((resolve) => controlApi.server.listen(0, '127.0.0.1', resolve))
  const address = controlApi.server.address() as AddressInfo
  cleanup.push(async () => {
    await controlApi.close()
    rmSync(directory, { force: true, recursive: true })
  })
  return Object.freeze({
    base: new URL(`http://127.0.0.1:${address.port}`),
    statePath,
  })
}

async function signedFetch(
  base: URL,
  path: string,
  options: { body?: unknown; idempotencyKey?: string; method?: string; nonce?: string } = {},
) {
  const method = options.method ?? 'GET'
  const bodyText = options.body === undefined ? '' : JSON.stringify(options.body)
  const body = Buffer.from(bodyText)
  const headers = new Headers(
    createLocalOperatorHeaders(
      method,
      path,
      body,
      options.nonce === undefined ? {} : { nonce: options.nonce },
    ),
  )
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey)
  const request: RequestInit = { headers, method, signal: AbortSignal.timeout(5_000) }
  if (body.length > 0) request.body = body
  return fetch(new URL(path, base), request)
}

describe('independent control-api HTTP boundary', () => {
  it('requires authentication, restricts methods and emits no-store responses', async () => {
    const { base, statePath } = await serverFixture()
    const unauthenticated = await fetch(new URL('/api/ops/status', base))
    expect(unauthenticated.status).toBe(401)
    expect(unauthenticated.headers.get('cache-control')).toBe('no-store')

    const wrongMethod = await fetch(new URL('/api/ops/status', base), { method: 'DELETE' })
    expect(wrongMethod.status).toBe(405)
    expect(wrongMethod.headers.get('allow')).toBe('GET')

    const authenticated = await signedFetch(base, '/api/ops/status')
    expect(authenticated.status).toBe(200)
    expect(await authenticated.json()).toMatchObject({
      applicationJobs: { available: false, error: 'database_not_configured' },
      productionOperations: false,
    })
    expect(listControlAuditEvents(statePath).map((event) => event.eventType)).toEqual([
      'authentication_failed',
      'control_request_authorized',
    ])
  })

  it('creates, deduplicates and queries SQLite operations without PostgreSQL', async () => {
    const { base } = await serverFixture()
    const body = {
      operationType: 'restore',
      reason: 'PostgreSQL-down HTTP test',
      target: { backupId: 'backup-001', environment: 'test' },
    }
    const created = await signedFetch(base, '/api/ops/infrastructure-operations', {
      body,
      idempotencyKey: 'restore:http:001',
      method: 'POST',
      nonce: 'http-create-00000001',
    })
    expect(created.status).toBe(202)
    const createdBody = (await created.json()) as { operation: { id: string } }

    const duplicate = await signedFetch(base, '/api/ops/infrastructure-operations', {
      body,
      idempotencyKey: 'restore:http:001',
      method: 'POST',
      nonce: 'http-create-00000002',
    })
    expect(duplicate.status).toBe(200)
    expect(await duplicate.json()).toMatchObject({
      created: false,
      operation: createdBody.operation,
    })

    const path = `/api/ops/infrastructure-operations/${createdBody.operation.id}`
    const queried = await signedFetch(base, path, { nonce: 'http-query-00000001' })
    expect(queried.status).toBe(200)
    expect(await queried.json()).toMatchObject({
      operation: { id: createdBody.operation.id, status: 'queued' },
    })

    const applicationJob = await signedFetch(base, '/api/ops/application-jobs', {
      body: { jobType: 'content_sync', payload: { sourceCommit: 'a'.repeat(40) } },
      idempotencyKey: 'content:http:001',
      method: 'POST',
      nonce: 'http-appjob-0000001',
    })
    expect(applicationJob.status).toBe(503)
  })

  it('creates backup and guarded restore operations while PostgreSQL is unavailable', async () => {
    const { base } = await serverFixture()
    const backup = await signedFetch(base, '/api/ops/backups', {
      body: {
        backupType: 'full',
        environment: 'test',
        reason: 'Phase 13 PostgreSQL-down backup fixture',
      },
      idempotencyKey: 'phase13:http:backup:001',
      method: 'POST',
      nonce: 'phase13-http-backup-001',
    })
    expect(backup.status).toBe(202)
    expect(await backup.json()).toMatchObject({
      operation: {
        operationType: 'recovery',
        status: 'queued',
        target: { action: 'backup', backupType: 'full', environment: 'test' },
      },
    })

    const rejected = await signedFetch(base, '/api/ops/restores', {
      body: {
        confirmation: 'RESTORE-PRODUCTION',
        environment: 'production',
        reason: 'wrong environment confirmation fixture',
        selector: { backupId: '20260825-120000F' },
      },
      idempotencyKey: 'phase13:http:restore:rejected',
      method: 'POST',
      nonce: 'phase13-http-restore-rejected',
    })
    expect(rejected.status).toBe(400)

    const restore = await signedFetch(base, '/api/ops/restores', {
      body: {
        confirmation: 'RESTORE-TEST',
        environment: 'test',
        reason: 'Phase 13 PostgreSQL-down PITR fixture',
        selector: { targetTime: '2026-08-25T12:00:00.000Z' },
      },
      idempotencyKey: 'phase13:http:restore:001',
      method: 'POST',
      nonce: 'phase13-http-restore-001',
    })
    expect(restore.status).toBe(202)
    expect(await restore.json()).toMatchObject({
      operation: { operationType: 'restore', status: 'queued' },
    })

    const status = await signedFetch(base, '/api/ops/backups/status', {
      nonce: 'phase13-http-backup-status',
    })
    expect(status.status).toBe(200)
    expect(await status.json()).toEqual({ backups: [] })
  })

  it('rejects malformed payloads, request replay and abusive request rates', async () => {
    const { base } = await serverFixture(3)
    const malformed = await signedFetch(base, '/api/ops/infrastructure-operations', {
      body: { operationType: 'restore' },
      idempotencyKey: 'restore:http:bad',
      method: 'POST',
      nonce: 'http-malformed-00001',
    })
    expect(malformed.status).toBe(400)

    const first = await signedFetch(base, '/api/ops/status', { nonce: 'http-replay-0000001' })
    expect(first.status).toBe(200)
    const replay = await signedFetch(base, '/api/ops/status', { nonce: 'http-replay-0000001' })
    expect(replay.status).toBe(401)

    const limited = await signedFetch(base, '/api/ops/status', { nonce: 'http-rate-000000001' })
    expect(limited.status).toBe(429)
    expect(limited.headers.get('retry-after')).toBeTruthy()
    expect(limited.headers.get('cache-control')).toBe('no-store')
  })

  it('separates translation estimate and paid-execution capabilities', async () => {
    const { base } = await serverFixture(120, ['translation:dry-run'])
    const dryRun = await signedFetch(base, '/api/ops/translations', {
      body: { force: false, mode: 'dry-run', scope: 'pending' },
      idempotencyKey: 'translation:http:dry-run',
      method: 'POST',
      nonce: 'translation-http-dry-run-001',
    })
    expect(dryRun.status).toBe(503)
    expect(dryRun.headers.get('cache-control')).toBe('no-store')

    const execute = await signedFetch(base, '/api/ops/translations', {
      body: {
        budgetUsd: 0.5,
        executionConfirmation: 'EXECUTE_PAID_TRANSLATION',
        force: false,
        mode: 'execute',
        scope: 'pending',
      },
      idempotencyKey: 'translation:http:execute',
      method: 'POST',
      nonce: 'translation-http-execute-001',
    })
    expect(execute.status).toBe(403)
  })
})
