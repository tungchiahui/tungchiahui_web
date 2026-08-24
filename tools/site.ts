import {
  assertToolchain,
  executePackageScript,
  parseSiteCommand,
  SiteUsageError,
} from './site-command'

const usage = `Usage: ./site <command>

Phase 1 commands:
  check  Run formatting, lint, source policy, typecheck, Renovate validation, and build
  test   Run unit tests and explicit not-yet-implemented test placeholders
  help   Show this help

The dev command is implemented in Phase 2.`

function main() {
  assertToolchain(process.versions.node)
  const command = parseSiteCommand(process.argv.slice(2))

  switch (command) {
    case 'check':
      return executePackageScript('phase1:check')
    case 'test':
      return executePackageScript('phase1:test')
    case 'help':
      console.log(usage)
      return 0
  }
}

try {
  process.exitCode = main()
} catch (error: unknown) {
  const message = error instanceof Error ? error.message : 'Unknown CLI failure'
  console.error(error instanceof SiteUsageError ? `${message}\n\n${usage}` : message)
  process.exitCode = 2
}
