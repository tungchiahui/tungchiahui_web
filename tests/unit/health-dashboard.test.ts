import { IncomingMessage } from 'node:http'
import { Socket } from 'node:net'
import { describe, expect, it, vi } from 'vitest'
import { curveSegments, curveValue, inspectCurve, timeSeriesCurve } from '../../src/health/chart'
import {
  emptyMetrics,
  healthPlanSchema,
  measurementSchema,
  ownerHealthSnapshotSchema,
} from '../../src/health/contracts'
import { createHealthHttpHandler } from '../../src/health/http'
import { ownerHealthPlan } from '../../src/health/owner-plan'
import { targetAt } from '../../src/health/plan'
import { HealthRepository } from '../../src/health/repository'
import {
  measurementCalendar,
  metricSeries,
  periodSummaries,
  smoothDailyPoints,
} from '../../src/health/trends'

function row(day: string, weight: number | null, extra = {}) {
  return measurementSchema.parse({
    ...emptyMetrics,
    id: crypto.randomUUID(),
    source: 'manual',
    sourceRecordKey: null,
    measuredAt: `${day}T08:00:00+08:00`,
    timePrecision: 'datetime',
    note: null,
    excluded: false,
    rawPayload: null,
    revision: 0,
    weight,
    createdAt: '2026-11-14T00:00:00Z',
    updatedAt: '2026-11-14T00:00:00Z',
    ...extra,
  })
}

describe('private health dashboard plan', () => {
  it('keeps the inclusive maintenance interval at 90 and reaches 80 on January 10', () => {
    const { plan } = ownerHealthPlan('zh-cn', [])
    for (let day = Date.parse('2026-08-14'); day <= Date.parse('2026-10-26'); day += 86400000) {
      expect(targetAt(plan, new Date(day).toISOString().slice(0, 10))).toEqual({ min: 90, max: 90 })
    }
    expect(targetAt(plan, '2027-01-10')).toEqual({ min: 80, max: 80 })
    expect(targetAt(plan, '2026-11-10')?.min).toBeCloseTo(88.0263)
    expect(targetAt(plan, '2026-08-13')?.min).toBeGreaterThan(90)
    expect(targetAt(plan, '2026-06-10')).toBeNull()
    expect(targetAt(plan, '2027-01-11')).toBeNull()
    expect(plan.longTermWeight).toBe(75)
  })
  it('preserves earlier custom targets and supersedes old goals in the revised interval', () => {
    const overrides = [
      { date: '2026-07-01', targetMin: 95, targetMax: 96 },
      { date: '2026-08-20', targetMin: 89.5, targetMax: 90.5 },
      { date: '2026-10-29', targetMin: 82, targetMax: 83.5 },
    ]
    const { plan } = ownerHealthPlan('zh-cn', overrides)
    expect(targetAt(plan, '2026-07-01')).toEqual({ min: 95, max: 96 })
    expect(targetAt(plan, '2026-08-20')).toEqual({ min: 90, max: 90 })
    expect(targetAt(plan, '2026-10-29')?.min).toBeGreaterThan(89)
    expect(overrides).toHaveLength(3)
    expect(() => healthPlanSchema.parse({ ...plan, targets: plan.targets.toReversed() })).toThrow()
  })
  it('returns private localized plan content only after Owner authorization', async () => {
    const repository = new HealthRepository('postgresql://test:test@127.0.0.1:1/test')
    const snapshot = {
      measurements: [],
      planOverrides: [],
      revision: 0,
      sync: { lastSuccessAt: null, sourceUpdatedAt: null, lastError: null },
    }
    const read = vi.spyOn(repository, 'snapshot').mockResolvedValue(snapshot)
    const socket = new Socket()
    try {
      for (const role of [undefined, 'user', 'owner'] as const) {
        const handler = createHealthHttpHandler(
          { mode: 'test' },
          { current: async () => (role ? { id: 'test-owner', role } : undefined) },
          repository,
        )
        const request = new IncomingMessage(socket)
        request.url = '/api/ops/health/snapshot?locale=en-us'
        request.method = 'GET'
        const result = await handler(
          request,
          new Headers({ cookie: `site_session=${'a'.repeat(64)}` }),
        )
        expect(result.status).toBe(role === 'owner' ? 200 : role === 'user' ? 403 : 401)
        expect(result.headers['cache-control']).toBe('private, no-store')
        if (role === 'owner') {
          const parsed = ownerHealthSnapshotSchema.parse(result.body)
          expect(parsed.plan.goalWeight).toBe(80)
          expect(parsed.planMessages.planTitle).toBe('Current Templates')
        } else expect(JSON.stringify(result.body)).not.toContain('2027-01-10')
      }
      expect(read).toHaveBeenCalledTimes(1)
    } finally {
      read.mockRestore()
      socket.destroy()
      await repository.close()
    }
  })
})

describe('health chart statistics', () => {
  it('weights days equally, independently omits nulls, and skips excluded rows', () => {
    const records = [
      row('2026-11-02', 90, { bodyFat: 20 }),
      row('2026-11-02', 94),
      row('2026-11-03', 88, { bodyFat: 24 }),
      row('2026-11-04', 200, { excluded: true }),
      row('2026-11-05', null, { waist: 90 }),
    ]
    const summary = periodSummaries(records, 'week')[0]
    expect(summary).toMatchObject({
      start: '2026-11-02',
      end: '2026-11-08',
      days: 3,
      weight: 90,
      bodyFat: 22,
      change: null,
    })
    expect(metricSeries(records, 'weight', 'daily').map((point) => point.value)).toEqual([92, 88])
    expect(metricSeries(records, 'weight', 'raw')).toHaveLength(3)
  })
  it('uses calendar days for rolling means and includes samples before the visible window', () => {
    const records = [
      row('2026-11-01', 100),
      row('2026-11-07', 90),
      row('2026-11-08', 88),
      row('2026-11-09', null, { waist: 90 }),
    ]
    expect(
      metricSeries(records, 'weight', 'rolling', '2026-11-07').map(({ value, count }) => ({
        value,
        count,
      })),
    ).toEqual([
      { value: 95, count: 2 },
      { value: 89, count: 2 },
    ])
    expect(metricSeries(records, 'weight', 'rolling', '', '2026-11-07')).toHaveLength(2)
  })
  it('compares adjacent periods, leaves gaps empty and respects Beijing day boundaries', () => {
    const records = [
      row('2026-10-31', 92, { measuredAt: '2026-10-31T16:30:00Z' }),
      row('2026-11-02', 90),
      row('2026-11-16', 88),
    ]
    const weeks = periodSummaries(records, 'week')
    expect(weeks.map((week) => week.change)).toEqual([null, -2, null])
    expect(periodSummaries(records, 'month')[0]).toMatchObject({ start: '2026-11-01', weight: 90 })
    const calendar = measurementCalendar(records, '2026-11-14')
    expect(calendar).toHaveLength(91)
    expect(calendar.find((day) => day.day === '2026-11-01')?.count).toBe(1)
    expect(calendar.find((day) => day.day === '2026-11-15')?.future).toBe(true)
    expect(periodSummaries([], 'week')).toEqual([])
  })
  it('generates finite shape-preserving curves', () => {
    const points = [
      { x: 0, y: 90 },
      { x: 10, y: 80 },
      { x: 30, y: 85 },
    ]
    const segments = curveSegments(points)
    expect(segments).toHaveLength(2)
    for (const segment of segments) {
      const lower = Math.min(segment.start.y, segment.end.y)
      const upper = Math.max(segment.start.y, segment.end.y)
      for (const control of [segment.control1, segment.control2]) {
        expect(Number.isFinite(control.x)).toBe(true)
        expect(control.y).toBeGreaterThanOrEqual(lower)
        expect(control.y).toBeLessThanOrEqual(upper)
      }
    }
    expect(curveSegments([])).toEqual([])
    expect(curveSegments([{ x: 0, y: 1 }])).toEqual([])
    expect(
      JSON.stringify(
        curveSegments([
          { x: 0, y: 1 },
          { x: 0, y: 2 },
        ]),
      ),
    ).not.toMatch(/NaN|Infinity/)
  })
})

describe('smoothed trends and missing-day estimates', () => {
  it('suppresses daily oscillation while preserving observed values and exact linear trends', () => {
    const samples = Array.from({ length: 40 }, (_, index) => ({
      id: String(index),
      time: new Date(Date.parse('2026-10-01T00:00:00+08:00') + index * 86400000).toISOString(),
      value: 95 - index * 0.1 + Math.sin(index) * 0.6,
      count: 1,
    }))
    const fitted = smoothDailyPoints(samples, 14)
    const roughness = (values: typeof fitted) =>
      values
        .slice(2)
        .reduce(
          (sum, point, offset) =>
            sum +
            Math.abs(
              point.value - 2 * (values[offset + 1]?.value ?? 0) + (values[offset]?.value ?? 0),
            ),
          0,
        )
    expect(roughness(fitted)).toBeLessThan(roughness(samples) * 0.25)
    expect(fitted.map((point) => point.observedValue)).toEqual(samples.map((point) => point.value))
    const linear = samples.map((point, index) => ({ ...point, value: 90 - index * 0.2 }))
    for (const window of [7, 14, 30] as const) {
      smoothDailyPoints(linear, window).forEach((point, index) => {
        expect(point.value).toBeCloseTo(linear[index]?.value ?? 0, 8)
      })
    }
    expect(smoothDailyPoints([], 14)).toEqual([])
    expect(smoothDailyPoints(samples.slice(0, 1), 30)[0]?.value).toBe(samples[0]?.value)
    expect(samples[0]).not.toHaveProperty('observedValue')
  })
  it('smooths with calendar weights and keeps the visible-window calculation consistent', () => {
    const records = [
      row('2026-11-01', 90),
      row('2026-11-02', 94),
      row('2026-11-02', 92),
      row('2026-11-03', 89),
      row('2026-11-05', 200, { excluded: true }),
      row('2026-11-08', null, { waist: 90 }),
    ]
    const all = metricSeries(records, 'weight', 'smooth', '', '', 14)
    expect(all).toHaveLength(3)
    expect(all[1]?.observedValue).toBe(93)
    expect(all[1]?.count).toBe(2)
    expect(metricSeries(records, 'weight', 'smooth', '2026-11-02', '', 14)).toEqual(all.slice(1))
    expect(all.every((point) => point.value >= 89 && point.value <= 93)).toBe(true)
    const isolated = metricSeries(
      [row('2026-08-01', 100), row('2026-11-01', 90)],
      'weight',
      'smooth',
    )
    expect(isolated.map((point) => point.value)).toEqual([100, 90])
  })
  it('connects short and long gaps with bounded cubic estimates and retains endpoint continuity', () => {
    const points = [
      row('2026-08-01', 95),
      row('2026-08-02', 94),
      row('2026-08-04', 93),
      row('2026-10-25', 90),
    ]
    const daily = metricSeries(points, 'weight', 'smooth')
    const segments = timeSeriesCurve(daily)
    for (const [index, segment] of segments.entries()) {
      for (const ratio of [0, 0.25, 0.5, 0.75, 1]) {
        expect(curveValue(segment, ratio)).toBeGreaterThanOrEqual(
          Math.min(segment.start.y, segment.end.y),
        )
        expect(curveValue(segment, ratio)).toBeLessThanOrEqual(
          Math.max(segment.start.y, segment.end.y),
        )
      }
      const next = segments[index + 1]
      if (next) {
        expect(segment.end).toEqual(next.start)
        const leftSlope =
          (segment.end.y - segment.control2.y) / (segment.end.x - segment.control2.x)
        const rightSlope = (next.control1.y - next.start.y) / (next.control1.x - next.start.x)
        expect(leftSlope).toBeCloseTo(rightSlope, 12)
      }
    }
    expect(inspectCurve(daily, segments, Date.parse('2026-08-03T08:00:00+08:00'))).toMatchObject({
      estimated: true,
      observedValue: null,
      count: 0,
      from: '2026-08-02',
      to: '2026-08-04',
    })
    const middle = inspectCurve(daily, segments, Date.parse('2026-09-01T08:00:00+08:00'))
    expect(middle?.estimated).toBe(true)
    expect(middle?.value).toBeGreaterThanOrEqual(90)
    expect(middle?.value).toBeLessThanOrEqual(93)
    expect(inspectCurve(daily, segments, Date.parse('2026-08-04T08:00:00+08:00'))?.estimated).toBe(
      false,
    )
    expect(inspectCurve(daily, segments, Date.parse('2026-11-01T00:00:00+08:00'))).toMatchObject({
      estimated: false,
      value: 90,
    })
    const coincident = metricSeries([row('2026-11-01', 90), row('2026-11-01', 88)], 'weight', 'raw')
    expect(
      inspectCurve(
        coincident,
        timeSeriesCurve(coincident),
        Date.parse(coincident[0]?.time ?? ''),
        true,
        1,
      )?.value,
    ).toBe(88)
    expect(inspectCurve([], [], Date.now())).toBeNull()
    expect(
      inspectCurve(daily, segments, Date.parse('2026-09-01T08:00:00+08:00'), true)?.estimated,
    ).toBe(false)
  })
})
