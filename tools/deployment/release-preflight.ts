import { execFileSync } from 'node:child_process'
import { z } from 'zod'

import { safeErrorAttributes } from '../../src/observability/telemetry'
import { readDeploymentStatus } from './control-client'

const shaSchema = z.string().regex(/^[a-f0-9]{40}$/)
const journalSchema = z.object({ entries: z.array(z.object({ tag: z.string() })) })
const policySchema = z.object({
  migrations: z.array(
    z.object({
      tag: z.string(),
      requiresHealthCompatiblePreviousRelease: z.boolean().optional(),
      requiresTechV3CompatiblePreviousRelease: z.boolean().optional(),
    }),
  ),
})
const statusSchema = z.object({
  deployment: z.object({
    currentSha: shaSchema.nullable(),
    lastSha: shaSchema.nullable(),
  }),
})

// Immutable legacy bridges were code-reviewed before a capability label existed.
// New releases must advertise compatibility through their image Dockerfile label.
const reviewedHealthBridges = new Set([
  '09db1c9a90e41c0d2d65e72056eaa246684bbf56',
  'a184bb2e7213e2094eb770fb38ba0a243a25b452',
  '416fb9501f70ba1da6dd7e482564eda20a0a5192',
])

function gitSource(sha: string, path: string) {
  return execFileSync('git', ['show', `${shaSchema.parse(sha)}:${path}`], {
    encoding: 'utf8',
    timeout: 15_000,
    stdio: ['ignore', 'pipe', 'pipe'],
  })
}

function getJournal(sha: string) {
  return journalSchema
    .parse(JSON.parse(gitSource(sha, 'drizzle/meta/_journal.json')) as unknown)
    .entries.map((entry) => entry.tag)
}

function capabilities(sha: string) {
  const dockerfile = gitSource(sha, 'ops/production/images/web.Dockerfile')
  return {
    health:
      reviewedHealthBridges.has(sha) ||
      /cn\.tungchiahui\.health-data-versions="[^"]*\b1\b[^"]*"/u.test(dockerfile),
    tech: /cn\.tungchiahui\.tech-payload-versions="[^"]*\b3\b[^"]*"/u.test(dockerfile),
  }
}

export function planReleaseCompatibility(
  currentTags: readonly string[],
  targetTags: readonly string[],
  policy: Readonly<{
    migrations: readonly {
      tag: string
      requiresHealthCompatiblePreviousRelease?: boolean
      requiresTechV3CompatiblePreviousRelease?: boolean
    }[]
  }>,
  current: Readonly<{ health: boolean; tech: boolean }>,
  target: Readonly<{ health: boolean; tech: boolean }>,
) {
  const short = Math.min(currentTags.length, targetTags.length)
  if (currentTags.slice(0, short).join('|') !== targetTags.slice(0, short).join('|')) {
    throw new Error('Source migration histories diverge; database and release need manual review')
  }
  const requirements = new Map(policy.migrations.map((migration) => [migration.tag, migration]))
  const transitions =
    targetTags.length > currentTags.length
      ? targetTags.slice(currentTags.length)
      : currentTags.slice(targetTags.length)
  const capability = targetTags.length > currentTags.length ? current : target
  const missing = transitions.filter((tag) => {
    const rule = requirements.get(tag)
    return (
      (rule?.requiresHealthCompatiblePreviousRelease === true && !capability.health) ||
      (rule?.requiresTechV3CompatiblePreviousRelease === true && !capability.tech)
    )
  })
  return { missing, transitions }
}

async function main() {
  const sha = shaSchema.parse(process.env.RELEASE_SHA)
  const status = statusSchema.parse(await readDeploymentStatus())
  const currentSha = shaSchema.parse(status.deployment.currentSha)
  const currentTags = getJournal(currentSha)
  const targetTags = getJournal(sha)
  const policy = policySchema.parse(
    JSON.parse(gitSource(sha, 'drizzle/migration-policy.json')) as unknown,
  )
  const current = capabilities(currentSha)
  const target = capabilities(sha)
  const plan = planReleaseCompatibility(currentTags, targetTags, policy, current, target)
  if (plan.missing.length > 0) {
    throw new Error(
      `Release preflight blocked: incompatible active/target version for ${plan.missing.join(', ')}. ` +
        (plan.missing.includes('0014_private_body_measurements')
          ? 'First publish the reviewed health privacy bridge ' +
            '416fb9501f70ba1da6dd7e482564eda20a0a5192 via Main Release workflow_dispatch. '
          : 'Review and publish a compatible intermediate release first. ') +
        'Then retry the target SHA. Do not bypass migration or rollback checks.',
    )
  }
  console.log(
    JSON.stringify({
      event: 'release_source_compatibility_preflight_passed',
      currentSha,
      targetSha: sha,
      sourceMigrationTransitions: plan.transitions.length,
      note: 'Source-only screening; the deployment engine and PostgreSQL ledger remain authoritative',
    }),
  )
}

if (process.argv[1]?.endsWith('/release-preflight.ts')) {
  void main().catch((error: unknown) => {
    // Do not print raw process exceptions that could carry environment secrets.
    console.error(
      JSON.stringify({
        event: 'release_source_compatibility_preflight_failed',
        message: safeErrorAttributes(error).message,
      }),
    )
    process.exitCode = 1
  })
}
