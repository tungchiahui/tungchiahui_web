import { resetDevelopmentStack, startDevelopmentStack, stopDevelopmentStack } from './dev/runtime'
import {
  assertToolchain,
  executePackageScript,
  parseSiteCommand,
  SiteUsageError,
} from './site-command'
import { runExternalS3ContractFromEnvironment } from './storage/run-s3-contract'
import {
  cancelTranslationJob,
  createTranslationJob,
  readTranslationStatus,
} from './translation/control-client'

const usage = `Usage: ./site <command>

Development:
  dev       Start or reconcile the isolated local stack
  dev stop  Stop the stack without deleting local data
  dev reset --environment local --confirm RESET-LOCAL-DATA
            Delete only the displayed local Compose volumes and control-state directory

Validation:
  check     Run formatting, lint, source policy, typecheck, Renovate validation, and build
  test      Run unit, disposable integration, critical E2E, and migration suites
  help      Show this help

Translation:
  translate pending|changed|all --dry-run
  translate article <source-path> --dry-run
  translate <scope> --execute --budget-usd <amount>
  translate status [job-id]
  translate cancel <job-id>

Storage:
  storage contract s3 --confirm S3-NON-PRODUCTION
            Run the generic contract against the configured non-production S3-compatible target`

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
    case 'storage-contract-s3':
      await runExternalS3ContractFromEnvironment()
      return 0
    case 'translate': {
      const result =
        command.action === 'create'
          ? await createTranslationJob(command.request)
          : command.action === 'cancel'
            ? await cancelTranslationJob(command.jobId)
            : await readTranslationStatus(command.jobId)
      console.log(JSON.stringify(result, null, 2))
      return 0
    }
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
