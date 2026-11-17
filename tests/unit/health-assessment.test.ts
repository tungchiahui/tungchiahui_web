import { describe, expect, it } from 'vitest'
import { ageOnMeasurement, assessMetric, compositionPercentage } from '../../src/health/assessment'
import {
  emptyMetrics,
  type HealthReferenceProfile,
  healthReferenceProfileJsonSchema,
  type Measurement,
  measurementSchema,
  ownerHealthSnapshotSchema,
} from '../../src/health/contracts'
import { ownerHealthPlan } from '../../src/health/owner-plan'
import { targetAt } from '../../src/health/plan'

const profile: HealthReferenceProfile = { birthDate: '2000-02-04', height: 178, sex: 'male' }
function record(extra: Partial<Measurement> = {}) {
  return measurementSchema.parse({
    ...emptyMetrics,
    id: crypto.randomUUID(),
    source: 'manual',
    sourceRecordKey: null,
    measuredAt: '2026-11-17T08:00:00+08:00',
    timePrecision: 'datetime',
    weight: 87,
    note: null,
    excluded: false,
    rawPayload: null,
    revision: 0,
    createdAt: '2026-11-17T00:00:00Z',
    updatedAt: '2026-11-17T00:00:00Z',
    ...extra,
  })
}

describe('dynamic health reference assessment', () => {
  it('validates optional private profile configuration without echoing private input', () => {
    expect(healthReferenceProfileJsonSchema.parse('')).toBeUndefined()
    expect(healthReferenceProfileJsonSchema.parse(undefined)).toBeUndefined()
    expect(healthReferenceProfileJsonSchema.parse(JSON.stringify(profile))).toEqual(profile)
    expect(healthReferenceProfileJsonSchema.safeParse('{').success).toBe(false)
    const invalid = healthReferenceProfileJsonSchema.safeParse(
      JSON.stringify({ ...profile, birthDate: 'private-input-marker' }),
    )
    expect(invalid.success).toBe(false)
    if (!invalid.success) expect(invalid.error.message).not.toContain('private-input-marker')
  })
  it('calculates age at the measurement date using Beijing boundaries', () => {
    expect(ageOnMeasurement(profile.birthDate, '2027-02-03T15:59:59Z')).toBe(26)
    expect(ageOnMeasurement(profile.birthDate, '2027-02-03T16:00:00Z')).toBe(27)
    expect(ageOnMeasurement(profile.birthDate, '2026-02-03T00:00:00Z')).toBe(25)
  })
  it.each([
    [18.49, 'low'],
    [18.5, 'standard'],
    [23.999, 'standard'],
    [24, 'high'],
    [27.999, 'high'],
    [28, 'veryHigh'],
  ] as const)('classifies BMI %s as %s before display rounding', (bmi, grade) => {
    expect(assessMetric('bmi', record({ bmi }), [], profile).grade).toBe(grade)
  })
  it('recalculates weight bands from the height recorded in the same measurement', () => {
    const first = assessMetric('weight', record(), [], profile)
    const taller = assessMetric('weight', record({ height: 190 }), [], profile)
    expect(first.bands[1]?.upper).toBeCloseTo(24 * 1.78 ** 2)
    expect(first.grade).toBe('high')
    expect(taller.grade).toBe('high')
    expect(taller.bands[1]?.upper).toBeCloseTo(24 * 1.9 ** 2)
    expect(assessMetric('weight', record({ weight: 70 }), [], profile).grade).toBe('standard')
    expect(first.height).toBe(178)
  })
  it.each([
    [9.99, 'low'],
    [10, 'standard'],
    [20, 'standard'],
    [20.01, 'high'],
    [25, 'high'],
    [25.01, 'veryHigh'],
  ] as const)('uses Chinese male fat boundaries at %s', (bodyFat, grade) => {
    expect(assessMetric('bodyFat', record({ bodyFat }), [], profile).grade).toBe(grade)
  })
  it('selects sex-specific fat, waist and body-water references', () => {
    const female = { ...profile, sex: 'female' as const }
    expect(assessMetric('bodyFat', record({ bodyFat: 25.3 }), [], female).grade).toBe('high')
    expect(assessMetric('bodyFat', record({ bodyFat: 30 }), [], female).grade).toBe('high')
    expect(assessMetric('bodyFat', record({ bodyFat: 30.1 }), [], female).grade).toBe('veryHigh')
    expect(assessMetric('waist', record({ waist: 85 }), [], profile).grade).toBe('high')
    expect(assessMetric('waist', record({ waist: 90 }), [], profile).grade).toBe('veryHigh')
    expect(assessMetric('waist', record({ waist: 85 }), [], female).grade).toBe('veryHigh')
    expect(assessMetric('bodyWater', record({ bodyWater: 49.9 }), [], profile).grade).toBe('low')
    expect(assessMetric('bodyWater', record({ bodyWater: 65 }), [], profile).grade).toBe('standard')
    expect(assessMetric('bodyWater', record({ bodyWater: 65.1 }), [], profile).grade).toBe('high')
    expect(assessMetric('bodyWater', record({ bodyWater: 49.9 }), [], female).grade).toBe(
      'standard',
    )
  })
  it('dynamically predicts resting energy using same-record weight, height, sex and age', () => {
    const result = assessMetric('basalMetabolism', record({ basalMetabolism: 1774 }), [], profile)
    expect(result).toMatchObject({
      grade: 'belowReference',
      source: 'mifflin',
      reference: 1857.5,
      age: 26,
    })
    const birthday = assessMetric(
      'basalMetabolism',
      record({ basalMetabolism: 1774, measuredAt: '2027-02-04T08:00:00+08:00' }),
      [],
      profile,
    )
    expect(birthday.reference).toBe(1852.5)
    expect(
      assessMetric('basalMetabolism', record({ basalMetabolism: 1774, weight: 70 }), [], profile)
        .reference,
    ).toBe(1687.5)
    expect(
      assessMetric('basalMetabolism', record({ basalMetabolism: 1774 }), [], {
        ...profile,
        sex: 'female',
      }).reference,
    ).toBe(1691.5)
    expect(
      assessMetric('basalMetabolism', record({ basalMetabolism: 1774, weight: null }), [], profile)
        .source,
    ).toBe('baseline')
  })
  it('compares device age with historical actual age and retains resting heart-rate endpoints', () => {
    expect(assessMetric('metabolicAge', record({ metabolicAge: 20 }), [], profile).grade).toBe(
      'younger',
    )
    expect(assessMetric('metabolicAge', record({ metabolicAge: 26 }), [], profile).grade).toBe(
      'sameAge',
    )
    expect(assessMetric('metabolicAge', record({ metabolicAge: 27 }), [], profile).grade).toBe(
      'older',
    )
    expect(assessMetric('heartRate', record({ heartRate: 60 }), [], profile).grade).toBe('standard')
    expect(assessMetric('heartRate', record({ heartRate: 100 }), [], profile).grade).toBe(
      'standard',
    )
    expect(assessMetric('heartRate', record({ heartRate: 109 }), [], profile).grade).toBe('high')
  })
  it('weights valid prior days equally and isolates source, time and exclusions', () => {
    const prior = (day: string, muscleMass: number, extra: Partial<Measurement> = {}) =>
      record({ measuredAt: `${day}T08:00:00+08:00`, muscleMass, ...extra })
    const records = [
      prior('2026-11-16', 50),
      prior('2026-11-16', 70),
      prior('2026-11-15', 60),
      prior('2026-11-14', 60),
      prior('2026-11-17', 100),
      prior('2026-11-18', 100),
      prior('2026-10-17', 100),
      prior('2026-11-13', 200, { excluded: true }),
      prior('2026-11-12', 100, { source: 'manual_legacy', sourceRecordKey: 'legacy' }),
    ]
    expect(
      assessMetric('muscleMass', record({ muscleMass: 61.5 }), records, profile),
    ).toMatchObject({ grade: 'aboveBaseline', reference: 60, baselineDays: 3 })
    expect(
      assessMetric('muscleMass', record({ muscleMass: 61.5 }), records.slice(0, 2), profile).grade,
    ).toBe('tracking')
    expect(assessMetric('muscleMass', record({ muscleMass: 60 }), records, profile).grade).toBe(
      'atBaseline',
    )
    expect(assessMetric('muscleMass', record({ muscleMass: 59 }), records, profile).grade).toBe(
      'belowBaseline',
    )
  })
  it('keeps missing, excluded and unprofiled data compatible and pairs percentages within a row', () => {
    expect(assessMetric('weight', undefined, [], profile).grade).toBe('noData')
    expect(assessMetric('weight', record({ excluded: true }), [], profile).value).toBeNull()
    expect(assessMetric('weight', record(), [], undefined).grade).toBe('tracking')
    expect(compositionPercentage(record({ muscleMass: 61.5 }), 'muscleMass')).toBeCloseTo(70.689655)
    expect(compositionPercentage(record({ proteinMass: 14.6 }), 'proteinMass')).toBeCloseTo(
      16.781609,
    )
    expect(
      compositionPercentage(record({ proteinMass: 14.6, weight: null }), 'proteinMass'),
    ).toBeNull()
    expect(compositionPercentage(record({ muscleMass: 90 }), 'muscleMass')).toBeNull()
    expect(assessMetric('physiqueRating', record({ physiqueRating: 5 }), [], profile).grade).toBe(
      'recorded',
    )
  })
  it('isolates personal baselines between smartscale device identities', () => {
    const sourced = (day: string, device: string) =>
      record({
        source: 'smartscale',
        sourceRecordKey: `synthetic:${device}:${day}`,
        rawPayload: { Source: device },
        muscleMass: 60,
        measuredAt: `${day}T08:00:00+08:00`,
      })
    const current = sourced('2026-11-17', 'device-a')
    const history = [
      sourced('2026-11-16', 'device-a'),
      sourced('2026-11-15', 'device-a'),
      sourced('2026-11-14', 'device-b'),
    ]
    expect(assessMetric('muscleMass', current, history, profile)).toMatchObject({
      grade: 'tracking',
      baselineDays: 2,
    })
  })
  it('accepts retained snapshots without profile or new plan options', () => {
    const { plan } = ownerHealthPlan('zh-cn', [])
    const { checkpoint: _checkpoint, maintainAfterGoal: _maintain, ...retainedPlan } = plan
    expect(targetAt(retainedPlan, '2027-03-21')).toBeNull()
    expect(
      ownerHealthSnapshotSchema.safeParse({
        measurements: [],
        planOverrides: [],
        revision: 0,
        sync: { lastSuccessAt: null, sourceUpdatedAt: null, lastError: null },
        plan: retainedPlan,
        planMessages: {},
      }).success,
    ).toBe(true)
  })
})
