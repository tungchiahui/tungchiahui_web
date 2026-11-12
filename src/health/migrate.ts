import { createHash } from 'node:crypto'
import type { Client, PoolClient } from 'pg'
import { z } from 'zod'
import { weightLossPayloadSchema } from '../personal/contracts'
import { createWeeklyRecords } from '../personal/weight-plan'
import { emptyMetrics, measurementInputSchema } from './contracts'

export function prepareLegacyHealth(input: unknown) {
  const payload = weightLossPayloadSchema.parse(input)
  const plans = new Map(
    createWeeklyRecords().map((row) => [
      row.date,
      { date: row.date, targetMin: row.targetMin, targetMax: row.targetMax },
    ]),
  )
  const measurements = payload.records.flatMap((row) => {
    plans.set(row.date, { date: row.date, targetMin: row.targetMin, targetMax: row.targetMax })
    if (
      ![row.weight, row.bodyFat, row.muscleMass, row.waist, row.note].some(
        (value) => value.trim() !== '',
      )
    )
      return []
    return [
      {
        ...measurementInputSchema.parse({
          ...emptyMetrics,
          measuredAt: `${row.date}T00:00:00+08:00`,
          timePrecision: 'date',
          weight: row.weight.trim() ? Number(row.weight) : null,
          bodyFat: row.bodyFat.trim() ? Number(row.bodyFat) : null,
          muscleMass: row.muscleMass.trim() ? Number(row.muscleMass) : null,
          waist: row.waist.trim() ? Number(row.waist) : null,
          note: row.note || null,
          excluded: false,
        }),
        sourceRecordKey: `legacy:${row.date}`,
      },
    ]
  })
  return {
    payload,
    measurements,
    plans: [...plans.values()],
    sha256: createHash('sha256').update(JSON.stringify(payload)).digest('hex'),
  }
}

export async function migrateLegacyHealth(
  client: Pick<Client | PoolClient, 'query'>,
  dryRun = false,
) {
  await client.query('BEGIN')
  try {
    await client.query("SELECT pg_advisory_xact_lock(hashtext('health-write'))")
    const previous = dryRun
      ? { rows: [] }
      : await client.query('SELECT migrated_count FROM health.legacy_snapshots LIMIT 1')
    if (previous.rows.length) {
      await client.query('ROLLBACK')
      return {
        alreadyMigrated: true,
        dryRun,
        measuredRows: z.number().parse(previous.rows[0]?.migrated_count),
      }
    }
    const old = await client.query(
      "SELECT payload, revision::text FROM app.owner_managed_datasets WHERE dataset_key = 'weight_loss' FOR UPDATE",
    )
    const prepared = prepareLegacyHealth(old.rows[0]?.payload ?? { version: 2, records: [] })
    const report = {
      alreadyMigrated: false,
      dryRun,
      sourceRows: prepared.payload.records.length,
      measuredRows: prepared.measurements.length,
      planRows: prepared.plans.length,
      skippedPlanRows: prepared.payload.records.length - prepared.measurements.length,
      sha256: prepared.sha256,
      mismatches: 0,
    }
    if (dryRun) {
      await client.query('ROLLBACK')
      return report
    }
    await client.query(
      'INSERT INTO health.legacy_snapshots (revision, payload, sha256, migrated_count) VALUES ($1, $2, $3, $4)',
      [
        old.rows[0]?.revision ?? '0',
        JSON.stringify(prepared.payload),
        prepared.sha256,
        prepared.measurements.length,
      ],
    )
    for (const row of prepared.measurements) {
      await client.query(
        `INSERT INTO app.body_measurements (measured_at, time_precision, source, source_record_key, weight, body_fat, muscle_mass, waist, note)
        VALUES ($1, 'date', 'manual_legacy', $2, $3, $4, $5, $6, $7) ON CONFLICT (source, source_record_key) DO NOTHING`,
        [
          row.measuredAt,
          row.sourceRecordKey,
          row.weight,
          row.bodyFat,
          row.muscleMass,
          row.waist,
          row.note,
        ],
      )
      const checked = await client.query(
        `SELECT measured_at = $1::timestamptz AND time_precision = 'date'
        AND weight IS NOT DISTINCT FROM $3::numeric AND body_fat IS NOT DISTINCT FROM $4::numeric
        AND muscle_mass IS NOT DISTINCT FROM $5::numeric AND waist IS NOT DISTINCT FROM $6::numeric
        AND note IS NOT DISTINCT FROM $7::text AND bmi IS NULL AND body_water IS NULL AND skeletal_muscle_mass IS NULL
        AND bone_mass IS NULL AND protein_mass IS NULL AND visceral_fat IS NULL AND heart_rate IS NULL
        AND basal_metabolism IS NULL AND metabolic_age IS NULL AND physique_rating IS NULL AND body_score IS NULL AND height IS NULL AS matches
        FROM app.body_measurements WHERE source = 'manual_legacy' AND source_record_key = $2`,
        [
          row.measuredAt,
          row.sourceRecordKey,
          row.weight,
          row.bodyFat,
          row.muscleMass,
          row.waist,
          row.note,
        ],
      )
      if (checked.rows[0]?.matches !== true)
        throw new Error('health_migration_reconciliation_failed')
    }
    for (const row of prepared.plans) {
      await client.query(
        'INSERT INTO health.plan_overrides (date, target_min, target_max) VALUES ($1,$2,$3)',
        [row.date, row.targetMin, row.targetMax],
      )
    }
    const count = await client.query(
      "SELECT count(*)::int AS count FROM app.body_measurements WHERE source = 'manual_legacy'",
    )
    if (count.rows[0]?.count !== prepared.measurements.length)
      throw new Error('health_migration_count_mismatch')
    const planCheck = await client.query('SELECT count(*)::int AS count FROM health.plan_overrides')
    if (planCheck.rows[0]?.count !== prepared.plans.length)
      throw new Error('health_plan_count_mismatch')
    await client.query("UPDATE health.state SET revision = revision + 1 WHERE id = 'owner'")
    await client.query('COMMIT')
    return report
  } catch (error: unknown) {
    await client.query('ROLLBACK')
    throw error
  }
}
