import { z } from 'zod'

export const healthTimeZone = 'Asia/Shanghai'
export const metricDefinitions = [
  { key: 'weight', unit: 'kg', min: 1, max: 500 },
  { key: 'bmi', unit: 'index', min: 1, max: 150 },
  { key: 'bodyFat', unit: 'percent', min: 0, max: 100 },
  { key: 'bodyWater', unit: 'percent', min: 0, max: 100 },
  { key: 'muscleMass', unit: 'kg', min: 0, max: 400 },
  { key: 'skeletalMuscleMass', unit: 'kg', min: 0, max: 400 },
  { key: 'boneMass', unit: 'kg', min: 0, max: 50 },
  { key: 'proteinMass', unit: 'kg', min: 0, max: 200 },
  { key: 'visceralFat', unit: 'level', min: 0, max: 100 },
  { key: 'heartRate', unit: 'bpm', min: 1, max: 300 },
  { key: 'basalMetabolism', unit: 'kcal', min: 1, max: 10000 },
  { key: 'metabolicAge', unit: 'years', min: 1, max: 150 },
  { key: 'physiqueRating', unit: 'rating', min: 0, max: 100 },
  { key: 'bodyScore', unit: 'points', min: 0, max: 100 },
  { key: 'height', unit: 'cm', min: 20, max: 300 },
  { key: 'waist', unit: 'cm', min: 10, max: 400 },
] as const
export type MetricKey = (typeof metricDefinitions)[number]['key']
const nullableMetric = (min: number, max: number) =>
  z.number().finite().min(min).max(max).nullable()
export const metricsSchema = z.object({
  weight: nullableMetric(1, 500),
  bmi: nullableMetric(1, 150),
  bodyFat: nullableMetric(0, 100),
  bodyWater: nullableMetric(0, 100),
  muscleMass: nullableMetric(0, 400),
  skeletalMuscleMass: nullableMetric(0, 400),
  boneMass: nullableMetric(0, 50),
  proteinMass: nullableMetric(0, 200),
  visceralFat: nullableMetric(0, 100),
  heartRate: nullableMetric(1, 300),
  basalMetabolism: nullableMetric(1, 10000),
  metabolicAge: nullableMetric(1, 150),
  physiqueRating: nullableMetric(0, 100),
  bodyScore: nullableMetric(0, 100),
  height: nullableMetric(20, 300),
  waist: nullableMetric(10, 400),
})
export const emptyMetrics = metricsSchema.parse(
  Object.fromEntries(metricDefinitions.map(({ key }) => [key, null])),
)
export const measurementInputSchema = metricsSchema
  .extend({
    measuredAt: z.iso
      .datetime({ offset: true })
      .transform((value) => new Date(value).toISOString()),
    timePrecision: z.enum(['date', 'datetime']),
    note: z.string().max(10000).nullable(),
    excluded: z.boolean(),
  })
  .strict()
  .superRefine((record, ctx) => {
    if (record.timePrecision === 'date' && !/T16:00:00\.000Z$/.test(record.measuredAt))
      ctx.addIssue({
        code: 'custom',
        message: 'date precision requires Asia/Shanghai midnight',
        path: ['measuredAt'],
      })
    if (!record.note?.trim() && !metricDefinitions.some(({ key }) => record[key] !== null))
      ctx.addIssue({ code: 'custom', message: 'measurement or note required' })
  })
export const measurementSchema = measurementInputSchema
  .safeExtend({
    id: z.uuid(),
    source: z.enum(['manual_legacy', 'manual', 'smartscale']),
    sourceRecordKey: z.string().min(1).max(500).nullable(),
    rawPayload: z.record(z.string(), z.json()).nullable(),
    revision: z.number().int().nonnegative(),
    createdAt: z.iso.datetime({ offset: true }),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .superRefine((record, ctx) => {
    if ((record.source === 'manual') !== (record.sourceRecordKey === null))
      ctx.addIssue({
        code: 'custom',
        message: 'source identity inconsistent',
        path: ['sourceRecordKey'],
      })
  })
export const planOverrideSchema = z
  .object({
    date: z.iso.date(),
    targetMin: z.number().min(35).max(250),
    targetMax: z.number().min(35).max(250),
  })
  .strict()
  .refine((row) => row.targetMin <= row.targetMax)
export const healthSnapshotSchema = z.object({
  measurements: z.array(measurementSchema),
  planOverrides: z.array(planOverrideSchema),
  revision: z.number().int().nonnegative(),
  sync: z.object({
    lastSuccessAt: z.iso.datetime().nullable(),
    sourceUpdatedAt: z.iso.datetime().nullable(),
    lastError: z.string().nullable(),
  }),
})
export const healthExchangeSchema = z
  .object({
    format: z.literal('tungchiahui-health'),
    schemaVersion: z.literal(1),
    exportedAt: z.iso.datetime({ offset: true }),
    timeZone: z.literal('Asia/Shanghai'),
    measurements: z.array(measurementSchema).max(50000),
    planOverrides: z.array(planOverrideSchema).max(10000),
  })
  .strict()
  .superRefine((data, ctx) => {
    const sourced = data.measurements.filter((row) => row.sourceRecordKey !== null)
    if (
      new Set(sourced.map((row) => `${row.source}:${row.sourceRecordKey}`)).size !==
        sourced.length ||
      new Set(data.measurements.map((row) => row.id)).size !== data.measurements.length ||
      new Set(data.planOverrides.map((row) => row.date)).size !== data.planOverrides.length
    )
      ctx.addIssue({ code: 'custom', message: 'duplicate identities in exchange file' })
  })
export type Measurement = z.infer<typeof measurementSchema>
export type MeasurementInput = z.infer<typeof measurementInputSchema>
export type HealthSnapshot = z.infer<typeof healthSnapshotSchema>
export type HealthExchange = z.infer<typeof healthExchangeSchema>
export const healthImportPreviewSchema = z.object({
  revision: z.number().int().nonnegative(),
  added: z.number().int(),
  updated: z.number().int(),
  unchanged: z.number().int(),
  conflicts: z.number().int(),
  planChanges: z.number().int(),
})
export function measurementDay(timestamp: string) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: healthTimeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date(timestamp))
}
