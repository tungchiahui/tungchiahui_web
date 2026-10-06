import { activateHostExecutor } from '../../src/host-release/bootstrap'
import { hostSettingsSchema } from '../../src/host-release/contracts'

async function main() {
  const [
    sha,
    digest,
    configRoot = '/etc/tungchiahui',
    dataRoot = '/var/lib/tungchiahui',
    projectName = 'tungchiahui-production',
  ] = process.argv.slice(2)
  if (!sha || !digest) throw new Error('Activation requires an authorized SHA and Web digest')
  await activateHostExecutor(
    hostSettingsSchema.parse({ configRoot, dataRoot, projectName }),
    sha,
    digest,
  )
}
void main().catch(() => {
  console.error(
    JSON.stringify({
      event: 'host_bootstrap_failed',
      action: 'inspect prerequisites and root-owned canonical env on the server',
    }),
  )
  process.exitCode = 1
})
