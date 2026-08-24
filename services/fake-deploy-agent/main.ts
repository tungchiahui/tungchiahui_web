import { createServer, type ServerResponse } from 'node:http'

import { z } from 'zod'

const configurationSchema = z.object({
  FAKE_DEPLOY_AGENT_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
  FAKE_DEPLOY_AGENT_PORT: z.coerce.number().int().min(1024).max(65_535),
  SITE_RUNTIME_MODE: z.enum(['local', 'test']),
})

const configuration = configurationSchema.parse(process.env)

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 501, { error: 'fake_agent_never_executes_deployment' })
    return
  }

  if (request.url === '/health' || request.url === '/capabilities') {
    sendJson(response, 200, {
      capabilities: ['report-health'],
      dockerSocket: false,
      hostShell: false,
      mode: configuration.SITE_RUNTIME_MODE,
      openRestyAccess: false,
      productionOperations: false,
      service: 'fake-deploy-agent',
      status: 'ok',
    })
    return
  }

  sendJson(response, 404, { error: 'not_found' })
})

server.listen(configuration.FAKE_DEPLOY_AGENT_PORT, configuration.FAKE_DEPLOY_AGENT_HOST, () => {
  console.log(
    JSON.stringify({
      event: 'fake_deploy_agent_started',
      mode: configuration.SITE_RUNTIME_MODE,
      port: configuration.FAKE_DEPLOY_AGENT_PORT,
    }),
  )
})

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ event: 'fake_deploy_agent_shutdown_failed', message: error.message }),
      )
      process.exitCode = 1
      return
    }

    process.exitCode = 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
