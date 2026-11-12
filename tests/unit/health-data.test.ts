import { describe, expect, it } from 'vitest'
import {
  emptyMetrics,
  healthExchangeSchema,
  measurementInputSchema,
  measurementSchema,
} from '../../src/health/contracts'
import { prepareLegacyHealth } from '../../src/health/migrate'
import { normalizeSmartscaleRow, parseSmartscale } from '../../src/health/smartscale'
import { trendPoints } from '../../src/health/trends'

const legacy = {
  date: '2026-10-29',
  targetMin: 80,
  targetMax: 81,
  weight: '99.1',
  bodyFat: '25.2',
  muscleMass: '50.3',
  waist: '90.4',
  note: 'synthetic fixture',
}
const raw = {
  Date: '2026-10-29T08:30:00+08:00',
  Source: 'synthetic-device',
  User: 'synthetic-owner',
  Weight: 99.1,
  BMI: 29.5,
  BodyFat: 25.2,
  BodyWater: 50.1,
  MuscleMass: 50.3,
  SkeletalMuscleMass: 30.1,
  BoneMass: 3.1,
  ProteinMass: 12.3,
  VisceralFat: 12,
  HeartRate: 70,
  BasalMetabolism: 1900,
  MetabolicAge: 30,
  PhysiqueRating: 3,
  BodyScore: 80,
  Height: 180,
}
function measurement(row: unknown, id: string) {
  return measurementSchema.parse({
    ...normalizeSmartscaleRow(row),
    id,
    source: 'smartscale',
    revision: 0,
    createdAt: '2026-10-29T00:00:00Z',
    updatedAt: '2026-10-29T00:00:00Z',
  })
}
describe('unified health contracts', () => {
  it('preserves legacy values and custom plans at Beijing midnight', () => {
    const result = prepareLegacyHealth({
      version: 2,
      records: [
        legacy,
        {
          ...legacy,
          date: '2026-11-05',
          weight: '',
          bodyFat: '',
          muscleMass: '',
          waist: '',
          note: '',
          targetMin: 70,
          targetMax: 71,
        },
      ],
    })
    expect(result.measurements).toHaveLength(1)
    expect(result.measurements[0]).toMatchObject({
      measuredAt: '2026-10-28T16:00:00.000Z',
      timePrecision: 'date',
      weight: 99.1,
      bodyFat: 25.2,
      muscleMass: 50.3,
      waist: 90.4,
      note: legacy.note,
      bmi: null,
      skeletalMuscleMass: null,
    })
    expect(result.plans.find((row) => row.date === '2026-11-05')).toMatchObject({
      targetMin: 70,
      targetMax: 71,
    })
    expect(prepareLegacyHealth({ version: 2, records: [legacy] }).sha256).toBe(
      prepareLegacyHealth({ version: 2, records: [legacy] }).sha256,
    )
  })
  it('allows full and partial manual records but rejects empty, invalid and misdated records', () => {
    const partial = {
      ...emptyMetrics,
      measuredAt: '2026-10-29T00:00:00+08:00',
      timePrecision: 'date',
      weight: 99,
      note: null,
      excluded: false,
    }
    expect(measurementInputSchema.parse(partial).bmi).toBeNull()
    expect(() =>
      measurementInputSchema.parse({ ...partial, measuredAt: '2026-10-29T00:00:00Z' }),
    ).toThrow()
    expect(() => measurementInputSchema.parse({ ...partial, weight: null })).toThrow()
    expect(() => measurementInputSchema.parse({ ...partial, heartRate: -1 })).toThrow()
  })
  it('retains all exported metrics with their defined units and raw fields', () => {
    const row = normalizeSmartscaleRow({ ...raw, FutureMetric: 123 })
    expect(row).toMatchObject({
      bodyWater: 50.1,
      proteinMass: 12.3,
      height: 180,
      rawPayload: { FutureMetric: 123 },
    })
    expect(normalizeSmartscaleRow({ Date: raw.Date, Weight: 99, HeartRate: 0 })).toMatchObject({
      heartRate: null,
      bmi: null,
    })
  })
  it('preserves same-day measurements and stable identity across metric changes', () => {
    expect(parseSmartscale([raw, { ...raw, Date: '2026-10-29T20:00:00+08:00' }])).toHaveLength(2)
    expect(normalizeSmartscaleRow(raw).sourceRecordKey).toBe(
      normalizeSmartscaleRow({ ...raw, Weight: 100 }).sourceRecordKey,
    )
    expect(parseSmartscale([raw, raw])).toHaveLength(1)
    expect(() => parseSmartscale([raw, { ...raw, Weight: 100 }])).toThrow(
      'health_ambiguous_source_identity',
    )
    expect(() => parseSmartscale([{ Weight: 99 }])).toThrow()
    expect(() => parseSmartscale([raw, { ...raw, User: 'other' }])).toThrow(
      'health_user_selection_required',
    )
    expect(parseSmartscale([raw, { ...raw, User: 'other' }], 'synthetic-owner')).toHaveLength(1)
  })
  it('aggregates per metric and Beijing date, omitting NULL and excluded rows', () => {
    const records = [
      measurement(raw, '10000000-0000-4000-8000-000000000001'),
      measurement(
        { ...raw, Date: '2026-10-29T20:00:00+08:00', Weight: 101.1 },
        '10000000-0000-4000-8000-000000000002',
      ),
      measurement(
        { Date: '2026-10-30T01:00:00+08:00', Weight: 102 },
        '10000000-0000-4000-8000-000000000003',
      ),
    ]
    expect(trendPoints(records, 'weight', true, '', '').map((row) => row.count)).toEqual([2, 1])
    expect(trendPoints(records, 'weight', true, '', '')[0]?.value).toBeCloseTo(100.1)
    expect(trendPoints(records, 'bodyFat', false, '', '')).toHaveLength(2)
    expect(
      trendPoints(
        records.map((row) => ({ ...row, excluded: true })),
        'weight',
        true,
        '',
        '',
      ),
    ).toHaveLength(0)
    const file = healthExchangeSchema.parse({
      format: 'tungchiahui-health',
      schemaVersion: 1,
      timeZone: 'Asia/Shanghai',
      exportedAt: '2026-10-30T00:00:00Z',
      measurements: records,
      planOverrides: [],
    })
    expect(healthExchangeSchema.parse(JSON.parse(JSON.stringify(file)))).toEqual(file)
    expect(() =>
      healthExchangeSchema.parse({ ...file, measurements: [records[0], records[0]] }),
    ).toThrow()
  })
})
