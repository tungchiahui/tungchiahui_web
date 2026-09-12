import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { describe, expect, it } from 'vitest'

import {
  initializeControlState,
  readControlObservabilitySnapshot,
} from '../../src/control-plane/control-state'
import {
  AlertLifecycle,
  productionAlertRules,
  productionComponentCatalog,
} from '../../src/observability/policy'
import { apiSecurityHeaders, browserSecurityHeaders } from '../../src/observability/security'
import {
  redactTelemetryText,
  requestIdFromHeaders,
  serializeTelemetryEvent,
} from '../../src/observability/telemetry'

describe('Phase 16 observability and security policy', () => {
  it('redacts sensitive values and rejects sensitive field names', () => {
    const input =
      'Bearer abc.def password=hunter2 postgresql://owner:secret@postgres/db https://owner:secret@example.test/path age-secret-key-ABC github_pat_abcdefghijklmnopqrstuvwxyz X-Amz-Signature=deadbeef'
    const redacted = redactTelemetryText(input)
    expect(redacted).not.toContain('abc.def')
    expect(redacted).not.toContain('hunter2')
    expect(redacted).not.toContain('owner:secret')
    expect(redacted).not.toContain('age-secret-key-ABC')
    expect(redacted).not.toContain('github_pat_')
    expect(redacted).not.toContain('deadbeef')
    expect(redacted).toContain('[REDACTED]')

    expect(() =>
      serializeTelemetryEvent({
        attributes: { authorization: 'never log this' },
        component: 'control-api',
        event: 'request_failed',
        level: 'error',
      }),
    ).toThrow('Sensitive telemetry attribute name is forbidden')

    const serialized = serializeTelemetryEvent({
      attributes: { message: 'postgresql://owner:secret@postgres/db' },
      component: 'control-api',
      event: 'request_failed',
      level: 'error',
    })
    expect(serialized).not.toContain('owner:secret')
    expect(serialized).toContain('[REDACTED]')

    const maliciousHeaders = new Headers({ 'x-request-id': 'secret-looking-attacker-value' })
    expect(requestIdFromHeaders(maliciousHeaders)).not.toBe('secret-looking-attacker-value')
    const trustedHeaders = new Headers({
      'x-request-id': '00000000-0000-4000-8000-000000000001',
    })
    expect(requestIdFromHeaders(trustedHeaders)).toBe('00000000-0000-4000-8000-000000000001')
  })

  it('emits firing and resolved transitions without alert noise', () => {
    const lifecycle = new AlertLifecycle()
    const firing = [{ active: true, details: {}, name: 'PostgresqlUnavailable' }] as const
    expect(lifecycle.evaluate(firing)).toEqual([{ name: 'PostgresqlUnavailable', state: 'firing' }])
    expect(lifecycle.evaluate(firing)).toEqual([])
    expect(
      lifecycle.evaluate([{ active: false, details: {}, name: 'PostgresqlUnavailable' }]),
    ).toEqual([{ name: 'PostgresqlUnavailable', state: 'resolved' }])
  })

  it('injects and clears representative availability, backlog and disk alerts', () => {
    const lifecycle = new AlertLifecycle()
    const injected = [
      { active: true, details: { status: 503 }, name: 'WebAvailabilityFailed' },
      { active: true, details: { backlog: 25 }, name: 'ApplicationJobStuck' },
      { active: true, details: { used_percent: 95 }, name: 'HostDiskPressure' },
      { active: true, details: { status: 502 }, name: 'AssetStorageUnavailable' },
    ] as const
    expect(lifecycle.evaluate(injected)).toEqual([
      { name: 'WebAvailabilityFailed', state: 'firing' },
      { name: 'ApplicationJobStuck', state: 'firing' },
      { name: 'HostDiskPressure', state: 'firing' },
      { name: 'AssetStorageUnavailable', state: 'firing' },
    ])
    expect(lifecycle.evaluate(injected)).toEqual([])
    expect(lifecycle.evaluate(injected.map((signal) => ({ ...signal, active: false })))).toEqual([
      { name: 'WebAvailabilityFailed', state: 'resolved' },
      { name: 'ApplicationJobStuck', state: 'resolved' },
      { name: 'HostDiskPressure', state: 'resolved' },
      { name: 'AssetStorageUnavailable', state: 'resolved' },
    ])
  })

  it('covers every production component with a health owner and actionable alert', () => {
    const components = new Set(productionComponentCatalog.map((entry) => entry.component))
    expect(components).toEqual(
      new Set([
        'backup',
        'content-worker',
        'control-api',
        'deploy-agent',
        'host',
        'nextjs',
        'observability-agent',
        'openresty',
        'pgbouncer',
        'postgresql',
        's3',
      ]),
    )
    expect(new Set(productionAlertRules.map((rule) => rule.component))).toEqual(components)
    expect(productionAlertRules.every((rule) => rule.runbook.includes('#'))).toBe(true)
  })

  it('provides HSTS, CSP, MIME, referrer, permissions and frame policy', () => {
    expect(browserSecurityHeaders['strict-transport-security']).toContain('max-age=31536000')
    expect(browserSecurityHeaders['content-security-policy']).toContain("object-src 'none'")
    expect(browserSecurityHeaders['content-security-policy']).toContain(
      'https://umami.tungchiahui.cn',
    )
    expect(browserSecurityHeaders['content-security-policy']).not.toContain("'unsafe-eval'")
    expect(browserSecurityHeaders['x-content-type-options']).toBe('nosniff')
    expect(browserSecurityHeaders['referrer-policy']).toBe('strict-origin-when-cross-origin')
    expect(browserSecurityHeaders['permissions-policy']).toContain('camera=()')
    expect(apiSecurityHeaders['cache-control']).toBe('no-store')
  })

  it('reports SQLite integrity, audit continuity, lease, failure and backup state', () => {
    const statePath = join(mkdtempSync(join(tmpdir(), 'phase16-control-state-')), 'control.db')
    initializeControlState(statePath, 'test')
    const snapshot = readControlObservabilitySnapshot(statePath)
    expect(snapshot).toMatchObject({
      audit: { count: 0, maxId: 0 },
      backup: null,
      integrity: 'ok',
      operations: {
        expiredLeaseCount: 0,
        failed24hCount: 0,
        incompleteCount: 0,
        needsAttentionCount: 0,
        oldestIncompleteAgeSeconds: 0,
      },
      schemaVersion: 7,
    })
  })

  it('expires infrastructure failures at the exact 24-hour boundary', () => {
    const statePath = join(mkdtempSync(join(tmpdir(), 'phase16-control-state-')), 'control.db')
    initializeControlState(statePath, 'test')
    const database = new DatabaseSync(statePath)
    const insertFailure = database.prepare(
      `INSERT INTO infrastructure_operations
         (id, operation_type, status, phase, target_json, idempotency_key, actor_id,
          reason, requested_at, created_at, updated_at, finished_at)
       VALUES (?, 'deploy', 'failed', 'deployment-failed', '{}', ?, 'operator:test',
               'observability boundary fixture', ?, ?, ?, ?)`,
    )
    insertFailure.run(
      '10000000-0000-4000-8000-000000000001',
      'observability:expired-failure',
      '2026-09-08T10:59:00.000Z',
      '2026-09-08T10:59:00.000Z',
      '2026-09-08T10:59:00.000Z',
      '2026-09-08T10:59:00.000Z',
    )
    insertFailure.run(
      '10000000-0000-4000-8000-000000000002',
      'observability:recent-failure',
      '2026-09-08T11:01:00.000Z',
      '2026-09-08T11:01:00.000Z',
      '2026-09-08T11:01:00.000Z',
      '2026-09-08T11:01:00.000Z',
    )
    database.close()

    expect(
      readControlObservabilitySnapshot(statePath, new Date('2026-09-09T11:00:00.000Z')).operations
        .failed24hCount,
    ).toBe(1)
  })
})
