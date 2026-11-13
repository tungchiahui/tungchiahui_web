import { z } from 'zod'
import { acquireHostExecutor } from '../../src/host-release/state'

const path = z
  .string()
  .regex(/^\/tmp\/tungchiahui-phase12-[a-zA-Z0-9]+\/var\/control-state\/control.db$/)
  .parse(process.argv[2])
const owner = z.literal('deploy-agent:host:postgres-maintenance-fixture').parse(process.argv[3])
function heartbeat() {
  if (!acquireHostExecutor(path, owner))
    throw new Error('Disposable maintenance host lease was lost')
}
heartbeat()
const timer = setInterval(heartbeat, 5000)
process.on('SIGTERM', () => {
  clearInterval(timer)
})
