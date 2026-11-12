import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { Client } from 'pg'
import { migrateLegacyHealth } from '../../src/health/migrate'

export async function verifyLegacyHealth(databaseUrl: string, repositoryRoot: string) {
  const client = new Client({ connectionString: databaseUrl })
  await client.connect()
  const record = {
    date: '2026-10-29',
    targetMin: 80,
    targetMax: 81,
    weight: '99.1',
    bodyFat: '25.2',
    muscleMass: '50.3',
    waist: '90.4',
    note: '  synthetic legacy note  ',
  }
  const payload = {
    version: 2,
    records: [
      record,
      {
        ...record,
        date: '2026-11-05',
        targetMin: 70,
        targetMax: 71,
        weight: '',
        bodyFat: '',
        muscleMass: '',
        waist: '',
        note: '',
      },
    ],
  }
  try {
    await client.query(
      "UPDATE app.owner_managed_datasets SET payload = $1, revision = 7 WHERE dataset_key = 'weight_loss'",
      [JSON.stringify(payload)],
    )
    const beforeSchema = await migrateLegacyHealth(client, true)
    assert.equal(beforeSchema.measuredRows, 1)
    await client.query('SET ROLE site_migrator')
    await client.query(
      readFileSync(resolve(repositoryRoot, 'drizzle/0014_private_body_measurements.sql'), 'utf8'),
    )
    assert.equal((await migrateLegacyHealth(client, true)).measuredRows, 1)
    assert.equal(
      (await client.query('SELECT count(*)::int AS count FROM app.body_measurements')).rows[0]
        ?.count,
      0,
    )
    await client.query(
      "UPDATE app.owner_managed_datasets SET payload = '{}' WHERE dataset_key = 'weight_loss'",
    )
    await assert.rejects(migrateLegacyHealth(client))
    assert.equal(
      (await client.query('SELECT count(*)::int AS count FROM health.legacy_snapshots')).rows[0]
        ?.count,
      0,
    )
    await client.query(
      "UPDATE app.owner_managed_datasets SET payload = $1 WHERE dataset_key = 'weight_loss'",
      [JSON.stringify(payload)],
    )
    const report = await migrateLegacyHealth(client)
    assert.equal(report.measuredRows, 1)
    const actual = (
      await client.query('SELECT *, measured_at::text AS timestamp FROM app.body_measurements')
    ).rows[0]
    assert(actual)
    assert.equal(new Date(actual.measured_at).toISOString(), '2026-10-28T16:00:00.000Z')
    assert.equal(actual.time_precision, 'date')
    assert.equal(actual.source, 'manual_legacy')
    assert.equal(actual.weight, '99.1')
    assert.equal(actual.body_fat, '25.2')
    assert.equal(actual.muscle_mass, '50.3')
    assert.equal(actual.waist, '90.4')
    assert.equal(actual.note, record.note)
    for (const key of ['bmi', 'body_water', 'skeletal_muscle_mass', 'bone_mass', 'heart_rate'])
      assert.equal(actual[key], null)
    assert.equal(
      (await client.query("SELECT target_min FROM health.plan_overrides WHERE date = '2026-11-05'"))
        .rows[0]?.target_min,
      '70',
    )
    assert.deepEqual(
      (await client.query('SELECT payload FROM health.legacy_snapshots')).rows[0]?.payload,
      payload,
    )
    assert.deepEqual(
      (
        await client.query(
          "SELECT payload FROM app.owner_managed_datasets WHERE dataset_key = 'weight_loss'",
        )
      ).rows[0]?.payload,
      payload,
    )
    await client.query("UPDATE app.body_measurements SET note = 'owner edit' WHERE id = $1", [
      actual.id,
    ])
    assert.equal((await migrateLegacyHealth(client)).alreadyMigrated, true)
    assert.equal(
      (await client.query('SELECT note FROM app.body_measurements')).rows[0]?.note,
      'owner edit',
    )
    await client.query('DELETE FROM app.body_measurements WHERE id = $1', [actual.id])
    await migrateLegacyHealth(client)
    assert.equal(
      (await client.query('SELECT count(*)::int AS count FROM app.body_measurements')).rows[0]
        ?.count,
      0,
    )
    console.log('Legacy health backfill/dry-run/failure rollback/field reconciliation: PASS')
  } finally {
    await client.end()
  }
}
