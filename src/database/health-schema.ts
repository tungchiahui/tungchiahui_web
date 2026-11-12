import { sql } from 'drizzle-orm'
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  jsonb,
  numeric,
  pgSchema,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core'
import type { JsonValue } from '../domain/persistence'
import { metricDefinitions } from '../health/contracts'
import { applicationSchema } from './schema-core'

export const healthSchema = pgSchema('health')
export const measurementPrecision = applicationSchema.enum('measurement_time_precision', [
  'date',
  'datetime',
])
export const measurementSource = applicationSchema.enum('measurement_source', [
  'manual_legacy',
  'manual',
  'smartscale',
])
const metric = (name: string) => numeric(name, { mode: 'number' })
export const bodyMeasurements = applicationSchema.table(
  'body_measurements',
  {
    id: uuid().primaryKey().defaultRandom(),
    measuredAt: timestamp('measured_at', { withTimezone: true }).notNull(),
    timePrecision: measurementPrecision('time_precision').notNull(),
    source: measurementSource().notNull(),
    sourceRecordKey: text('source_record_key'),
    weight: metric('weight'),
    bmi: metric('bmi'),
    bodyFat: metric('body_fat'),
    bodyWater: metric('body_water'),
    muscleMass: metric('muscle_mass'),
    skeletalMuscleMass: metric('skeletal_muscle_mass'),
    boneMass: metric('bone_mass'),
    proteinMass: metric('protein_mass'),
    visceralFat: metric('visceral_fat'),
    heartRate: metric('heart_rate'),
    basalMetabolism: metric('basal_metabolism'),
    metabolicAge: metric('metabolic_age'),
    physiqueRating: metric('physique_rating'),
    bodyScore: metric('body_score'),
    height: metric('height'),
    waist: metric('waist'),
    note: text(),
    excluded: boolean().notNull().default(false),
    rawPayload: jsonb('raw_payload').$type<Record<string, JsonValue>>(),
    revision: integer().notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    ...metricDefinitions.map(({ key, min, max }) =>
      check(
        `body_measurements_${key}_range`,
        sql`${table[key]} IS NULL OR ${table[key]} BETWEEN ${sql.raw(String(min))} AND ${sql.raw(String(max))}`,
      ),
    ),
    uniqueIndex('body_measurements_source_key_unique').on(table.source, table.sourceRecordKey),
    index('body_measurements_time_idx').on(table.measuredAt, table.id),
    check(
      'body_measurements_source_identity',
      sql`(${table.source} = 'manual' AND ${table.sourceRecordKey} IS NULL) OR (${table.source} <> 'manual' AND ${table.sourceRecordKey} IS NOT NULL AND length(${table.sourceRecordKey}) > 0)`,
    ),
    check('body_measurements_revision_nonnegative', sql`${table.revision} >= 0`),
    check(
      'body_measurements_date_precision',
      sql`${table.timePrecision} <> 'date' OR (${table.measuredAt} AT TIME ZONE 'Asia/Shanghai')::time = time '00:00:00'`,
    ),
    check(
      'body_measurements_payload_object',
      sql`${table.rawPayload} IS NULL OR jsonb_typeof(${table.rawPayload}) = 'object'`,
    ),
    check(
      'body_measurements_has_content',
      sql`num_nonnulls(${table.weight}, ${table.bmi}, ${table.bodyFat}, ${table.bodyWater}, ${table.muscleMass}, ${table.skeletalMuscleMass}, ${table.boneMass}, ${table.proteinMass}, ${table.visceralFat}, ${table.heartRate}, ${table.basalMetabolism}, ${table.metabolicAge}, ${table.physiqueRating}, ${table.bodyScore}, ${table.height}, ${table.waist}) > 0 OR COALESCE(length(trim(${table.note})), 0) > 0`,
    ),
  ],
)
export const healthPlanOverrides = healthSchema.table(
  'plan_overrides',
  {
    date: date().primaryKey(),
    targetMin: metric('target_min').notNull(),
    targetMax: metric('target_max').notNull(),
  },
  (table) => [check('health_plan_range', sql`${table.targetMin} <= ${table.targetMax}`)],
)
export const healthLegacySnapshots = healthSchema.table('legacy_snapshots', {
  revision: bigint({ mode: 'number' }).primaryKey(),
  payload: jsonb().$type<Record<string, JsonValue>>().notNull(),
  sha256: text().notNull(),
  migratedCount: integer('migrated_count').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
})
export const healthState = healthSchema.table('state', {
  id: text().primaryKey(),
  revision: integer().notNull().default(0),
  lastSuccessAt: timestamp('last_success_at', { withTimezone: true }),
  sourceUpdatedAt: timestamp('source_updated_at', { withTimezone: true }),
  sourceHash: text('source_hash'),
  lastError: text('last_error'),
})
