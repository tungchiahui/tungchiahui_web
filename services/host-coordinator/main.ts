import { hostSettingsSchema } from '../../src/host-release/contracts'
import { coordinateNextHostRelease, hostControlPath } from '../../src/host-release/coordinator'
import { readHostEnvironment } from '../../src/host-release/provision'
import { initializeHostReleaseState, readHostRuntime } from '../../src/host-release/state'

async function main() {
  if (process.getuid?.() !== 0) throw new Error('Server administrator identity required')
  process.umask(0o007)
  const settings = hostSettingsSchema.parse(
    JSON.parse(process.env.HOST_RELEASE_SETTINGS ?? '{}') as unknown,
  )
  const path = hostControlPath(settings)
  initializeHostReleaseState(path)
  readHostRuntime(path)
  if (process.argv[2] === '--probe') {
    readHostEnvironment({ settings })
    console.log(JSON.stringify({ protocol: 1, status: 'ready' }))
    return
  }
  const owner = process.env.HOST_RELEASE_OWNER
  if (!owner?.startsWith('deploy-agent:host:')) throw new Error('Supervisor identity missing')
  await coordinateNextHostRelease(settings, owner)
}
void main().catch(() => {
  console.error(JSON.stringify({ event: 'host_coordinator_failed' }))
  process.exitCode = 1
})
