import assert from 'node:assert/strict'
import { randomUUID } from 'node:crypto'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import type { IncomingMessage } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Readable } from 'node:stream'
import { sql } from 'drizzle-orm'
import { emptyMetrics, healthExchangeSchema } from '../../src/health/contracts'
import { createHealthHttpHandler } from '../../src/health/http'
import {
  HealthConflict,
  HealthRepository,
  HealthSourceProtected,
} from '../../src/health/repository'
import { parseSmartscale, readSmartscaleFile } from '../../src/health/smartscale'
import { HealthSyncWorker } from '../../src/health/worker'

export async function verifyUnifiedHealth(databaseUrl: string) {
  const owner = new HealthRepository(databaseUrl)
  const importer = new HealthRepository(databaseUrl, 'site_content_worker')
  const directory = await mkdtemp(join(tmpdir(), 'health-synthetic-'))
  const raw = {
    Date: '2026-10-29T08:30:00+08:00',
    Source: 'synthetic-test-device',
    User: 'synthetic-test-owner',
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
  const file = {
    rows: parseSmartscale([raw, { ...raw, Date: '2026-10-29T20:00:00+08:00' }]),
    sourceUpdatedAt: new Date(),
    sourceHash: 'a'.repeat(64),
  }
  const input = {
    ...emptyMetrics,
    measuredAt: '2026-10-29T00:00:00+08:00',
    timePrecision: 'date',
    weight: 100,
    note: 'synthetic manual',
    excluded: false,
  }
  try {
    let manual = await owner.save(null, input, 0)
    assert.equal(manual.bmi, null)
    assert.equal(manual.measuredAt, '2026-10-28T16:00:00.000Z')
    assert.equal((await importer.importSmartscale(file)).added, 2)
    const duplicate = await Promise.all([
      importer.importSmartscale(file),
      importer.importSmartscale(file),
    ])
    assert(duplicate.every((row) => row.added === 0 && row.updated === 0))
    const incremental = {
      ...file,
      sourceUpdatedAt: new Date(file.sourceUpdatedAt.getTime() + 1),
      rows: parseSmartscale([raw, { ...raw, Date: '2026-10-30T08:00:00+08:00' }]),
    }
    assert.equal((await importer.importSmartscale(incremental)).added, 1)
    let snapshot = await owner.snapshot()
    assert.equal(snapshot.measurements.length, 4)
    const auto = snapshot.measurements.find((row) => row.source === 'smartscale')
    assert(auto)
    await owner.annotate(auto.id, auto.revision, 'owner annotation', true)
    const sourceRaw = auto.rawPayload
    assert(sourceRaw)
    const correction = {
      ...file,
      sourceUpdatedAt: new Date(file.sourceUpdatedAt.getTime() + 2),
      rows: parseSmartscale([{ ...sourceRaw, Weight: 98.8 }]),
    }
    await importer.importSmartscale(correction)
    snapshot = await owner.snapshot()
    assert.equal(snapshot.measurements.find((row) => row.id === manual.id)?.weight, 100)
    const corrected = snapshot.measurements.find((row) => row.id === auto.id)
    assert.equal(corrected?.note, 'owner annotation')
    assert.equal(corrected?.excluded, true)
    assert.equal(corrected?.weight, 98.8)
    await assert.rejects(
      owner.save(auto.id, input, corrected?.revision ?? 0),
      HealthSourceProtected,
    )
    await assert.rejects(owner.remove(auto.id, corrected?.revision ?? 0), HealthSourceProtected)
    const normalized = parseSmartscale([raw])[0]
    assert(normalized)
    const { sourceRecordKey: _sourceKey, rawPayload: _raw, ...fullInput } = normalized
    manual = await owner.save(manual.id, fullInput, manual.revision)
    const edited = await owner.save(manual.id, { ...input, waist: 90 }, manual.revision)
    await assert.rejects(owner.save(manual.id, input, manual.revision), HealthConflict)
    assert.equal(edited.waist, 90)
    const full = await owner
      .save(
        null,
        { ...parseSmartscale([raw])[0], sourceRecordKey: undefined, rawPayload: undefined },
        0,
      )
      .catch(() => null)
    // The ordinary entry point rejects source-only fields instead of accepting them as manual data.
    assert.equal(full, null)
    const path = join(directory, 's400.json')
    await writeFile(path, JSON.stringify([raw]))
    assert.equal((await readSmartscaleFile(path)).rows.length, 1)
    await writeFile(path, '[')
    await assert.rejects(readSmartscaleFile(path))
    await writeFile(path, '')
    await assert.rejects(readSmartscaleFile(path))
    assert.equal((await owner.snapshot()).measurements.length, 4)
    const exchange = healthExchangeSchema.parse({
      format: 'tungchiahui-health',
      schemaVersion: 1,
      exportedAt: new Date().toISOString(),
      timeZone: 'Asia/Shanghai',
      measurements: snapshot.measurements.map((row) => (row.id === manual.id ? edited : row)),
      planOverrides: snapshot.planOverrides,
    })
    const preview = await owner.importExchange(exchange)
    assert.equal(preview.unchanged, 4)
    assert.equal(preview.conflicts, 0)
    await owner.importExchange(exchange, preview.revision)
    const fresh = {
      ...exchange,
      measurements: [
        {
          ...edited,
          id: randomUUID(),
          source: 'manual' as const,
          sourceRecordKey: null,
          revision: 0,
        },
      ],
    }
    const pending = await owner.importExchange(fresh)
    await owner.save(null, { ...input, weight: null, note: 'note only' }, 0)
    await assert.rejects(owner.importExchange(fresh, pending.revision), HealthConflict)
    const next = await owner.importExchange(fresh)
    await owner.importExchange(fresh, next.revision)
    assert.equal((await owner.importExchange(fresh)).unchanged, 1)
    const currentManual = (await owner.snapshot()).measurements.find((row) => row.id === manual.id)
    assert(currentManual)
    await owner.remove(manual.id, currentManual.revision)
    assert(!(await owner.snapshot()).measurements.some((row) => row.id === manual.id))
    const request = (method: string, path = '/api/ops/health/snapshot', payload?: unknown) =>
      Object.assign(
        Readable.from(payload === undefined ? [] : [Buffer.from(JSON.stringify(payload))]),
        { method, url: path },
      ) as IncomingMessage
    for (const role of [undefined, 'user', 'owner'] as const) {
      const handler = createHealthHttpHandler(
        { mode: 'test' },
        {
          current: async () =>
            role ? { id: 'synthetic', username: 'synthetic', role } : undefined,
        },
        owner,
      )
      const response = await handler(
        request('GET'),
        new Headers({ cookie: `site_session=${'a'.repeat(64)}` }),
      )
      assert.equal(response.status, role === 'owner' ? 200 : role === 'user' ? 403 : 401)
      assert.equal(response.headers['cache-control'], 'private, no-store')
      if (role === 'owner')
        assert.equal(
          (
            await handler(
              request('POST', '/api/ops/health/measurements', input),
              new Headers({
                cookie: `site_session=${'a'.repeat(64)}`,
                origin: 'https://attacker.invalid',
                'content-type': 'application/json',
              }),
            )
          ).status,
          403,
        )
    }
    for (const statement of [
      'SELECT * FROM app.body_measurements',
      'SELECT * FROM health.legacy_snapshots',
      'SELECT * FROM app.weight_loss_private_compat',
    ]) {
      await assert.rejects(
        owner.client.database.transaction(async (tx) => {
          await tx.execute(sql`SET LOCAL ROLE site_app`)
          await tx.execute(sql.raw(statement))
        }),
      )
    }
    await owner.client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_app`)
      const result = await tx.execute(
        sql`SELECT * FROM app.owner_managed_datasets WHERE dataset_key = 'weight_loss'`,
      )
      assert.equal(result.rows.length, 0)
    })
    await assert.rejects(
      importer.transaction(async (tx) => {
        await tx.execute(
          sql`UPDATE app.body_measurements SET note = 'unauthorized' WHERE id = ${auto.id}`,
        )
      }),
    )
    await assert.rejects(
      owner.client.pool.query(
        "UPDATE app.owner_managed_datasets SET payload = '{}' WHERE dataset_key = 'weight_loss'",
      ),
    )
    const worker = new HealthSyncWorker(databaseUrl, path)
    try {
      const result = await worker.runOnce()
      assert.equal(result.claimed, true)
      assert.equal(result.status, 'retry_or_failed')
    } finally {
      await worker.close()
    }
    console.log(
      'Unified health migration/runtime/privacy/import contract: PASS (synthetic data only)',
    )
  } finally {
    await Promise.all([owner.close(), importer.close()])
    await rm(directory, { recursive: true, force: true })
  }
}
