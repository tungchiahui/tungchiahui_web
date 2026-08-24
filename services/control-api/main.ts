import { parseControlApiConfiguration } from '../../src/control-plane/configuration'
import {
  initializeControlState,
  reconcileInfrastructureOperations,
} from '../../src/control-plane/control-state'
import { createControlApiServer } from '../../src/control-plane/http-server'

const configuration = parseControlApiConfiguration(process.env)

initializeControlState(configuration.statePath, configuration.mode)
const reconciled = reconcileInfrastructureOperations(configuration.statePath)
const controlApi = createControlApiServer(configuration)

controlApi.server.listen(configuration.port, configuration.host, () => {
  console.log(
    JSON.stringify({
      event: 'control_api_started',
      mode: configuration.mode,
      port: configuration.port,
      reconciledOperations: reconciled,
    }),
  )
})

let shuttingDown = false
async function shutdown() {
  if (shuttingDown) {
    return
  }
  shuttingDown = true
  try {
    await controlApi.close()
    process.exitCode = 0
  } catch (error: unknown) {
    console.error(
      JSON.stringify({
        event: 'control_api_shutdown_failed',
        message: error instanceof Error ? error.message : 'unknown shutdown error',
      }),
    )
    process.exitCode = 1
  }
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
