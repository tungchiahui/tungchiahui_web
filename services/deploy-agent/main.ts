import { createServer, request as httpRequest, type ServerResponse } from 'node:http'

import { z } from 'zod'

import { serviceIdentityContracts } from '../../src/control-plane/contracts'

const configuration = z
  .object({
    DEPLOY_AGENT_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
    DEPLOY_AGENT_PORT: z.coerce.number().int().min(1024).max(65_535),
    DOCKER_SOCKET_PATH: z.string().startsWith('/run/deploy-capability/'),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .parse(process.env)

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

function pingDocker() {
  return new Promise<boolean>((resolvePing) => {
    const request = httpRequest(
      {
        method: 'GET',
        path: '/_ping',
        socketPath: configuration.DOCKER_SOCKET_PATH,
        timeout: 1_000,
      },
      (dockerResponse) => {
        dockerResponse.resume()
        resolvePing(dockerResponse.statusCode === 200)
      },
    )
    request.on('error', () => resolvePing(false))
    request.on('timeout', () => {
      request.destroy()
      resolvePing(false)
    })
    request.end()
  })
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' })
    return
  }
  if (request.url === '/health' || request.url === '/capabilities') {
    const dockerReady = await pingDocker()
    sendJson(response, dockerReady ? 200 : 503, {
      allowedDockerRequests: ['GET /_ping'],
      contract: serviceIdentityContracts['deploy-agent'],
      deploymentEngine: 'phase-14-not-implemented',
      dockerReady,
      mode: configuration.SITE_RUNTIME_MODE,
      productionOperations: false,
      service: 'deploy-agent',
      status: dockerReady ? 'ok' : 'degraded',
    })
    return
  }
  sendJson(response, 404, { error: 'not_found' })
})

server.listen(configuration.DEPLOY_AGENT_PORT, configuration.DEPLOY_AGENT_HOST, () => {
  console.log(
    JSON.stringify({
      event: 'deploy_agent_started',
      mode: configuration.SITE_RUNTIME_MODE,
      port: configuration.DEPLOY_AGENT_PORT,
      productionOperations: false,
    }),
  )
})

function shutdown() {
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ event: 'deploy_agent_shutdown_failed', message: error.message }),
      )
      process.exitCode = 1
      return
    }
    process.exitCode = 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
