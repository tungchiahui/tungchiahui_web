import { z } from 'zod'

import { initializeControlState } from '../../src/control-plane/control-state'
import { safeErrorAttributes } from '../../src/observability/telemetry'
import { parseRecoveryConfiguration } from '../../src/recovery/configuration'
import {
  createDailyProtectionServices,
  dailyProtectionProgressSchema,
  runDailyProtection,
} from '../../src/recovery/daily-protection'
import {
  executeDatabaseBackup,
  executeDatabaseRestore,
  executeOffsiteReplicaRetry,
  restoreLatestControlStateFromReplica,
} from '../../src/recovery/engine'

const configuration = parseRecoveryConfiguration(process.env)
initializeControlState(configuration.controlStatePath, configuration.mode)
const action = z
  .enum(['backup', 'restore', 'control-state-restore', 'offsite-retry', 'daily-protection'])
  .parse(process.argv[2])

async function main() {
  let result: unknown
  switch (action) {
    case 'daily-protection': {
      if (configuration.mode !== 'test')
        throw new Error('Daily protection drill requires a disposable test environment')
      const input = z
        .object({
          date: z.iso.date(),
          databaseBackupType: z.enum(['full', 'diff']),
          prior: dailyProtectionProgressSchema.optional(),
        })
        .strict()
        .parse(JSON.parse(z.string().min(2).parse(process.argv[3])) as unknown)
      result = await runDailyProtection(
        {
          date: input.date,
          databaseBackupType: input.databaseBackupType,
          environment: 'production',
        },
        input.prior,
        createDailyProtectionServices(configuration, process.env),
        () => {},
      )
      break
    }
    case 'backup':
      result = await executeDatabaseBackup(
        configuration,
        z.enum(['full', 'diff', 'incr']).parse(process.argv[3]),
      )
      break
    case 'restore':
      result = await executeDatabaseRestore(
        configuration,
        z
          .object({
            confirmation: z.string().min(1),
            environment: z.enum(['local', 'test', 'production']),
            selector: z.union([
              z.object({ backupId: z.string().min(1) }).strict(),
              z.object({ targetTime: z.iso.datetime({ offset: true }) }).strict(),
            ]),
          })
          .strict()
          .parse(JSON.parse(z.string().min(2).parse(process.argv[3])) as unknown),
      )
      break
    case 'control-state-restore': {
      const input = z
        .object({
          targetPath: z.string().startsWith('/'),
        })
        .strict()
        .parse(JSON.parse(z.string().min(2).parse(process.argv[3])) as unknown)
      result = await restoreLatestControlStateFromReplica(configuration, input.targetPath)
      break
    }
    case 'offsite-retry':
      result = await executeOffsiteReplicaRetry(
        configuration,
        z.string().min(1).parse(process.argv[3]),
      )
      break
  }
  console.log(JSON.stringify(result))
}

main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'recovery_drill_failed', ...safeErrorAttributes(error) }))
  process.exitCode = 1
})
