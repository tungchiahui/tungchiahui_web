import { createHash } from 'node:crypto'
import { constants } from 'node:fs'
import { open } from 'node:fs/promises'
import { isDeepStrictEqual } from 'node:util'
import { z } from 'zod'
import { emptyMetrics, type MetricKey, measurementInputSchema } from './contracts'

const fields = {
  Weight: 'weight',
  BMI: 'bmi',
  BodyFat: 'bodyFat',
  BodyWater: 'bodyWater',
  MuscleMass: 'muscleMass',
  SkeletalMuscleMass: 'skeletalMuscleMass',
  BoneMass: 'boneMass',
  ProteinMass: 'proteinMass',
  VisceralFat: 'visceralFat',
  HeartRate: 'heartRate',
  BasalMetabolism: 'basalMetabolism',
  MetabolicAge: 'metabolicAge',
  PhysiqueRating: 'physiqueRating',
  BodyScore: 'bodyScore',
  Height: 'height',
} as const satisfies Record<string, MetricKey>
const optionalNumber = z.number().finite().nullable().optional()
export const smartscaleRowSchema = z
  .object({
    Date: z.iso.datetime({ offset: true }),
    Source: z.string().max(300).optional(),
    User: z.string().max(300).optional(),
    Weight: optionalNumber,
    BMI: optionalNumber,
    BodyFat: optionalNumber,
    BodyWater: optionalNumber,
    MuscleMass: optionalNumber,
    SkeletalMuscleMass: optionalNumber,
    BoneMass: optionalNumber,
    ProteinMass: optionalNumber,
    VisceralFat: optionalNumber,
    HeartRate: optionalNumber,
    BasalMetabolism: optionalNumber,
    MetabolicAge: optionalNumber,
    PhysiqueRating: optionalNumber,
    BodyScore: optionalNumber,
    Height: optionalNumber,
  })
  .catchall(z.json())
export function normalizeSmartscaleRow(input: unknown) {
  const raw = smartscaleRowSchema.parse(input)
  // Export v0.4.2 uses optional zero values as absent measurements.
  const metrics = { ...emptyMetrics }
  for (const [external, internal] of Object.entries(fields)) {
    const value = raw[external]
    if (typeof value === 'number' && value !== 0) metrics[internal] = value
  }
  const measurement = measurementInputSchema.parse({
    ...metrics,
    measuredAt: raw.Date,
    timePrecision: 'datetime',
    note: null,
    excluded: false,
  })
  // This namespace is intentionally stable across file moves and user display-name changes.
  // A missing device/user stays an explicit empty component. Ambiguous collisions fail the batch.
  const identity = JSON.stringify(['s400-owner-v1', raw.Source ?? '', measurement.measuredAt])
  const sourceRecordKey = `s400:${createHash('sha256').update(identity).digest('hex')}`
  return { ...measurement, sourceRecordKey, rawPayload: z.record(z.string(), z.json()).parse(raw) }
}
export function parseSmartscale(input: unknown, user?: string) {
  const rawRows = z.array(smartscaleRowSchema).max(100000).parse(input)
  const users = new Set(rawRows.map((row) => row.User ?? ''))
  if (!user && users.size > 1) throw new Error('health_user_selection_required')
  const rows = new Map<string, ReturnType<typeof normalizeSmartscaleRow>>()
  for (const raw of rawRows) {
    if (user !== undefined && (raw.User ?? '') !== user) continue
    const row = normalizeSmartscaleRow(raw)
    const old = rows.get(row.sourceRecordKey)
    if (old && !isDeepStrictEqual(old, row)) throw new Error('health_ambiguous_source_identity')
    rows.set(row.sourceRecordKey, row)
  }
  if (rawRows.length && user !== undefined && !rows.size)
    throw new Error('health_selected_user_missing')
  return [...rows.values()]
}
export async function readSmartscaleFile(path: string, user?: string) {
  // Hold the descriptor, then verify both its metadata and contents stayed stable.
  const file = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW)
  try {
    const before = await file.stat()
    if (!before.isFile() || before.size === 0 || before.size > 32 * 1024 * 1024)
      throw new Error('health_file_unavailable')
    const first = await file.readFile('utf8')
    await new Promise<void>((resolve) => setTimeout(resolve, 150))
    const secondBuffer = Buffer.alloc(before.size)
    const read = await file.read(secondBuffer, 0, before.size, 0)
    const after = await file.stat()
    if (
      before.mtimeMs !== after.mtimeMs ||
      before.size !== after.size ||
      read.bytesRead !== before.size ||
      first !== secondBuffer.toString('utf8')
    )
      throw new Error('health_file_changing')
    const rows = parseSmartscale(JSON.parse(first) as unknown, user)
    return {
      rows,
      sourceUpdatedAt: new Date(after.mtimeMs),
      sourceHash: createHash('sha256').update(first).digest('hex'),
    }
  } finally {
    await file.close()
  }
}
