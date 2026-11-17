import { cleanup, render, screen } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import messages from '../../messages/zh-cn.json'
import { HealthOverview } from '../../src/components/personal/health-overview'
import { emptyMetrics, type Measurement, measurementSchema } from '../../src/health/contracts'
import { ownerHealthPlan } from '../../src/health/owner-plan'

function record(measuredAt: string, weight: number | null, excluded = false) {
  return measurementSchema.parse({
    ...emptyMetrics,
    id: crypto.randomUUID(),
    source: 'manual',
    sourceRecordKey: null,
    measuredAt,
    timePrecision: 'datetime',
    note: 'synthetic phase-start measurement',
    excluded,
    rawPayload: null,
    revision: 0,
    weight,
    createdAt: '2026-11-17T00:00:00Z',
    updatedAt: '2026-11-17T00:00:00Z',
  })
}

function overview(records: Measurement[]) {
  render(
    <NextIntlClientProvider locale="zh-cn" messages={messages} timeZone="Asia/Shanghai">
      <HealthOverview
        snapshot={{
          ...ownerHealthPlan('zh-cn', []),
          measurements: records.toSorted((a, b) => b.measuredAt.localeCompare(a.measuredAt)),
          planOverrides: [],
          revision: 0,
          sync: { lastSuccessAt: null, sourceUpdatedAt: null, lastError: null },
        }}
      />
    </NextIntlClientProvider>,
  )
  const card = screen.getByText(messages.Health.relativeStart).parentElement
  if (!card) throw new Error('Phase start summary missing')
  return card
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime('2026-11-17T00:00:00Z')
})
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

describe('current phase starting weight summary', () => {
  it('compares the latest weight with valid daily mean measurements on October 26', () => {
    const card = overview([
      record('2026-06-11T08:00:00+08:00', 98),
      record('2026-10-25T08:00:00+08:00', 92),
      record('2026-10-26T08:00:00+08:00', 89),
      record('2026-10-26T09:00:00+08:00', 91),
      record('2026-10-26T10:00:00+08:00', 200, true),
      record('2026-10-26T11:00:00+08:00', null),
      record('2026-11-17T08:00:00+08:00', 87),
    ])
    expect(card).toHaveTextContent('-3 kg')
    expect(card).toHaveTextContent('2026-10-26 · 90 kg')
  })
  it('uses the first valid day within the phase when its start day has no valid weight', () => {
    const card = overview([
      record('2026-10-25T08:00:00+08:00', 90),
      record('2026-10-26T08:00:00+08:00', 89, true),
      record('2026-10-26T09:00:00+08:00', null),
      record('2026-10-27T08:00:00+08:00', 88),
      record('2026-10-27T09:00:00+08:00', 90),
      record('2026-11-17T08:00:00+08:00', 87),
    ])
    expect(card).toHaveTextContent('-2 kg')
    expect(card).toHaveTextContent('2026-10-27 · 89 kg')
  })
  it('shows missing data when the current phase has no valid measured weight', () => {
    const card = overview([
      record('2026-10-25T08:00:00+08:00', 90),
      record('2026-10-26T08:00:00+08:00', 89, true),
      record('2026-11-17T08:00:00+08:00', null),
    ])
    expect(card).toHaveTextContent('— kg')
    expect(card).toHaveTextContent('2026-10-26 · 暂无数据')
  })
  it('omits future records when choosing the first measurement', () => {
    const card = overview([
      record('2026-10-25T08:00:00+08:00', 90),
      record('2026-11-18T08:00:00+08:00', 87),
    ])
    expect(card).toHaveTextContent('— kg')
    expect(card).toHaveTextContent('2026-10-26 · 暂无数据')
  })
  it('uses Beijing dates for the start-day boundary', () => {
    const card = overview([
      record('2026-10-25T16:15:00Z', 89),
      record('2026-10-26T16:15:00Z', 88),
      record('2026-11-17T00:00:00Z', 87),
    ])
    expect(card).toHaveTextContent('-2 kg')
    expect(card).toHaveTextContent('2026-10-26 · 89 kg')
  })
  it('switches to the January 11 actual weight in the challenge phase', () => {
    vi.setSystemTime('2027-01-12T00:00:00Z')
    const card = overview([
      record('2026-10-26T08:00:00+08:00', 90),
      record('2027-01-10T08:00:00+08:00', 80),
      record('2027-01-11T08:00:00+08:00', 79.8),
      record('2027-01-12T08:00:00+08:00', 79),
    ])
    expect(card).toHaveTextContent('-0.8 kg')
    expect(card).toHaveTextContent('2027-01-11 · 79.8 kg')
  })
  it('switches to the actual maintenance start-day weight after March 20', () => {
    vi.setSystemTime('2027-04-01T00:00:00Z')
    const card = overview([
      record('2027-03-20T08:00:00+08:00', 70),
      record('2027-03-21T08:00:00+08:00', 70.5),
      record('2027-04-01T08:00:00+08:00', 70),
    ])
    expect(card).toHaveTextContent('-0.5 kg')
    expect(card).toHaveTextContent('2027-03-21 · 70.5 kg')
  })
  it('uses the first valid maintenance day after its scheduled start', () => {
    vi.setSystemTime('2027-04-01T00:00:00Z')
    const card = overview([
      record('2027-03-20T08:00:00+08:00', 70),
      record('2027-03-21T08:00:00+08:00', 70.5, true),
      record('2027-03-24T08:00:00+08:00', 70.2),
      record('2027-04-01T08:00:00+08:00', 70),
    ])
    expect(card).toHaveTextContent('-0.2 kg')
    expect(card).toHaveTextContent('2027-03-24 · 70.2 kg')
  })
})
