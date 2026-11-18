import { describe, expect, it } from 'vitest'
import { assessMetric } from '../../src/health/assessment'
import {
  emptyMetrics,
  healthReferenceProfileJsonSchema,
  healthReferenceProfileSchema,
  type Measurement,
  measurementSchema,
} from '../../src/health/contracts'
import { compositionPercentage, displayMetricValue } from '../../src/health/display-metrics'
import { metricSeries } from '../../src/health/trends'
import { syntheticReportProfile } from '../fixtures/health-reference'

function record(extra: Partial<Measurement> = {}) {
  return measurementSchema.parse({
    ...emptyMetrics,
    id: crypto.randomUUID(),
    source: 'manual',
    sourceRecordKey: null,
    measuredAt: '2026-11-17T08:00:00+08:00',
    timePrecision: 'datetime',
    weight: 87,
    muscleMass: 61.5,
    proteinMass: 14.6,
    note: null,
    excluded: false,
    rawPayload: null,
    revision: 0,
    createdAt: '2026-11-17T00:00:00Z',
    updatedAt: '2026-11-17T00:00:00Z',
    ...extra,
  })
}

describe('derived composition metrics', () => {
  it('derives fat mass from same-measurement weight and body-fat percentage', () => {
    expect(displayMetricValue(record({ bodyFat: 25.3 }), 'fatMass')).toBeCloseTo(22.011)
    expect(displayMetricValue(record({ bodyFat: 0 }), 'fatMass')).toBe(0)
    expect(displayMetricValue(record({ bodyFat: 100 }), 'fatMass')).toBe(87)
    for (const row of [
      undefined,
      record({ bodyFat: null }),
      record({ weight: null, bodyFat: 25.3 }),
      record({ excluded: true, bodyFat: 25.3 }),
    ]) {
      expect(displayMetricValue(row, 'fatMass')).toBeNull()
    }
    expect(compositionPercentage(record({ weight: null, bodyFat: 25.3 }), 'fatMass')).toBe(25.3)
    expect(compositionPercentage(record({ excluded: true, bodyFat: 25.3 }), 'fatMass')).toBeNull()
  })
  it('aggregates paired fat mass before calculating daily, rolling and smooth trends', () => {
    const rows = [
      record({ weight: 100, bodyFat: 20 }),
      record({ weight: 50, bodyFat: 40, measuredAt: '2026-11-17T09:00:00+08:00' }),
      record({ weight: null, bodyFat: 60 }),
      record({ weight: 100, bodyFat: null }),
      record({ weight: 100, bodyFat: 100, excluded: true }),
    ]
    for (const mode of ['daily', 'rolling', 'smooth'] as const) {
      expect(metricSeries(rows, 'fatMass', mode)[0]?.value).toBe(20)
    }
    expect(metricSeries(rows, 'fatMass', 'daily')[0]?.count).toBe(2)
    expect(metricSeries(rows, 'fatMass', 'rolling')[0]?.count).toBe(1)
    expect(metricSeries(rows, 'fatMass', 'raw')).toHaveLength(2)
  })
  it.each([70, 87, 100])('converts fat reference bounds with each %s kg weight', (weight) => {
    for (const sex of ['male', 'female'] as const) {
      const profile = { ...syntheticReportProfile, sex }
      for (const bodyFat of [0, 10, 15, 20, 25, 25.01, 30, 30.01, 100]) {
        const row = record({ weight, bodyFat })
        const percentage = assessMetric('bodyFat', row, [], profile)
        const mass = assessMetric('fatMass', row, [], profile)
        expect(mass.source).toBe('chinaFat')
        expect(mass.grade).toBe(percentage.grade)
        expect(mass.value).toBeCloseTo((weight * bodyFat) / 100)
        for (const [index, band] of percentage.bands.entries()) {
          expect(mass.bands[index]?.inclusive).toBe(band.inclusive)
          if (band.upper === null) expect(mass.bands[index]?.upper).toBeNull()
          else expect(mass.bands[index]?.upper).toBeCloseTo((weight * band.upper) / 100)
        }
      }
    }
    const missingWeight = record({ weight: null, bodyFat: 25.3 })
    expect(assessMetric('bodyFat', missingWeight, [], syntheticReportProfile).grade).toBe(
      'veryHigh',
    )
    expect(assessMetric('fatMass', missingWeight, [], syntheticReportProfile)).toMatchObject({
      grade: 'noData',
      value: null,
      bands: [],
      reference: null,
    })
  })
  it('derives both percentages from paired values in one measurement', () => {
    expect(displayMetricValue(record(), 'musclePercentage')).toBeCloseTo(70.689655)
    expect(displayMetricValue(record(), 'proteinPercentage')).toBeCloseTo(16.781609)
    for (const row of [
      record({ weight: null }),
      record({ muscleMass: null }),
      record({ muscleMass: 90 }),
      record({ excluded: true }),
    ]) {
      expect(compositionPercentage(row, 'muscleMass')).toBeNull()
    }
    expect(displayMetricValue(undefined, 'musclePercentage')).toBeNull()
    expect(displayMetricValue(record({ excluded: true }), 'weight')).toBeNull()
  })
  it('averages per-measurement percentages before daily, rolling and smooth aggregation', () => {
    const rows = [
      record({ weight: 100, muscleMass: 60, proteinMass: 10 }),
      record({
        weight: 50,
        muscleMass: 40,
        proteinMass: 10,
        measuredAt: '2026-11-17T09:00:00+08:00',
      }),
      record({ weight: null }),
      record({ weight: 20, muscleMass: 30, proteinMass: 30 }),
      record({ excluded: true }),
    ]
    const daily = metricSeries(rows, 'musclePercentage', 'daily')
    expect(daily).toHaveLength(1)
    expect(daily[0]).toMatchObject({ value: 70, count: 2 })
    expect(metricSeries(rows, 'proteinPercentage', 'daily')[0]?.value).toBe(15)
    expect(metricSeries(rows, 'musclePercentage', 'raw')).toHaveLength(2)
    expect(metricSeries(rows, 'musclePercentage', 'rolling')[0]?.value).toBe(70)
    expect(metricSeries(rows, 'musclePercentage', 'smooth')[0]?.value).toBe(70)
  })
  it.each([70, 80, 87, 100])(
    'keeps mass and percentage on one muscle reference at %s kg',
    (weight) => {
      const row = record({ weight })
      const mass = assessMetric('muscleMass', row, [], syntheticReportProfile)
      const rate = assessMetric('musclePercentage', row, [], syntheticReportProfile)
      expect(mass).toMatchObject({
        source: 'xiaomiReport',
        grade: 'standard',
        reportDate: '2026-11-17',
      })
      expect(rate.grade).toBe(mass.grade)
      expect(rate.bands[0]?.upper).toBeCloseTo((49.4 / weight) * 100)
      expect(rate.bands[1]?.upper).toBeCloseTo((62.4 / weight) * 100)
      expect(rate.value).toBeCloseTo((61.5 / weight) * 100)
    },
  )
  it.each([
    [49.39, 'low'],
    [49.4, 'standard'],
    [62.4, 'standard'],
    [62.41, 'good'],
  ] as const)('grades %s kg consistently in both units', (muscleMass, grade) => {
    const row = record({ muscleMass })
    expect(assessMetric('muscleMass', row, [], syntheticReportProfile).grade).toBe(grade)
    expect(assessMetric('musclePercentage', row, [], syntheticReportProfile).grade).toBe(grade)
  })
  it('anchors protein mass to the report weight and converts the reference to current percentages', () => {
    const row = record({ weight: 80 })
    const mass = assessMetric('proteinMass', row, [], syntheticReportProfile)
    const rate = assessMetric('proteinPercentage', row, [], syntheticReportProfile)
    expect(mass.grade).toBe('standard')
    expect(rate.grade).toBe(mass.grade)
    expect(mass.bands[0]?.upper).toBeCloseTo(8.961)
    expect(mass.bands[1]?.upper).toBeCloseTo(15.399)
    expect(rate.bands[0]?.upper).toBeCloseTo(11.20125)
    expect(rate.bands[1]?.upper).toBeCloseTo(19.24875)
    expect(
      assessMetric('proteinPercentage', record({ proteinMass: 16 }), [], syntheticReportProfile)
        .grade,
    ).toBe('high')
  })
  it.each([
    [4, 'standard'],
    [5, 'high'],
    [9, 'high'],
    [10, 'veryHigh'],
    [14, 'veryHigh'],
    [15, 'dangerous'],
  ] as const)('uses the supplied visceral reference at level %s', (visceralFat, grade) => {
    expect(
      assessMetric('visceralFat', record({ visceralFat }), [], syntheticReportProfile).grade,
    ).toBe(grade)
  })
  it('shows the report BMR grade and retains a separately attributed formula prediction', () => {
    const result = assessMetric(
      'basalMetabolism',
      record({ basalMetabolism: 1774 }),
      [],
      syntheticReportProfile,
    )
    expect(result).toMatchObject({
      value: 1774,
      grade: 'standard',
      source: 'xiaomiReport',
      prediction: 1857.5,
    })
  })
  it('matches measurement-date age, sex and same-record height before using a report', () => {
    for (const [row, profile] of [
      [record({ height: 190 }), syntheticReportProfile],
      [record({ measuredAt: '2027-02-04T08:00:00+08:00' }), syntheticReportProfile],
      [record(), { ...syntheticReportProfile, sex: 'female' as const }],
    ] as const) {
      expect(assessMetric('muscleMass', row, [], profile).source).toBe('baseline')
      expect(assessMetric('musclePercentage', row, [], profile).source).toBe('baseline')
    }
  })
  it('keeps baseline grading consistent between mass and rate without a report', () => {
    const profile = healthReferenceProfileSchema
      .omit({ reportReference: true })
      .parse(syntheticReportProfile)
    const history = [14, 15, 16].map((day) =>
      record({ measuredAt: `2026-11-${day}T08:00:00+08:00`, muscleMass: 60, weight: 100 }),
    )
    const row = record({ muscleMass: 59, weight: 70 })
    expect(assessMetric('muscleMass', row, history, profile)).toMatchObject({
      grade: 'belowBaseline',
      reference: 60,
    })
    const percentageAssessment = assessMetric('musclePercentage', row, history, profile)
    expect(percentageAssessment.grade).toBe('belowBaseline')
    expect(percentageAssessment.reference).toBeCloseTo((60 / 70) * 100)
    expect(
      assessMetric('musclePercentage', record({ weight: null }), history, profile),
    ).toMatchObject({ value: null, grade: 'noData' })
  })
  it('validates optional report configuration and retained profiles without echoing input', () => {
    const oldSchema = healthReferenceProfileSchema.omit({ reportReference: true })
    const retained = oldSchema.parse(syntheticReportProfile)
    expect(retained).not.toHaveProperty('reportReference')
    expect(healthReferenceProfileJsonSchema.parse(JSON.stringify(syntheticReportProfile))).toEqual(
      syntheticReportProfile,
    )
    for (const change of [
      { muscleMass: [65, 50] },
      { proteinPercentage: [10, 101] },
      { weight: 40 },
      { visceralFat: [10, 5, 15] },
    ]) {
      const result = healthReferenceProfileJsonSchema.safeParse(
        JSON.stringify({
          ...syntheticReportProfile,
          reportReference: { ...syntheticReportProfile.reportReference, ...change },
        }),
      )
      expect(result.success).toBe(false)
      if (!result.success) expect(result.error.message).not.toContain('2000-02-04')
    }
  })
})
