import { randomUUID } from 'node:crypto'
import { isDeepStrictEqual } from 'node:util'
import { and, desc, eq, sql } from 'drizzle-orm'
import { createDatabaseClient } from '../database/client'
import { bodyMeasurements, healthPlanOverrides, healthState } from '../database/health-schema'
import {
  type HealthExchange,
  healthExchangeSchema,
  healthSnapshotSchema,
  type Measurement,
  measurementInputSchema,
  measurementSchema,
  metricDefinitions,
} from './contracts'
import { normalizeSmartscaleRow, type readSmartscaleFile } from './smartscale'

export class HealthConflict extends Error {}
export class HealthSourceProtected extends Error {}
type Transaction = Parameters<
  Parameters<ReturnType<typeof createDatabaseClient>['database']['transaction']>[0]
>[0]
function present(row: typeof bodyMeasurements.$inferSelect) {
  return measurementSchema.parse({
    ...row,
    measuredAt: row.measuredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  })
}
function sameMeasurement(left: Measurement, right: Measurement) {
  return (
    left.measuredAt === right.measuredAt &&
    left.timePrecision === right.timePrecision &&
    left.note === right.note &&
    left.excluded === right.excluded &&
    metricDefinitions.every(({ key }) => left[key] === right[key])
  )
}
function rowValues(row: Measurement) {
  return {
    ...row,
    measuredAt: new Date(row.measuredAt),
    createdAt: new Date(row.createdAt),
    updatedAt: new Date(row.updatedAt),
  }
}

export class HealthRepository {
  readonly client: ReturnType<typeof createDatabaseClient>
  constructor(
    connectionString: string,
    readonly role: 'site_control_api' | 'site_content_worker' = 'site_control_api',
  ) {
    this.client = createDatabaseClient({
      connectionString,
      applicationName: 'health-repository',
      maxConnections: 2,
      queryTimeoutMilliseconds: 60000,
    })
  }
  close() {
    return this.client.close()
  }
  async transaction<T>(work: (tx: Transaction) => Promise<T>) {
    return this.client.database.transaction(async (tx) => {
      await tx.execute(sql.raw(`SET LOCAL ROLE ${this.role}`))
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('health-write'))`)
      return work(tx)
    })
  }
  async snapshot() {
    return this.transaction(async (tx) => {
      const rows = await tx
        .select()
        .from(bodyMeasurements)
        .orderBy(desc(bodyMeasurements.measuredAt), desc(bodyMeasurements.id))
      const plans = await tx.select().from(healthPlanOverrides).orderBy(healthPlanOverrides.date)
      const state = (await tx.select().from(healthState).where(eq(healthState.id, 'owner')))[0]
      return healthSnapshotSchema.parse({
        measurements: rows.map(present),
        planOverrides: plans,
        revision: state?.revision ?? 0,
        sync: {
          lastSuccessAt: state?.lastSuccessAt?.toISOString() ?? null,
          sourceUpdatedAt: state?.sourceUpdatedAt?.toISOString() ?? null,
          lastError: state?.lastError ?? null,
        },
      })
    })
  }
  async save(
    id: string | null,
    input: unknown,
    expectedRevision: number,
    newId: string = randomUUID(),
  ) {
    const parsed = measurementInputSchema.parse(input)
    return this.transaction(async (tx) => {
      if (id === null) {
        const existing = (
          await tx.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, newId))
        )[0]
        if (existing) {
          const old = present(existing)
          if (
            old.source === 'manual' &&
            old.measuredAt === parsed.measuredAt &&
            old.timePrecision === parsed.timePrecision &&
            old.note === parsed.note &&
            old.excluded === parsed.excluded &&
            metricDefinitions.every(({ key }) => old[key] === parsed[key])
          )
            return old
          throw new HealthConflict()
        }
        const inserted = await tx
          .insert(bodyMeasurements)
          .values({
            ...parsed,
            id: newId,
            source: 'manual',
            sourceRecordKey: null,
            measuredAt: new Date(parsed.measuredAt),
          })
          .returning()
        await this.bump(tx)
        if (!inserted[0]) throw new Error('health_insert_failed')
        return present(inserted[0])
      }
      const current = (
        await tx.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, id))
      )[0]
      if (!current || current.revision !== expectedRevision) throw new HealthConflict()
      if (current.source === 'smartscale') throw new HealthSourceProtected()
      const updated = await tx
        .update(bodyMeasurements)
        .set({
          ...parsed,
          measuredAt: new Date(parsed.measuredAt),
          updatedAt: new Date(),
          revision: current.revision + 1,
        })
        .where(eq(bodyMeasurements.id, id))
        .returning()
      await this.bump(tx)
      if (!updated[0]) throw new Error('health_update_failed')
      return present(updated[0])
    })
  }
  async annotate(id: string, revision: number, note: string | null, excluded: boolean) {
    return this.transaction(async (tx) => {
      const updated = await tx
        .update(bodyMeasurements)
        .set({ note, excluded, revision: revision + 1, updatedAt: new Date() })
        .where(and(eq(bodyMeasurements.id, id), eq(bodyMeasurements.revision, revision)))
        .returning()
      if (!updated[0]) throw new HealthConflict()
      await this.bump(tx)
      return present(updated[0])
    })
  }
  async remove(id: string, revision: number) {
    return this.transaction(async (tx) => {
      const current = (
        await tx.select().from(bodyMeasurements).where(eq(bodyMeasurements.id, id))
      )[0]
      if (!current || current.revision !== revision) throw new HealthConflict()
      if (current.source === 'smartscale') throw new HealthSourceProtected()
      await tx.delete(bodyMeasurements).where(eq(bodyMeasurements.id, id))
      await this.bump(tx)
    })
  }
  async bump(tx: Transaction) {
    await tx
      .update(healthState)
      .set({ revision: sql`${healthState.revision} + 1` })
      .where(eq(healthState.id, 'owner'))
  }
  async importSmartscale(file: Awaited<ReturnType<typeof readSmartscaleFile>>) {
    return this.transaction(async (tx) => {
      const state = (await tx.select().from(healthState).where(eq(healthState.id, 'owner')))[0]
      if (state?.sourceUpdatedAt && file.sourceUpdatedAt < state.sourceUpdatedAt)
        return { added: 0, updated: 0, unchanged: file.rows.length, stale: true }
      let added = 0,
        updated = 0,
        unchanged = 0
      for (const row of file.rows) {
        const old = (
          await tx
            .select()
            .from(bodyMeasurements)
            .where(
              and(
                eq(bodyMeasurements.source, 'smartscale'),
                eq(bodyMeasurements.sourceRecordKey, row.sourceRecordKey),
              ),
            )
        )[0]
        if (old) {
          const sourceChanged =
            old.measuredAt.toISOString() !== row.measuredAt ||
            metricDefinitions.some(({ key }) => old[key] !== row[key]) ||
            !isDeepStrictEqual(old.rawPayload, row.rawPayload)
          if (!sourceChanged) {
            unchanged++
            continue
          }
          // Only source-owned columns are updated. Owner note/exclusion remain independent.
          const { note: _note, excluded: _excluded, sourceRecordKey: _key, ...source } = row
          await tx
            .update(bodyMeasurements)
            .set({
              ...source,
              measuredAt: new Date(row.measuredAt),
              revision: old.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(bodyMeasurements.id, old.id))
          updated++
        } else {
          await tx
            .insert(bodyMeasurements)
            .values({ ...row, source: 'smartscale', measuredAt: new Date(row.measuredAt) })
          added++
        }
      }
      await tx
        .update(healthState)
        .set({
          lastSuccessAt: new Date(),
          sourceUpdatedAt: file.sourceUpdatedAt,
          sourceHash: file.sourceHash,
          lastError: null,
          revision: sql`${healthState.revision} + ${added + updated > 0 ? 1 : 0}`,
        })
        .where(eq(healthState.id, 'owner'))
      return { added, updated, unchanged, stale: false }
    })
  }
  async recordSyncFailure() {
    await this.transaction(async (tx) => {
      await tx
        .update(healthState)
        .set({ lastError: 'health_sync_failed' })
        .where(eq(healthState.id, 'owner'))
    })
  }
  async importExchange(input: unknown, expectedRevision?: number) {
    const file = healthExchangeSchema.parse(input)
    return this.transaction(async (tx) => {
      const state = (await tx.select().from(healthState).where(eq(healthState.id, 'owner')))[0]
      const revision = state?.revision ?? 0
      if (expectedRevision !== undefined && expectedRevision !== revision)
        throw new HealthConflict()
      const current = (await tx.select().from(bodyMeasurements)).map(present)
      const existing = new Map(current.map((row) => [row.id, row]))
      const sourceKeys = new Map(
        current
          .filter((row) => row.sourceRecordKey)
          .map((row) => [`${row.source}:${row.sourceRecordKey}`, row.id]),
      )
      const changes: Measurement[] = []
      let added = 0,
        updated = 0,
        unchanged = 0,
        conflicts = 0
      for (const row of file.measurements) {
        const old = existing.get(row.id)
        if (
          (row.sourceRecordKey &&
            sourceKeys.has(`${row.source}:${row.sourceRecordKey}`) &&
            sourceKeys.get(`${row.source}:${row.sourceRecordKey}`) !== row.id) ||
          (old && (old.source !== row.source || old.sourceRecordKey !== row.sourceRecordKey))
        ) {
          conflicts++
          continue
        }
        if (old && sameMeasurement(old, row)) {
          unchanged++
          continue
        }
        if (
          old &&
          (old.revision !== row.revision ||
            (old.source === 'smartscale' &&
              (old.measuredAt !== row.measuredAt ||
                metricDefinitions.some(({ key }) => old[key] !== row[key]))))
        ) {
          conflicts++
          continue
        }
        if (!old && row.source === 'smartscale' && !this.validSourceRestore(row)) {
          conflicts++
          continue
        }
        changes.push(row)
        if (old) updated++
        else added++
      }
      const plans = await tx.select().from(healthPlanOverrides)
      const planChanges = file.planOverrides.filter(
        (row) =>
          !plans.some(
            (old) =>
              old.date === row.date &&
              old.targetMin === row.targetMin &&
              old.targetMax === row.targetMax,
          ),
      )
      const preview = {
        revision,
        added,
        updated,
        unchanged,
        conflicts,
        planChanges: planChanges.length,
      }
      if (expectedRevision === undefined) return preview
      if (conflicts) throw new HealthConflict()
      for (const row of changes) {
        const old = existing.get(row.id)
        if (!old) await tx.insert(bodyMeasurements).values(rowValues(row))
        else if (old.source === 'smartscale')
          await tx
            .update(bodyMeasurements)
            .set({
              note: row.note,
              excluded: row.excluded,
              revision: old.revision + 1,
              updatedAt: new Date(),
            })
            .where(eq(bodyMeasurements.id, row.id))
        else {
          const {
            id: _id,
            source: _source,
            sourceRecordKey: _sourceKey,
            rawPayload: _raw,
            createdAt: _created,
            ...values
          } = rowValues(row)
          await tx
            .update(bodyMeasurements)
            .set({ ...values, revision: old.revision + 1, updatedAt: new Date() })
            .where(eq(bodyMeasurements.id, row.id))
        }
      }
      for (const row of planChanges)
        await tx
          .insert(healthPlanOverrides)
          .values(row)
          .onConflictDoUpdate({ target: healthPlanOverrides.date, set: row })
      if (changes.length || planChanges.length) await this.bump(tx)
      return preview
    })
  }
  validSourceRestore(row: HealthExchange['measurements'][number]) {
    try {
      const normalized = normalizeSmartscaleRow(row.rawPayload)
      return (
        normalized.sourceRecordKey === row.sourceRecordKey &&
        normalized.measuredAt === row.measuredAt &&
        row.timePrecision === 'datetime' &&
        metricDefinitions.every(({ key }) => normalized[key] === row[key])
      )
    } catch {
      return false
    }
  }
}
