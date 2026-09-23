import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import { parse } from 'yaml'
import { z } from 'zod'

const workflowSchema = z
  .object({
    concurrency: z.unknown().optional(),
    jobs: z.record(z.string(), z.unknown()),
    name: z.string().min(1),
    on: z.record(z.string(), z.unknown()),
    permissions: z.unknown().optional(),
  })
  .passthrough()

const workflowJobSchema = z
  .object({
    environment: z.union([z.string(), z.object({ name: z.string() }).passthrough()]).optional(),
    if: z.string().optional(),
    needs: z.union([z.string(), z.array(z.string())]).optional(),
    outputs: z.record(z.string(), z.string()).optional(),
    permissions: z.record(z.string(), z.string()).optional(),
  })
  .passthrough()

const pinnedActionPattern = /uses:\s+[^\s@]+@([a-f0-9]{40})(?:\s|$)/g
const everyActionPattern = /uses:\s+[^\s@]+@([^\s#]+)/g
const translationInvocation = './site "$' + '{arguments[@]}"'
const workflowShaReference = 'ref: $' + '{{ github.workflow_sha }}'
const serviceDigestReference =
  'SITE_SERVICE_IMAGE_DIGEST=$' + '{{ needs.build-service.outputs.image_digest }}'
const releaseShaBuildArgument =
  'SITE_DEPLOYMENT_SHA=$' + '{{ needs.resolve-release.outputs.git_sha }}'

export type WorkflowPolicyIssue = Readonly<{ file: string; message: string }>

function workflow(root: string, file: string) {
  const source = readFileSync(join(root, '.github', 'workflows', file), 'utf8')
  return Object.freeze({ parsed: workflowSchema.parse(parse(source) as unknown), source })
}

function requireFragments(
  issues: WorkflowPolicyIssue[],
  file: string,
  source: string,
  fragments: readonly string[],
) {
  for (const fragment of fragments) {
    if (!source.includes(fragment)) issues.push({ file, message: `Missing policy: ${fragment}` })
  }
}

function rejectFragments(
  issues: WorkflowPolicyIssue[],
  file: string,
  source: string,
  fragments: readonly string[],
) {
  for (const fragment of fragments) {
    if (source.includes(fragment)) issues.push({ file, message: `Forbidden policy: ${fragment}` })
  }
}

function verifyPinnedActions(issues: WorkflowPolicyIssue[], file: string, source: string) {
  const references = [...source.matchAll(everyActionPattern)]
  const pinned = [...source.matchAll(pinnedActionPattern)]
  if (references.length !== pinned.length) {
    issues.push({ file, message: 'Every third-party action must use a full commit digest' })
  }
}

function normalizedNeeds(job: z.infer<typeof workflowJobSchema>) {
  return typeof job.needs === 'string' ? [job.needs] : (job.needs ?? [])
}

function requireReleaseJobStructure(
  issues: WorkflowPolicyIssue[],
  jobs: Readonly<Record<string, unknown>>,
) {
  const parsedJobs = new Map(
    Object.entries(jobs).map(
      ([name, value]) => [name, workflowJobSchema.safeParse(value)] as const,
    ),
  )
  const requireJob = (name: string) => {
    const parsed = parsedJobs.get(name)
    if (!parsed?.success) {
      issues.push({ file: 'release.yml', message: `Missing or invalid release job: ${name}` })
      return undefined
    }
    return parsed.data
  }

  const qualityGate = requireJob('quality-gate')
  const qualityJobs = [
    'quality-static',
    'quality-unit',
    'quality-infrastructure',
    'quality-integration',
    'quality-migration',
  ]
  for (const qualityJob of qualityJobs) requireJob(qualityJob)
  if (
    qualityGate &&
    (JSON.stringify(normalizedNeeds(qualityGate).toSorted()) !==
      JSON.stringify(qualityJobs.toSorted()) ||
      qualityGate.if !== 'always()')
  ) {
    issues.push({
      file: 'release.yml',
      message: 'Quality gate must fail closed across every parallel quality job',
    })
  }

  const publishJobs = ['build-postgres', 'build-recovery', 'build-service', 'build-web']
  for (const name of publishJobs) {
    const publish = requireJob(name)
    if (publish?.permissions?.packages !== 'write') {
      issues.push({ file: 'release.yml', message: `${name} must retain packages: write` })
    }
  }

  const build = requireJob('build')
  if (build) {
    const requiredOutputs = [
      'git_sha',
      'image_digest',
      'postgres_image_digest',
      'recovery_image_digest',
      'service_image_digest',
    ]
    if (
      JSON.stringify(Object.keys(build.outputs ?? {}).toSorted()) !==
      JSON.stringify(requiredOutputs.toSorted())
    ) {
      issues.push({
        file: 'release.yml',
        message: 'Build job must expose every immutable release image digest',
      })
    }
    if (
      JSON.stringify(normalizedNeeds(build).toSorted()) !==
      JSON.stringify(['resolve-release', ...publishJobs].toSorted())
    ) {
      issues.push({
        file: 'release.yml',
        message: 'Build manifest must require every immutable image publication',
      })
    }
  }

  const deploy = requireJob('deploy')
  if (deploy) {
    const environment =
      typeof deploy.environment === 'string' ? deploy.environment : deploy.environment?.name
    if (
      JSON.stringify(normalizedNeeds(deploy)) !== JSON.stringify(['build']) ||
      deploy.if !== "vars.PRODUCTION_DEPLOYMENT_ENABLED == 'true'" ||
      environment !== 'production' ||
      deploy.permissions?.['id-token'] !== 'write'
    ) {
      issues.push({
        file: 'release.yml',
        message: 'Deploy job must remain build-gated, production-scoped and OIDC-only',
      })
    }
  }

  const result = requireJob('release-result')
  if (
    result &&
    (JSON.stringify(normalizedNeeds(result).toSorted()) !==
      JSON.stringify(['build', 'deploy'].toSorted()) ||
      result.if !== 'always()')
  ) {
    issues.push({
      file: 'release.yml',
      message: 'Release result job must fail closed across build and deployment outcomes',
    })
  }
}

export function analyzeWorkflowPolicies(root: string): readonly WorkflowPolicyIssue[] {
  const issues: WorkflowPolicyIssue[] = []
  const release = workflow(root, 'release.yml')
  const content = workflow(root, 'content-sync.yml')
  const translation = workflow(root, 'translation.yml')
  const maintenance = workflow(root, 'maintenance.yml')

  const maintenanceTriggers = Object.keys(maintenance.parsed.on).toSorted()
  if (JSON.stringify(maintenanceTriggers) !== JSON.stringify(['schedule', 'workflow_dispatch'])) {
    issues.push({ file: 'maintenance.yml', message: 'Retention Maintenance triggers changed' })
  }
  verifyPinnedActions(issues, 'maintenance.yml', maintenance.source)
  requireFragments(issues, 'maintenance.yml', maintenance.source, [
    "cron: '30 23 * * 6'",
    'packages: write',
    'group: production-retention-maintenance',
    'cancel-in-progress: false',
    'tools/maintenance/ghcr-retention.ts --execute --confirm GHCR-RETENTION-CLEANUP',
  ])
  rejectFragments(issues, 'maintenance.yml', maintenance.source, [
    'id-token: write',
    'secrets.',
    '/var/run/docker.sock',
    './site deploy',
  ])

  const releaseTriggers = Object.keys(release.parsed.on).toSorted()
  if (JSON.stringify(releaseTriggers) !== JSON.stringify(['push', 'workflow_dispatch'])) {
    issues.push({ file: 'release.yml', message: 'Main Release triggers changed' })
  }
  requireReleaseJobStructure(issues, release.parsed.jobs)
  requireFragments(issues, 'release.yml', release.source, [
    'branches: [main]',
    'group: application-production-release',
    'cancel-in-progress: false',
    'git merge-base --is-ancestor "$release_sha" origin/main',
    'pnpm run check:biome',
    'pnpm run check:source',
    'pnpm run check:workflows',
    'pnpm run check:drizzle',
    'pnpm run typecheck',
    'pnpm run test:unit',
    'pnpm run test:infra && pnpm run test:recovery',
    'pnpm run test:integration',
    'pnpm run test:migration',
    'pnpm run renovate:validate',
    'pnpm run build',
    'packages: write',
    'id-token: write',
    'environment: production',
    "if: vars.PRODUCTION_DEPLOYMENT_ENABLED == 'true'",
    'ghcr.io/tungchiahui/tungchiahui_web',
    'docker/setup-buildx-action@',
    'docker/build-push-action@',
    'cache-from: type=gha,scope=production-web',
    'cache-to: type=gha,mode=max,scope=production-web',
    workflowShaReference,
    'SITE_CONTROL_API_URL: https://www.tungchiahui.cn',
    serviceDigestReference,
    '### Immutable release manifest',
    'git rev-parse origin/main',
    './site deploy',
    '--wait',
    '[[ "$DEPLOY_RESULT" == "success" ]]',
  ])
  if (release.source.split(releaseShaBuildArgument).length - 1 !== 4) {
    issues.push({
      file: 'release.yml',
      message: 'Every production image must bind the exact release SHA',
    })
  }
  rejectFragments(issues, 'release.yml', release.source, [
    'pull_request:',
    'merge_group:',
    'workflow_run:',
    'DATABASE_URL',
    'AI_API',
    'SITE_OPERATOR_PRIVATE_KEY',
    '/var/run/docker.sock',
    'secrets.',
  ])

  if (JSON.stringify(Object.keys(content.parsed.on)) !== JSON.stringify(['workflow_call'])) {
    issues.push({
      file: 'content-sync.yml',
      message: 'Content sync must only be a reusable content-repository workflow',
    })
  }
  requireFragments(issues, 'content-sync.yml', content.source, [
    'id-token: write',
    'environment: production',
    './site content sync',
  ])
  rejectFragments(issues, 'content-sync.yml', content.source, [
    'docker build',
    'docker push',
    './site deploy',
    './site translate',
    'packages: write',
    'DATABASE_URL',
    'secrets.',
  ])

  if (
    JSON.stringify(Object.keys(translation.parsed.on)) !== JSON.stringify(['workflow_dispatch'])
  ) {
    issues.push({ file: 'translation.yml', message: 'Paid translation must remain manual only' })
  }
  requireFragments(issues, 'translation.yml', translation.source, [
    'id-token: write',
    'environment: production',
    'TRANSLATION_DRY_RUN',
    translationInvocation,
  ])
  rejectFragments(issues, 'translation.yml', translation.source, [
    'DATABASE_URL',
    'AI_API',
    '/var/run/docker.sock',
    'secrets.',
  ])

  for (const [file, source] of [
    ['release.yml', release.source],
    ['content-sync.yml', content.source],
    ['translation.yml', translation.source],
  ] as const) {
    verifyPinnedActions(issues, file, source)
  }
  return issues
}
