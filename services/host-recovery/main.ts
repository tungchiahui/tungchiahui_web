import { readFileSync } from 'node:fs'
import { z } from 'zod'
import { hostSettingsSchema } from '../../src/host-release/contracts'
import { recoverHostRelease } from '../../src/host-release/recovery'
import { safeErrorAttributes } from '../../src/observability/telemetry'

async function main() {
  if (process.getuid?.() !== 0) throw new Error('Server administrator identity required')
  process.umask(0o007)
  const checkOnly = process.argv.includes('--check')
  const [originalOperationId, settingsPath = '/etc/tungchiahui/host-runtime/settings.json'] =
    process.argv.slice(2).filter((argument) => argument !== '--check')
  const settings = hostSettingsSchema.parse(
    JSON.parse(readFileSync(z.string().parse(settingsPath), 'utf8')) as unknown,
  )
  const result = await recoverHostRelease(settings, z.uuid().parse(originalOperationId), {
    checkOnly,
  })
  console.log(
    JSON.stringify({ event: checkOnly ? 'host_recovery_check' : 'host_recovery', result }),
  )
}

void main().catch((error: unknown) => {
  console.error(JSON.stringify({ event: 'host_recovery_failed', ...safeErrorAttributes(error) }))
  process.exitCode = 1
})
