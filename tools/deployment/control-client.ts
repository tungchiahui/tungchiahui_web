import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { controlRequest } from '../control/client'

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const operationEnvelopeSchema = z.object({
  operation: z
    .object({ errorSummary: z.string().nullable().optional(), id: z.uuid(), status: z.string() })
    .passthrough(),
})

async function waitForDeployment(operationId: string) {
  const timeoutMilliseconds = z.coerce
    .number()
    .int()
    .min(1_000)
    .max(1_800_000)
    .default(900_000)
    .parse(process.env.SITE_DEPLOYMENT_WAIT_TIMEOUT_MILLISECONDS)
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    const result = operationEnvelopeSchema.parse(
      await controlRequest(`/api/ops/infrastructure-operations/${operationId}`, {
        purpose: `deployment-wait-${operationId}`,
      }),
    )
    if (result.operation.status === 'completed') return result
    if (['failed', 'cancelled', 'needs-attention'].includes(result.operation.status)) {
      throw new Error(
        `Deployment operation ended in ${result.operation.status}: ${result.operation.errorSummary ?? 'no error summary'}`,
      )
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_000))
  }
  throw new Error(`Deployment operation ${operationId} did not complete before the timeout`)
}

export async function createDeployment(
  input: Readonly<{
    gitSha?: string
    imageDigest?: string
    reason: string
    wait?: boolean
  }>,
) {
  const gitSha = gitShaSchema.parse(
    input.gitSha ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  )
  const imageDigest = digestSchema.parse(
    input.imageDigest ?? process.env.SITE_DEPLOYMENT_IMAGE_DIGEST,
  )
  const created = operationEnvelopeSchema.parse(
    await controlRequest('/api/ops/deployments', {
      body: { gitSha, imageDigest, reason: input.reason },
      idempotencyKey: `deployment:${gitSha}:${imageDigest.slice(7)}`,
      method: 'POST',
      purpose: 'deployment-create',
    }),
  )
  return input.wait === true ? waitForDeployment(created.operation.id) : created
}

export async function createRollback(reason: string) {
  return controlRequest('/api/ops/rollbacks', {
    body: { reason },
    idempotencyKey: `rollback:${randomUUID()}`,
    method: 'POST',
    purpose: 'rollback-create',
  })
}

export async function readDeploymentStatus() {
  return controlRequest('/api/ops/status', { purpose: 'deployment-status' })
}
