import { z } from 'zod'
import {
  type PostgresMaintenanceTarget,
  postgresMaintenanceRetrySchema,
  postgresMaintenanceTargetSchema,
} from '../../src/maintenance/postgres-contracts'

export type PostgresMaintenanceCommand = Readonly<{
  kind: 'postgres-image-maintenance'
  target: PostgresMaintenanceTarget
  reason: string
  idempotencyKey: string
}>

export function parsePostgresMaintenanceCommand(
  args: readonly string[],
): PostgresMaintenanceCommand | PostgresMaintenanceRetryCommand {
  const keys = new Map([
    ['--operation-id', 'operationId'],
    ['--old-digest', 'oldDigest'],
    ['--new-digest', 'newDigest'],
    ['--candidate-sha', 'candidateSha'],
    ['--backup-id', 'backupId'],
    ['--preflight-operation', 'preflightOperationId'],
    ['--restore-evidence-sha256', 'restoreEvidenceSha256'],
    ['--confirm', 'confirmation'],
    ['--reason', 'reason'],
    ['--idempotency-key', 'idempotencyKey'],
  ])
  const values: Record<string, string> = {}
  for (let i = 1; i < args.length; i += 2) {
    const argument = args[i],
      value = args[i + 1]
    const key = argument ? keys.get(argument) : undefined
    if (!key || value === undefined || key in values)
      throw new Error('Invalid PostgreSQL maintenance arguments')
    values[key] = value
  }
  const { reason, idempotencyKey, ...target } = values
  if (args[0] === 'retry') {
    const { operationId, ...request } = target
    const retry = postgresMaintenanceRetrySchema.parse({ ...request, reason })
    return {
      kind: 'postgres-image-maintenance-retry',
      operationId: z.uuid().parse(operationId),
      ...retry,
      idempotencyKey: z
        .string()
        .regex(/^[a-zA-Z0-9:_-]{16,200}$/)
        .parse(idempotencyKey),
    }
  }

  return {
    kind: 'postgres-image-maintenance',
    target: postgresMaintenanceTargetSchema.parse({
      ...target,
      action: 'postgres-image-upgrade',
      environment: 'production',
      mode: args[0],
    }),
    reason: z.string().trim().min(1).max(1000).parse(reason),
    idempotencyKey: z
      .string()
      .regex(/^[a-zA-Z0-9:_-]{16,200}$/)
      .parse(idempotencyKey),
  }
}

export type PostgresMaintenanceRetryCommand = Readonly<{
  kind: 'postgres-image-maintenance-retry'
  operationId: string
  reason: string
  confirmation: 'POSTGRES-MAINTENANCE-RETRY'
  idempotencyKey: string
}>
