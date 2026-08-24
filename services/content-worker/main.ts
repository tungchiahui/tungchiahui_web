import { createServer, type ServerResponse } from 'node:http'

import { z } from 'zod'

import { serviceIdentityContracts } from '../../src/control-plane/contracts'

const configuration = z
  .object({
    CONTENT_WORKER_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
    CONTENT_WORKER_PORT: z.coerce.number().int().min(1024).max(65_535),
    SITE_RUNTIME_MODE: z.enum(['local', 'test']),
  })
  .parse(process.env)

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 501, { error: 'phase5_replaces_application_job_execution_stub' })
    return
  }
  if (request.url === '/health' || request.url === '/capabilities') {
    sendJson(response, 200, {
      contract: serviceIdentityContracts['content-worker'],
      mode: configuration.SITE_RUNTIME_MODE,
      productionOperations: false,
      replacementPhase: 5,
      service: 'content-worker',
      status: 'ok',
    })
    return
  }
  sendJson(response, 404, { error: 'not_found' })
})

server.listen(configuration.CONTENT_WORKER_PORT, configuration.CONTENT_WORKER_HOST, () => {
  console.log(
    JSON.stringify({
      event: 'content_worker_boundary_started',
      mode: configuration.SITE_RUNTIME_MODE,
      port: configuration.CONTENT_WORKER_PORT,
      replacementPhase: 5,
    }),
  )
})

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ event: 'content_worker_shutdown_failed', message: error.message }),
      )
      process.exitCode = 1
      return
    }
    process.exitCode = 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
