import { z } from 'zod'
import { techFootprintPayloadSchema, weightLossPayloadSchema } from '../control-plane/contracts'

export { techFootprintPayloadSchema, weightLossPayloadSchema }
export type TechPayload = z.infer<typeof techFootprintPayloadSchema>
export type WeightPayload = z.infer<typeof weightLossPayloadSchema>
export type WeightRecord = WeightPayload['records'][number]
export type TechRecord = TechPayload['records'][string]
export type DatasetSnapshot<T> = { payload: T; revision: number }
export const sessionStatusSchema = z.object({
  authenticated: z.boolean(),
  enabled: z.boolean().optional(),
})
export const emptyTechPayload: TechPayload = { version: 2, records: {} }
export const emptyWeightPayload: WeightPayload = { version: 2, records: [] }

export function datasetResponseSchema<T>(payload: z.ZodType<T>) {
  return z.object({
    dataset: z.object({ payload, revision: z.number().int().nonnegative() }).nullable(),
  })
}

export function updateTechRecord(
  record: TechRecord | undefined,
  patch: Partial<Omit<TechRecord, 'updatedAt'>>,
): TechRecord {
  const next = {
    status: 'todo' as const,
    progress: 0,
    note: '',
    ...record,
    ...patch,
    updatedAt: new Date().toISOString(),
  }
  if (patch.progress !== undefined) {
    next.progress = Math.max(0, Math.min(100, Math.round(patch.progress)))
    next.status = next.progress === 0 ? 'todo' : next.progress === 100 ? 'done' : 'doing'
  } else if (patch.status) {
    next.progress =
      patch.status === 'done'
        ? 100
        : patch.status === 'todo'
          ? 0
          : Math.max(1, Math.min(99, next.progress))
  }
  return next
}
