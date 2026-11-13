import { z } from 'zod'
import {
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  listInfrastructureOperations,
  startInfrastructureOperation,
} from '../control-plane/control-state'
import type { HostSettings } from './contracts'
import { hostControlPath } from './coordinator'
import { readHostEnvironment } from './provision'
import {
  configureReleasePullTargetSchema,
  publishedDeploymentSchema,
  releaseRepository,
  releaseWorkflowPath,
} from './publication-contracts'
import {
  initializeReleasePull,
  publicReleaseStatus,
  readReleasePull,
  setReleasePullEnabled,
  writeReleasePull,
} from './publication-state'

export async function configureReleasePull(settings: HostSettings, owner: string) {
  const path = hostControlPath(settings)
  const operation = claimNextInfrastructureOperation(
    path,
    owner,
    3600,
    new Date(),
    ['server-migration'],
    'configure-release-pull',
  )
  if (!operation) return false
  const lease = { leaseOwner: owner, fencingToken: operation.fencingToken }
  startInfrastructureOperation(path, operation.id, lease)
  const target = configureReleasePullTargetSchema.parse(operation.target)
  setReleasePullEnabled(path, target.enabled, new Date(), { operationId: operation.id, ...lease })
  finishInfrastructureOperation(path, operation.id, lease, {
    status: 'completed',
    phase: 'release-pull-configured',
    result: { enabled: target.enabled },
    errorSummary: null,
  })
  return true
}
export async function pollPublishedRelease(
  settings: HostSettings,
  request: typeof fetch = fetch,
  now = new Date(),
) {
  const path = hostControlPath(settings)
  initializeReleasePull(path)
  const state = readReleasePull(path)
  if (!state.enabled || state.nextCheckAt > now.toISOString()) return
  if (
    listInfrastructureOperations(path, {
      statuses: ['queued', 'claimed', 'running', 'needs-attention'],
    }).length > 0
  )
    return
  writeReleasePull(path, { phase: 'checking' }, now)
  try {
    const environment = readHostEnvironment({ settings })
    const read = async (endpoint: string): Promise<unknown> => {
      const response = await request(
        `https://api.github.com/repos/${releaseRepository}/${endpoint}`,
        {
          headers: {
            Authorization: `Bearer ${z.string().min(1).parse(environment.DEPLOYMENT_REGISTRY_TOKEN)}`,
            Accept: 'application/vnd.github+json',
          },
          signal: AbortSignal.timeout(15000),
        },
      )
      if (!response.ok)
        throw new Error(`GitHub publication lookup returned HTTP ${response.status}`)
      return response.json()
    }
    const head = z
      .object({
        object: z.object({ type: z.literal('commit'), sha: z.string().regex(/^[a-f0-9]{40}$/) }),
      })
      .parse(await read('git/ref/heads/main')).object.sha
    const deployments = z
      .array(z.unknown())
      .parse(await read(`deployments?environment=production&per_page=10`))
    const candidate = deployments
      .map((v) => publishedDeploymentSchema.safeParse(v))
      .find((v) => v.success && v.data.sha === v.data.payload.gitSha && v.data.payload.automatic)
    if (!candidate?.success) {
      writeReleasePull(path, { phase: 'waiting-for-publication', gitSha: head }, now)
      return
    }
    const publication = candidate.data
    const target = publication.payload.gitSha
    if (target !== head) {
      const comparison = z
        .object({
          status: z.literal('ahead'),
          total_commits: z.number().int().max(250),
          files: z
            .array(z.object({ filename: z.string(), previous_filename: z.string().optional() }))
            .min(1)
            .max(299),
        })
        .parse(await read(`compare/${target}...${head}`))
      const isDoc = (name: string) =>
        name.startsWith('docs/') || ['README.md', 'CONTRIBUTING.md'].includes(name)
      if (
        !comparison.files.every(
          (file) =>
            isDoc(file.filename) && (!file.previous_filename || isDoc(file.previous_filename)),
        )
      ) {
        writeReleasePull(path, { phase: 'waiting-for-current-source', gitSha: head }, now)
        return
      }
    }
    const run = z
      .object({
        head_sha: z.literal(target),
        head_branch: z.literal('main'),
        event: z.literal('push'),
        path: z.literal(releaseWorkflowPath),
        status: z.string(),
        conclusion: z.string().nullable(),
      })
      .parse(await read(`actions/runs/${publication.payload.runId}`))
    if (run.status !== 'completed' || run.conclusion !== 'success') {
      writeReleasePull(path, { phase: 'waiting-for-verification', gitSha: head }, now)
      return
    }
    if (publicReleaseStatus(path, target, publication.payload.imageDigest).state === 'completed') {
      writeReleasePull(path, { phase: 'deployed', gitSha: target }, now)
      return
    }
    const created = createInfrastructureOperation(
      path,
      {
        operationType: 'deploy',
        reason: `Verified GitHub publication ${publication.id}`,
        target: { gitSha: target, imageDigest: publication.payload.imageDigest },
      },
      {
        id: 'service:release-pull',
        kind: 'service',
        capabilities: ['infrastructure-operation:create'],
      },
      `github-publication:${publication.id}`,
    )
    writeReleasePull(
      path,
      {
        phase: created.operation.status,
        gitSha: target,
        operationId: created.operation.id,
        publicationId: publication.id,
      },
      now,
    )
  } catch {
    writeReleasePull(path, { phase: 'publication-unavailable' }, now)
    console.error(JSON.stringify({ event: 'release_publication_unavailable' }))
  }
}
