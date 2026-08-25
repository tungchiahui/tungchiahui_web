import { z } from 'zod'

import { infrastructureOperationRequestSchema } from '../control-plane/contracts'
import {
  appendControlAuditEvent,
  createInfrastructureOperation,
  initializeControlState,
} from '../control-plane/control-state'

export const breakGlassRestorePayloadSchema = z
  .object({
    actorId: z.string().startsWith('break-glass:').max(200),
    idempotencyKey: z
      .string()
      .min(8)
      .max(200)
      .regex(/^[A-Za-z0-9._:-]+$/),
    inventoryHost: z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/),
    request: z
      .object({
        confirmation: z.literal('RESTORE-PRODUCTION'),
        environment: z.literal('production'),
        reason: z.string().trim().min(1).max(1_000),
        selector: z.union([
          z.object({ backupId: z.string().min(1).max(200) }).strict(),
          z.object({ targetTime: z.iso.datetime({ offset: true }) }).strict(),
        ]),
      })
      .strict(),
  })
  .strict()

export function authorizeBreakGlassRestore(
  statePath: string,
  input: z.input<typeof breakGlassRestorePayloadSchema>,
  now = new Date(),
) {
  const payload = breakGlassRestorePayloadSchema.parse(input)
  initializeControlState(statePath, 'production')
  const actor = Object.freeze({
    capabilities: ['infrastructure-operation:create' as const],
    id: payload.actorId,
    kind: 'operator' as const,
  })
  const request = infrastructureOperationRequestSchema.parse({
    operationType: 'restore',
    reason: payload.request.reason,
    target: {
      confirmation: payload.request.confirmation,
      environment: payload.request.environment,
      selector: payload.request.selector,
    },
  })
  appendControlAuditEvent(statePath, {
    actorId: actor.id,
    createdAt: now.toISOString(),
    details: {
      inventoryHost: payload.inventoryHost,
      reason: payload.request.reason,
      target: payload.request.selector,
    },
    eventType: 'break_glass_restore_authorized',
    operationId: null,
    outcome: 'accepted',
  })
  return createInfrastructureOperation(statePath, request, actor, payload.idempotencyKey, now)
}
