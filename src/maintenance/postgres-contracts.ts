import { z } from 'zod'

const digest = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const identity = {
  action: z.literal('postgres-image-upgrade'),
  environment: z.literal('production'),
  oldDigest: digest,
  newDigest: digest,
  candidateSha: z.string().regex(/^[a-f0-9]{40}$/),
  backupId: z.string().regex(/^[a-zA-Z0-9_-]{1,200}$/),
}

export const postgresMaintenanceTargetSchema = z
  .discriminatedUnion('mode', [
    z.object({ ...identity, mode: z.literal('preflight') }).strict(),
    z
      .object({
        ...identity,
        mode: z.literal('execute'),
        confirmation: z.literal('POSTGRES-IMAGE-UPGRADE-PRODUCTION'),
        preflightOperationId: z.uuid(),
        restoreEvidenceSha256: z.string().regex(/^[a-f0-9]{64}$/),
      })
      .strict(),
  ])
  .refine((target) => target.oldDigest !== target.newDigest, 'Old and new digests must differ')
export type PostgresMaintenanceTarget = z.infer<typeof postgresMaintenanceTargetSchema>

export const postgresMaintenancePhaseSchema = z.enum([
  'prepared',
  'quiescing',
  'drained',
  'stopped',
  'cold-copy-verified',
  'candidate-starting',
  'candidate-verified',
  'backup-verified',
  'resuming',
  'verified',
  'rolling-back',
  'rollback-verified',
  'recovery-required',
])
export const postgresMaintenanceProgressSchema = z
  .object({
    phase: postgresMaintenancePhaseSchema,
    baseline: z.record(z.string(), z.unknown()),
    database: z.record(z.string(), z.unknown()).optional(),
    coldCopySha256: z
      .string()
      .regex(/^[a-f0-9]{64}$/)
      .optional(),
    backupStartedAt: z.iso.datetime().optional(),
    postBackup: z.record(z.string(), z.unknown()).optional(),
    startedAt: z.iso.datetime(),
  })
  .strict()
export type PostgresMaintenanceProgress = z.infer<typeof postgresMaintenanceProgressSchema>

export const postgresMaintenanceRetrySchema = z
  .object({
    confirmation: z.literal('POSTGRES-MAINTENANCE-RETRY'),
    reason: z.string().trim().min(1).max(1000),
  })
  .strict()
