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

const pinnedActionPattern = /uses:\s+[^\s@]+@([a-f0-9]{40})(?:\s|$)/g
const everyActionPattern = /uses:\s+[^\s@]+@([^\s#]+)/g
const translationInvocation = './site "$' + '{arguments[@]}"'
const workflowShaReference = 'ref: $' + '{{ github.workflow_sha }}'

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

export function analyzeWorkflowPolicies(root: string): readonly WorkflowPolicyIssue[] {
  const issues: WorkflowPolicyIssue[] = []
  const release = workflow(root, 'release.yml')
  const content = workflow(root, 'content-sync.yml')
  const translation = workflow(root, 'translation.yml')

  const releaseTriggers = Object.keys(release.parsed.on).toSorted()
  if (JSON.stringify(releaseTriggers) !== JSON.stringify(['push', 'workflow_dispatch'])) {
    issues.push({ file: 'release.yml', message: 'Main Release triggers changed' })
  }
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
    workflowShaReference,
    'SITE_CONTROL_API_URL: https://www.tungchiahui.cn',
    './site deploy',
    '--wait',
  ])
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
