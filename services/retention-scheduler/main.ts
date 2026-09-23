import { z } from 'zod'

import {
  actorIdentitySchema,
  infrastructureOperationRequestSchema,
} from '../../src/control-plane/contracts'
import {
  createInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
} from '../../src/control-plane/control-state'
import { retentionCleanupPlanSchema } from '../../src/maintenance/retention'

const configuration = z
  .object({
    CONTROL_STATE_PATH: z.string().startsWith('/control-state/'),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .parse(process.env)

const actor = actorIdentitySchema.parse({
  capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
  id: 'service:production-retention-scheduler',
  kind: 'service',
})

function localDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    day: '2-digit',
    month: '2-digit',
    timeZone: 'Asia/Hong_Kong',
    year: 'numeric',
  }).formatToParts(now)
  const value = (type: Intl.DateTimeFormatPartTypes) =>
    z
      .string()
      .min(1)
      .parse(parts.find((part) => part.type === type)?.value)
  return `${value('year')}-${value('month')}-${value('day')}`
}

async function waitForOperation(id: string) {
  const deadline = Date.now() + 3_600_000
  while (Date.now() < deadline) {
    const operation = getInfrastructureOperation(configuration.CONTROL_STATE_PATH, id)
    if (operation === null) throw new Error('Scheduled retention operation disappeared')
    if (operation.status === 'completed') return operation
    if (['failed', 'cancelled', 'needs-attention'].includes(operation.status)) {
      throw new Error(
        `Scheduled retention operation ended in ${operation.status}: ${operation.errorSummary ?? 'no error summary'}`,
      )
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
  throw new Error('Scheduled retention operation timed out')
}

async function main() {
  initializeControlState(configuration.CONTROL_STATE_PATH, 'production')
  const now = new Date()
  const date = localDate(now)
  const evaluatedAt = now.toISOString()
  const planRequest = infrastructureOperationRequestSchema.parse({
    operationType: 'recovery',
    reason: `Scheduled weekly production retention dry-run for ${date} Asia/Hong_Kong`,
    target: { action: 'retention-cleanup', environment: 'production', evaluatedAt, mode: 'plan' },
  })
  const planned = createInfrastructureOperation(
    configuration.CONTROL_STATE_PATH,
    planRequest,
    actor,
    `scheduled-retention-plan:production:${date}`,
    now,
  )
  const planOperation = await waitForOperation(planned.operation.id)
  const plan = retentionCleanupPlanSchema.parse(planOperation.result?.plan)
  const executeRequest = infrastructureOperationRequestSchema.parse({
    operationType: 'recovery',
    reason: `Scheduled weekly production retention cleanup for ${date} Asia/Hong_Kong`,
    target: {
      action: 'retention-cleanup',
      confirmation: 'RETENTION-CLEANUP-PRODUCTION',
      environment: 'production',
      evaluatedAt,
      mode: 'execute',
      planSha256: plan.planSha256,
    },
  })
  const executed = createInfrastructureOperation(
    configuration.CONTROL_STATE_PATH,
    executeRequest,
    actor,
    `scheduled-retention-execute:production:${date}`,
  )
  const operation = await waitForOperation(executed.operation.id)
  console.log(
    JSON.stringify({
      event: 'scheduled_retention_cleanup_completed',
      operationId: operation.id,
      planSha256: plan.planSha256,
    }),
  )
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Scheduled retention cleanup failed')
  process.exitCode = 1
})
