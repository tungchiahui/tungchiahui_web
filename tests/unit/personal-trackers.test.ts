import { describe, expect, it } from 'vitest'
import { parseControlApiConfiguration } from '../../src/control-plane/configuration'
import {
  createOwnerHttpHandler,
  ownerRequestOriginAllowed,
  ownerSessionCookie,
} from '../../src/control-plane/owner-http'
import { localOwnerPasswordHash, verifyOwnerPassword } from '../../src/control-plane/owner-password'
import {
  emptyWeightPayload,
  techFootprintPayloadSchema,
  updateTechRecord,
} from '../../src/personal/contracts'
import { roadmap, techRecordKeys } from '../../src/personal/roadmap'
import { exportWeightCsv, importWeightCsv } from '../../src/personal/weight-csv'
import { createWeeklyRecords } from '../../src/personal/weight-plan'

describe('personal tracker contracts', () => {
  it('retains the complete legacy roadmap and starts measurements empty', () => {
    expect(roadmap.semesterPlans).toHaveLength(10)
    expect(roadmap.semesterPlans.flatMap((stage) => stage.tasks)).toHaveLength(46)
    expect(techRecordKeys).toHaveLength(231)
    expect(new Set(techRecordKeys).size).toBe(231)
    expect(techRecordKeys).toContain('y1a/stm32/pid')
    expect(createWeeklyRecords()).toHaveLength(35)
    expect(
      createWeeklyRecords().every((record) =>
        [record.weight, record.bodyFat, record.muscleMass, record.waist, record.note].every(
          (value) => value === '',
        ),
      ),
    ).toBe(true)
    for (const stage of roadmap.semesterPlans)
      expect(stage.allocation.reduce((a, b) => a + b, 0)).toBe(100)
  })
  it('keeps status and percentage consistent in both directions, including done to doing', () => {
    const done = updateTechRecord(undefined, { status: 'done' })
    const doing = updateTechRecord(done, { status: 'doing' })
    expect(doing.progress).toBe(99)
    expect(updateTechRecord(doing, { progress: 0 }).status).toBe('todo')
    expect(
      techFootprintPayloadSchema.parse({ version: 2, records: { 'y1a/stm32/pid': doing } }),
    ).toBeTruthy()
  })
  it('round-trips quoted CSV notes and prevents spreadsheet formula execution', () => {
    const first = createWeeklyRecords()[0]
    if (!first) throw new Error('Missing plan')
    const payload = {
      version: 2 as const,
      records: [{ ...first, weight: '97.5', note: '=SUM(1,2)\n"quoted"' }],
    }
    const csv = exportWeightCsv(payload)
    expect(csv).toContain("'=SUM")
    const imported = importWeightCsv(csv, emptyWeightPayload)
    expect(imported.records[0]).toEqual(payload.records[0])
    expect(() =>
      importWeightCsv(
        'date,target,weight,fat,muscle,waist,note\n2026-06-11,,999,,,,',
        emptyWeightPayload,
      ),
    ).toThrow()
    expect(() =>
      importWeightCsv('2026-06-11,,98,,,,\n2026-06-11,,97,,,,', emptyWeightPayload),
    ).toThrow()
    expect(() => importWeightCsv('"unterminated', emptyWeightPayload)).toThrow()
  })
})

describe('owner browser authentication boundary', () => {
  const configuration = parseControlApiConfiguration({
    CONTROL_API_HOST: '127.0.0.1',
    CONTROL_API_PORT: 8080,
    CONTROL_STATE_PATH: '/control-state/control.db',
    SITE_RUNTIME_MODE: 'test',
  })
  const headers = new Headers({
    origin: 'http://127.0.0.1:3000',
    'content-type': 'application/json',
  })
  it('uses an independent password verifier and production secure cookies', async () => {
    expect(await verifyOwnerPassword('local-only-owner-password', localOwnerPasswordHash)).toBe(
      true,
    )
    expect(await verifyOwnerPassword('incorrect', localOwnerPasswordHash)).toBe(false)
    const cookie = ownerSessionCookie('a'.repeat(64), true)
    expect(cookie).toContain('HttpOnly; SameSite=Strict; Secure')
    expect(cookie).toContain('Path=/api/ops/owner')
    expect(ownerSessionCookie('', true)).toContain('Max-Age=0')
    expect(ownerRequestOriginAllowed(headers, 'production')).toBe(false)
    expect(
      ownerRequestOriginAllowed(
        new Headers({ origin: 'https://www.tungchiahui.cn' }),
        'production',
      ),
    ).toBe(true)
    expect(
      ownerRequestOriginAllowed(
        new Headers({ origin: 'https://www.tungchiahui.cn.attacker.test' }),
        'production',
      ),
    ).toBe(false)
  })
  it('rejects CSRF, anonymous writes, broader control paths, and defaults to disabled in production', async () => {
    const handler = createOwnerHttpHandler(configuration, null, null)
    expect(
      (await handler('/api/ops/owner/session', 'POST', new Headers(), Buffer.from('{}'))).status,
    ).toBe(403)
    expect(
      (await handler('/api/ops/owner/deployments', 'POST', headers, Buffer.from('{}'))).status,
    ).toBe(404)
    expect(
      (await handler('/api/ops/owner/session', 'PUT', headers, Buffer.from('{}'))).status,
    ).toBe(405)
    const disabled = createOwnerHttpHandler(
      { ...configuration, mode: 'production', ownerPasswordHash: undefined },
      null,
      null,
    )
    expect(
      (await disabled('/api/ops/owner/session', 'GET', new Headers(), Buffer.alloc(0))).body,
    ).toMatchObject({ authenticated: false, enabled: false })
  })
  it('limits password attempts before expensive verification', async () => {
    const sessions = { create: async () => '', valid: async () => false, revoke: async () => {} }
    const datasets = {
      updateOwnerDataset: async () => {
        throw new Error('Must not write')
      },
    }
    const handler = createOwnerHttpHandler(configuration, sessions, datasets)
    for (let i = 0; i < 5; i++)
      expect(
        (
          await handler(
            '/api/ops/owner/session',
            'POST',
            headers,
            Buffer.from('{"password":"wrong"}'),
          )
        ).status,
      ).toBe(401)
    expect(
      (
        await handler(
          '/api/ops/owner/session',
          'POST',
          headers,
          Buffer.from('{"password":"wrong"}'),
        )
      ).status,
    ).toBe(429)
    expect(
      (
        await handler(
          '/api/ops/owner/datasets/tech_footprint',
          'PUT',
          headers,
          Buffer.from('{"expectedRevision":0,"payload":{"version":2,"records":{}}}'),
        )
      ).status,
    ).toBe(401)
  })
})
