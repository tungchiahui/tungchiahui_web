import { createServer, type ServerResponse } from 'node:http'

import { z } from 'zod'

import {
  type ControlStateEnvironment,
  initializeControlState,
  readControlState,
} from '../../src/control-plane/control-state'

const configurationSchema = z.object({
  CONTROL_API_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
  CONTROL_API_PORT: z.coerce.number().int().min(1024).max(65_535),
  CONTROL_STATE_PATH: z.string().startsWith('/control-state/'),
  SITE_RUNTIME_MODE: z.enum(['local', 'test']),
})

const configuration = configurationSchema.parse(process.env)
const environment: ControlStateEnvironment = configuration.SITE_RUNTIME_MODE

initializeControlState(configuration.CONTROL_STATE_PATH, environment)

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'local_control_api_is_read_only' })
    return
  }

  if (request.url === '/health') {
    const state = readControlState(configuration.CONTROL_STATE_PATH)
    sendJson(response, 200, {
      controlState: state,
      mode: environment,
      service: 'control-api',
      status: 'ok',
    })
    return
  }

  if (request.url === '/api/ops/status') {
    sendJson(response, 200, {
      capabilities: ['local-status'],
      controlState: readControlState(configuration.CONTROL_STATE_PATH),
      deployAgent: 'fake',
      mode: environment,
      productionOperations: false,
    })
    return
  }

  sendJson(response, 404, { error: 'not_found' })
})

server.listen(configuration.CONTROL_API_PORT, configuration.CONTROL_API_HOST, () => {
  console.log(
    JSON.stringify({
      event: 'control_api_started',
      mode: environment,
      port: configuration.CONTROL_API_PORT,
    }),
  )
})

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ event: 'control_api_shutdown_failed', message: error.message }),
      )
      process.exitCode = 1
      return
    }

    process.exitCode = 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
