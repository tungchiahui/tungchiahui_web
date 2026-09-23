import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { retentionCleanupPlanSchema } from '../../src/maintenance/retention'
import { controlRequest } from '../control/client'

const operationEnvelopeSchema = z.object({
  operation: z
    .object({
      errorSummary: z.string().nullable(),
      id: z.uuid(),
      result: z.record(z.string(), z.unknown()).nullable(),
      status: z.string(),
    })
    .passthrough(),
})

async function waitForOperation(operationId: string) {
  const deadline = Date.now() + 900_000
  while (Date.now() < deadline) {
    const result = operationEnvelopeSchema.parse(
      await controlRequest(`/api/ops/infrastructure-operations/${operationId}`, {
        purpose: `retention-cleanup-wait-${operationId}`,
      }),
    )
    if (result.operation.status === 'completed') return result
    if (['failed', 'cancelled', 'needs-attention'].includes(result.operation.status)) {
      throw new Error(
        `Retention cleanup operation ${operationId} ended in ${result.operation.status}: ${result.operation.errorSummary ?? 'no error summary'}`,
      )
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
  throw new Error(`Retention cleanup operation ${operationId} did not complete before the timeout`)
}

async function createOperation(target: Readonly<Record<string, unknown>>, reason: string) {
  const created = operationEnvelopeSchema.parse(
    await controlRequest('/api/ops/infrastructure-operations', {
      body: { operationType: 'recovery', reason, target },
      idempotencyKey: `retention-cleanup:operator:${randomUUID()}`,
      method: 'POST',
      purpose: 'retention-cleanup-create',
    }),
  )
  return waitForOperation(created.operation.id)
}

function resultPlan(result: z.infer<typeof operationEnvelopeSchema>) {
  return retentionCleanupPlanSchema.parse(result.operation.result?.plan)
}

export async function runRetentionCleanup(input: Readonly<{ execute: boolean; reason: string }>) {
  const evaluatedAt = new Date().toISOString()
  const planned = await createOperation(
    { action: 'retention-cleanup', environment: 'production', evaluatedAt, mode: 'plan' },
    `${input.reason} (dry-run plan)`,
  )
  const plan = resultPlan(planned)
  if (!input.execute) return Object.freeze({ executed: false, plan })
  const executed = await createOperation(
    {
      action: 'retention-cleanup',
      confirmation: 'RETENTION-CLEANUP-PRODUCTION',
      environment: 'production',
      evaluatedAt,
      mode: 'execute',
      planSha256: plan.planSha256,
    },
    input.reason,
  )
  return Object.freeze({ executed: true, operation: executed.operation, plan })
}
