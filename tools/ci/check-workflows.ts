import { resolve } from 'node:path'

import { analyzeWorkflowPolicies } from './workflow-policy'

const issues = analyzeWorkflowPolicies(resolve(process.cwd()))
if (issues.length > 0) {
  for (const issue of issues) console.error(`${issue.file}: ${issue.message}`)
  process.exitCode = 1
} else {
  console.log('GitHub workflow policy passed')
}
