import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { controlRequest } from '../control/client'

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/)

export async function createDeployment(
  input: Readonly<{
    gitSha?: string
    imageDigest?: string
    reason: string
  }>,
) {
  const gitSha = gitShaSchema.parse(
    input.gitSha ?? execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim(),
  )
  const imageDigest = digestSchema.parse(
    input.imageDigest ?? process.env.SITE_DEPLOYMENT_IMAGE_DIGEST,
  )
  return controlRequest('/api/ops/deployments', {
    body: { gitSha, imageDigest, reason: input.reason },
    idempotencyKey: `deployment:${gitSha}:${imageDigest.slice(7, 23)}`,
    method: 'POST',
    purpose: 'deployment-create',
  })
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
