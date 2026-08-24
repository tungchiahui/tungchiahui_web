import { spawnSync } from 'node:child_process'

export type SiteCommand =
  | Readonly<{ kind: 'check' }>
  | Readonly<{ kind: 'dev-reset' }>
  | Readonly<{ kind: 'dev-start' }>
  | Readonly<{ kind: 'dev-stop' }>
  | Readonly<{ kind: 'help' }>
  | Readonly<{ kind: 'test' }>

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
    return Object.freeze({ kind: 'help' })
  }

  if (arguments_.length === 1) {
    switch (arguments_[0]) {
      case 'check':
        return Object.freeze({ kind: 'check' })
      case 'dev':
        return Object.freeze({ kind: 'dev-start' })
      case 'help':
        return Object.freeze({ kind: 'help' })
      case 'test':
        return Object.freeze({ kind: 'test' })
      default:
        throw new SiteUsageError(`Unknown command: ${arguments_[0]}`)
    }
  }

  if (arguments_.length === 2 && arguments_[0] === 'dev' && arguments_[1] === 'stop') {
    return Object.freeze({ kind: 'dev-stop' })
  }

  if (
    arguments_.length === 6 &&
    arguments_[0] === 'dev' &&
    arguments_[1] === 'reset' &&
    arguments_[2] === '--environment' &&
    arguments_[3] === 'local' &&
    arguments_[4] === '--confirm' &&
    arguments_[5] === 'RESET-LOCAL-DATA'
  ) {
    return Object.freeze({ kind: 'dev-reset' })
  }

  if (arguments_[0] === 'dev' && arguments_[1] === 'reset') {
    throw new SiteUsageError('Local reset requires: --environment local --confirm RESET-LOCAL-DATA')
  }

  throw new SiteUsageError('Invalid or ambiguous command arguments')
}

export function executePackageScript(script: 'site:check' | 'site:test') {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(executable, ['run', script], { stdio: 'inherit' })

  if (result.error) {
    throw new Error(`Unable to run pnpm: ${result.error.message}`)
  }

  return result.status ?? 1
}
