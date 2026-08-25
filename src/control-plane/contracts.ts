import { z } from 'zod'

import { applicationJobRequestSchema, ownerDatasetKeySchema } from '../domain/persistence'
import { translationOperationRequestSchema } from '../translation/contracts'

export const capabilityValues = [
  'status:read',
  'application-job:create',
  'application-job:read',
  'infrastructure-operation:create',
  'infrastructure-operation:read',
  'owner-dataset:write',
  'translation:dry-run',
  'translation:execute',
  'translation:read',
  'translation:cancel',
] as const

export const actorKindValues = ['operator', 'github-actions', 'service'] as const
export const infrastructureOperationTypeValues = [
  'deploy',
  'rollback',
  'restore',
  'recovery',
  'server-migration',
] as const
export const infrastructureOperationStatusValues = [
  'queued',
  'claimed',
  'running',
  'needs-attention',
  'completed',
  'failed',
  'cancelled',
] as const

export const capabilitySchema = z.enum(capabilityValues)
export const actorKindSchema = z.enum(actorKindValues)
export const infrastructureOperationTypeSchema = z.enum(infrastructureOperationTypeValues)
export const infrastructureOperationStatusSchema = z.enum(infrastructureOperationStatusValues)

export const backupTypeSchema = z.enum(['full', 'diff', 'incr'])
export const recoveryEnvironmentSchema = z.enum(['local', 'test', 'production'])
export const restoreSelectorSchema = z.union([
  z.object({ backupId: z.string().min(1).max(200) }).strict(),
  z.object({ targetTime: z.iso.datetime({ offset: true }) }).strict(),
])

export type Capability = z.infer<typeof capabilitySchema>
export type ActorKind = z.infer<typeof actorKindSchema>
export type InfrastructureOperationType = z.infer<typeof infrastructureOperationTypeSchema>
export type InfrastructureOperationStatus = z.infer<typeof infrastructureOperationStatusSchema>

export const actorIdentitySchema = z
  .object({
    capabilities: z.array(capabilitySchema).min(1),
    id: z.string().min(1).max(200),
    kind: actorKindSchema,
  })
  .strict()

export type ActorIdentity = Readonly<z.infer<typeof actorIdentitySchema>>

const sha256Schema = z.string().regex(/^[a-f0-9]{64}$/)
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const environmentSchema = recoveryEnvironmentSchema
const boundedReasonSchema = z.string().trim().min(1).max(1_000)
const infrastructureTargetSchemas = {
  deploy: z
    .object({ gitSha: gitShaSchema, imageDigest: z.string().regex(/^sha256:[a-f0-9]{64}$/) })
    .strict(),
  recovery: z.union([
    z
      .object({
        action: z.literal('backup'),
        backupType: backupTypeSchema,
        environment: environmentSchema,
      })
      .strict(),
    z
      .object({
        action: z.literal('control-state-backup'),
        environment: environmentSchema,
      })
      .strict(),
    z
      .object({
        environment: environmentSchema,
        recoveryKind: z.enum(['control-state', 'database', 'host']),
      })
      .strict(),
  ]),
  restore: z
    .object({
      confirmation: z.string().min(1).max(100).optional(),
      environment: environmentSchema,
      selector: restoreSelectorSchema.optional(),
      // Backward-compatible with the Phase 4 recovery-state fixture.
      backupId: z.string().min(1).max(200).optional(),
    })
    .strict()
    .superRefine((target, context) => {
      if (target.selector === undefined && target.backupId === undefined) {
        context.addIssue({
          code: 'custom',
          message: 'restore requires a backup id or target time',
          path: ['selector'],
        })
      }
      if (target.selector !== undefined && target.backupId !== undefined) {
        context.addIssue({
          code: 'custom',
          message: 'restore selector must be unambiguous',
          path: ['selector'],
        })
      }
      if (target.environment === 'production' && target.confirmation !== 'RESTORE-PRODUCTION') {
        context.addIssue({
          code: 'custom',
          message: 'production restore requires RESTORE-PRODUCTION confirmation',
          path: ['confirmation'],
        })
      }
    }),
  rollback: z
    .object({
      targetDigest: z
        .string()
        .regex(/^sha256:[a-f0-9]{64}$/)
        .optional(),
      targetSha: gitShaSchema,
    })
    .strict(),
  'server-migration': z
    .object({ inventoryHost: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]{0,252}$/) })
    .strict(),
} as const

export const infrastructureOperationRequestSchema = z.discriminatedUnion('operationType', [
  z
    .object({
      operationType: z.literal('deploy'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.deploy,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('rollback'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.rollback,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('restore'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.restore,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('recovery'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas.recovery,
    })
    .strict(),
  z
    .object({
      operationType: z.literal('server-migration'),
      reason: boundedReasonSchema,
      target: infrastructureTargetSchemas['server-migration'],
    })
    .strict(),
])

const techFootprintRecordSchema = z
  .object({
    note: z.string().max(10_000),
    progress: z.number().int().min(0).max(100),
    status: z.enum(['todo', 'doing', 'done']),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict()
  .superRefine((record, context) => {
    if (
      (record.status === 'todo' && record.progress !== 0) ||
      (record.status === 'done' && record.progress !== 100) ||
      (record.status === 'doing' && (record.progress <= 0 || record.progress >= 100))
    ) {
      context.addIssue({
        code: 'custom',
        message: 'status and progress must describe the same state',
        path: ['progress'],
      })
    }
  })

export const techFootprintPayloadSchema = z
  .object({
    records: z.record(
      z.string().regex(/^[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*\/[a-z0-9][a-z0-9-]*$/),
      techFootprintRecordSchema,
    ),
    version: z.literal(2),
  })
  .strict()

const optionalMetricSchema = (minimum: number, maximum: number) =>
  z
    .string()
    .refine(
      (value) =>
        value === '' ||
        (Number.isFinite(Number(value)) && Number(value) >= minimum && Number(value) <= maximum),
      `must be empty or a number from ${minimum} through ${maximum}`,
    )

const weightRecordSchema = z
  .object({
    bodyFat: optionalMetricSchema(2, 70),
    date: z.iso.date(),
    muscleMass: optionalMetricSchema(10, 100),
    note: z.string().max(10_000),
    targetMax: z.number().min(35).max(250),
    targetMin: z.number().min(35).max(250),
    waist: optionalMetricSchema(40, 200),
    weight: optionalMetricSchema(35, 250),
  })
  .strict()
  .refine((record) => record.targetMin <= record.targetMax, {
    message: 'targetMin must not exceed targetMax',
    path: ['targetMin'],
  })

export const weightLossPayloadSchema = z
  .object({
    records: z.array(weightRecordSchema).max(256),
    version: z.literal(2),
  })
  .strict()
  .superRefine((payload, context) => {
    const dates = new Set<string>()
    for (const [index, record] of payload.records.entries()) {
      if (dates.has(record.date)) {
        context.addIssue({
          code: 'custom',
          message: 'record dates must be unique',
          path: ['records', index, 'date'],
        })
      }
      dates.add(record.date)
    }
  })

export const ownerDatasetUpdateSchema = z.discriminatedUnion('datasetKey', [
  z
    .object({
      datasetKey: z.literal('tech_footprint'),
      expectedRevision: z.number().int().nonnegative(),
      payload: techFootprintPayloadSchema,
    })
    .strict(),
  z
    .object({
      datasetKey: z.literal('weight_loss'),
      expectedRevision: z.number().int().nonnegative(),
      payload: weightLossPayloadSchema,
    })
    .strict(),
])

export const ownerDatasetPathSchema = ownerDatasetKeySchema
export const applicationJobCreateSchema = applicationJobRequestSchema
export const translationJobCreateSchema = translationOperationRequestSchema

export type InfrastructureOperationRequest = z.infer<typeof infrastructureOperationRequestSchema>
export type OwnerDatasetUpdate = z.infer<typeof ownerDatasetUpdateSchema>

export const serviceIdentityContracts = Object.freeze({
  'content-worker': Object.freeze({
    applicationJobTypes: Object.freeze([
      'content_sync',
      'translation',
      'search_reindex',
      'cache_revalidation',
    ]),
    controlStateWrite: false,
    dockerSocket: false,
    hostShell: false,
    openRestyAdmin: false,
  }),
  'control-api': Object.freeze({
    applicationJobControl: true,
    controlStateControl: true,
    dockerSocket: false,
    executesLongRunningWork: false,
    hostShell: false,
    openRestyAdmin: false,
  }),
  'deploy-agent': Object.freeze({
    applicationJobWrite: false,
    dockerCapability: 'declared-interface-only',
    paidAiCredential: false,
    recoveryCapability: 'declared-interface-only',
  }),
})

export function hashCanonicalPayload(value: unknown) {
  return sha256Schema.parse(value)
}
