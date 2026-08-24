import { spawnSync } from 'node:child_process'

import { z } from 'zod'

const siteCommandSchema = z.enum(['check', 'test', 'help'])

export type SiteCommand = z.infer<typeof siteCommandSchema>

export class SiteUsageError extends Error {
  override readonly name = 'SiteUsageError'
}

export function assertToolchain(nodeVersion: string) {
  if (nodeVersion !== '24.19.0') {
    throw new SiteUsageError(`Node.js 24.19.0 is required; received ${nodeVersion}`)
  }
}

export function parseSiteCommand(arguments_: readonly string[]): SiteCommand {
  if (arguments_.length === 0) {
    return 'help'
  }

  if (arguments_.length !== 1) {
    throw new SiteUsageError('Expected exactly one command')
  }

  const result = siteCommandSchema.safeParse(arguments_[0])

  if (!result.success) {
    throw new SiteUsageError(`Unknown command: ${arguments_[0]}`)
  }

  return result.data
}

export function executePackageScript(script: 'phase1:check' | 'phase1:test') {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(executable, ['run', script], { stdio: 'inherit' })

  if (result.error) {
    throw new Error(`Unable to run pnpm: ${result.error.message}`)
  }

  return result.status ?? 1
}
