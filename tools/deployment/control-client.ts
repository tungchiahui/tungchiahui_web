import { execFileSync } from 'node:child_process'
import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { controlRequest } from '../control/client'

const digestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
const gitShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const imageRepositorySchema = z.string().regex(/^[a-z0-9.-]+(?::[0-9]{2,5})?\/[a-z0-9._/-]+$/)
const operationEnvelopeSchema = z.object({
  operation: z
    .object({ errorSummary: z.string().nullable().optional(), id: z.uuid(), status: z.string() })
    .passthrough(),
})

type DigestCommandRunner = (executable: string, arguments_: readonly string[]) => string

const defaultImageRepository = 'ghcr.io/tungchiahui/tungchiahui_web'

function commandOutput(executable: string, arguments_: readonly string[]) {
  return execFileSync(executable, [...arguments_], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function descriptorDigest(input: unknown): string | undefined {
  if (input === null || typeof input !== 'object') return undefined
  const record = input as Record<string, unknown>
  const descriptor = record.Descriptor
  if (descriptor !== null && typeof descriptor === 'object') {
    const digest = (descriptor as Record<string, unknown>).digest
    if (typeof digest === 'string' && digestSchema.safeParse(digest).success) return digest
  }
  const digest = record.digest
  if (typeof digest === 'string' && digestSchema.safeParse(digest).success) return digest
  return undefined
}

function digestFromOutput(output: string) {
  try {
    const parsed = JSON.parse(output) as unknown
    const digest = Array.isArray(parsed)
      ? parsed.map(descriptorDigest).find((candidate) => candidate !== undefined)
      : descriptorDigest(parsed)
    if (digest !== undefined) return digest
  } catch {
    // Text output from docker buildx imagetools inspect is handled below.
  }
  const match = /(?:^|[\n\r\s"'])(?:Digest|digest)["']?\s*[:=]\s*"?(sha256:[a-f0-9]{64})"?/u.exec(
    output,
  )
  return match?.[1]
}

export function deploymentImageRepositoryFromEnvironment(environment: NodeJS.ProcessEnv) {
  return imageRepositorySchema.parse(
    environment.SITE_DEPLOYMENT_IMAGE_REPOSITORY ??
      environment.DEPLOYMENT_IMAGE_REPOSITORY ??
      defaultImageRepository,
  )
}

export function resolveDeploymentImageDigest(
  input: Readonly<{
    gitSha: string
    repository?: string
    runner?: DigestCommandRunner
  }>,
) {
  const gitSha = gitShaSchema.parse(input.gitSha)
  const repository = imageRepositorySchema.parse(input.repository ?? defaultImageRepository)
  const reference = `${repository}:${gitSha}`
  const runner = input.runner ?? commandOutput
  const attempts: readonly (readonly string[])[] = [
    ['buildx', 'imagetools', 'inspect', reference],
    ['manifest', 'inspect', '--verbose', reference],
  ]
  for (const arguments_ of attempts) {
    try {
      const digest = digestFromOutput(runner('docker', arguments_))
      if (digest !== undefined) return digestSchema.parse(digest)
    } catch {
      // Fall through to the next Docker manifest inspection strategy.
    }
  }
  throw new Error(
    `Unable to resolve image digest for ${reference}; run docker login if needed or pass --image-digest sha256:<digest>`,
  )
}

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
    input.imageDigest ??
      process.env.SITE_DEPLOYMENT_IMAGE_DIGEST ??
      resolveDeploymentImageDigest({
        gitSha,
        repository: deploymentImageRepositoryFromEnvironment(process.env),
      }),
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
