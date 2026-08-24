import { appendFileSync } from 'node:fs'

import { z } from 'zod'

import { placeholderKinds, placeholderPolicies } from './placeholder-policy'

const kindSchema = z.enum(placeholderKinds)
const result = kindSchema.safeParse(process.argv[2])

if (!result.success) {
  console.error('Expected placeholder kind: integration, migration, or e2e')
  process.exitCode = 2
} else {
  const policy = placeholderPolicies[result.data]
  const summary = [
    `Placeholder: ${result.data}`,
    `Status: ${policy.status} (this is not a passing test suite)`,
    `Owner: ${policy.owner}`,
    `Replacement phase: Phase ${policy.replacementPhase}`,
    `Scope: ${policy.scope}`,
  ].join('\n')

  console.log(summary)

  const githubSummaryPath = process.env.GITHUB_STEP_SUMMARY
  if (githubSummaryPath) {
    appendFileSync(githubSummaryPath, `### ${result.data} test placeholder\n\n${summary}\n\n`)
  }
}
