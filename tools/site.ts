import { resetDevelopmentStack, startDevelopmentStack, stopDevelopmentStack } from './dev/runtime'
import {
  assertToolchain,
  executePackageScript,
  parseSiteCommand,
  SiteUsageError,
} from './site-command'

const usage = `Usage: ./site <command>

Development:
  dev       Start or reconcile the isolated local stack
  dev stop  Stop the stack without deleting local data
  dev reset --environment local --confirm RESET-LOCAL-DATA
            Delete only the displayed local Compose volumes and control-state directory

Validation:
  check     Run formatting, lint, source policy, typecheck, Renovate validation, and build
  test      Run unit, disposable integration, and honest future-suite placeholders
  help      Show this help`

async function main() {
  assertToolchain(process.versions.node)
  const command = parseSiteCommand(process.argv.slice(2))

  switch (command.kind) {
    case 'check':
      return executePackageScript('site:check')
    case 'dev-reset':
      resetDevelopmentStack()
      return 0
    case 'dev-start':
      await startDevelopmentStack()
      return 0
    case 'dev-stop':
      stopDevelopmentStack()
      return 0
    case 'help':
      console.log(usage)
      return 0
    case 'test':
      return executePackageScript('site:test')
  }
}

main()
  .then((exitCode) => {
    process.exitCode = exitCode
  })
  .catch((error: unknown) => {
    const message = error instanceof Error ? error.message : 'Unknown CLI failure'
    console.error(error instanceof SiteUsageError ? `${message}\n\n${usage}` : message)
    process.exitCode = 2
  })
