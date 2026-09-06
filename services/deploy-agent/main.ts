import { createServer, request as httpRequest, type ServerResponse } from 'node:http'

import { z } from 'zod'
import { serviceIdentityContracts } from '../../src/control-plane/contracts'
import {
  claimNextInfrastructureOperation,
  finishInfrastructureOperation,
  initializeControlState,
  listInfrastructureOperations,
  listRecoveryBackups,
  requeueDeploymentOperationForReconciliation,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import { parseDeploymentConfiguration } from '../../src/deployment/configuration'
import { DockerDeploymentPlatform } from '../../src/deployment/docker-platform'
import { executeDeploymentOperation } from '../../src/deployment/engine'
import { apiSecurityHeaders } from '../../src/observability/security'
import { safeErrorAttributes } from '../../src/observability/telemetry'
import { parseRecoveryConfiguration } from '../../src/recovery/configuration'
import {
  executeControlStateBackup,
  executeDatabaseBackup,
  executeDatabaseRestore,
} from '../../src/recovery/engine'

process.umask(0o007)

const configuration = z
  .object({
    CONTROL_STATE_PATH: z.string().startsWith('/control-state/'),
    DEPLOY_AGENT_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
    DEPLOY_AGENT_PORT: z.coerce.number().int().min(1024).max(65_535),
    DOCKER_SOCKET_PATH: z.string().startsWith('/run/deploy-capability/'),
    POSTGRES_CONTAINER_NAME: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,199}$/),
    RECOVERY_POLLING_ENABLED: z.enum(['true', 'false']).default('true'),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .parse(process.env)
const recovery = parseRecoveryConfiguration(process.env)
const deployment = parseDeploymentConfiguration(process.env)
initializeControlState(configuration.CONTROL_STATE_PATH, 'production')
const deploymentPlatform = new DockerDeploymentPlatform(
  deployment,
  configuration.DOCKER_SOCKET_PATH,
)

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  for (const [name, value] of Object.entries(apiSecurityHeaders)) response.setHeader(name, value)
  response.end(JSON.stringify(payload))
}

function dockerRequest(method: 'GET' | 'POST', path: string) {
  return new Promise<number>((resolveRequest, rejectRequest) => {
    const request = httpRequest(
      {
        method,
        path,
        socketPath: configuration.DOCKER_SOCKET_PATH,
        timeout: 30_000,
      },
      (dockerResponse) => {
        dockerResponse.resume()
        dockerResponse.once('end', () => resolveRequest(dockerResponse.statusCode ?? 500))
      },
    )
    request.once('error', rejectRequest)
    request.once('timeout', () => request.destroy(new Error('Docker request timed out')))
    request.end()
  })
}

async function pingDocker() {
  try {
    return (await dockerRequest('GET', '/_ping')) === 200
  } catch {
    return false
  }
}

async function changePostgresState(action: 'start' | 'stop') {
  const name = encodeURIComponent(configuration.POSTGRES_CONTAINER_NAME)
  const path = action === 'stop' ? `/containers/${name}/stop?t=30` : `/containers/${name}/start`
  const status = await dockerRequest('POST', path)
  const accepted = action === 'stop' ? [204, 304] : [204, 304]
  if (!accepted.includes(status)) {
    throw new Error(`Docker rejected PostgreSQL ${action} with HTTP ${String(status)}`)
  }
}

async function executeClaimedRecovery() {
  const claimed = claimNextInfrastructureOperation(
    configuration.CONTROL_STATE_PATH,
    'deploy-agent:recovery',
    3_600,
    new Date(),
    ['recovery', 'restore'],
  )
  if (!claimed) return false
  const lease = {
    fencingToken: claimed.fencingToken,
    leaseOwner: 'deploy-agent:recovery',
  }
  startInfrastructureOperation(configuration.CONTROL_STATE_PATH, claimed.id, lease)
  try {
    if (claimed.operationType === 'recovery') {
      if (claimed.target.action === 'backup') {
        const target = z
          .object({
            action: z.literal('backup'),
            backupType: z.enum(['full', 'diff', 'incr']),
            environment: z.literal('production'),
          })
          .strict()
          .parse(claimed.target)
        await executeDatabaseBackup(recovery, target.backupType)
      } else if (claimed.target.action === 'control-state-backup') {
        z.object({
          action: z.literal('control-state-backup'),
          environment: z.literal('production'),
        })
          .strict()
          .parse(claimed.target)
        await executeControlStateBackup(recovery)
      } else {
        throw new Error('Recovery operation is not implemented by the Phase 13 engine')
      }
    } else {
      const target = z
        .object({
          confirmation: z.literal('RESTORE-PRODUCTION'),
          environment: z.literal('production'),
          selector: z.union([
            z.object({ backupId: z.string().min(1).max(200) }).strict(),
            z.object({ targetTime: z.iso.datetime({ offset: true }) }).strict(),
          ]),
        })
        .strict()
        .parse(claimed.target)
      await changePostgresState('stop')
      await executeDatabaseRestore(recovery, target)
      await changePostgresState('start')
    }
    finishInfrastructureOperation(configuration.CONTROL_STATE_PATH, claimed.id, lease, {
      phase: 'recovery-verified',
      status: 'completed',
    })
  } catch (error: unknown) {
    const message = safeErrorAttributes(error).message
    finishInfrastructureOperation(configuration.CONTROL_STATE_PATH, claimed.id, lease, {
      errorSummary: message,
      phase: 'recovery-failed',
      status: 'failed',
    })
    console.error(
      JSON.stringify({
        event: 'recovery_operation_failed',
        message,
        operationId: claimed.id,
      }),
    )
  }
  return true
}

async function executeClaimedDeployment() {
  const claimed = claimNextInfrastructureOperation(
    configuration.CONTROL_STATE_PATH,
    'deploy-agent:deployment',
    3_600,
    new Date(),
    ['deploy', 'rollback'],
  )
  if (!claimed) return false
  const lease = {
    fencingToken: claimed.fencingToken,
    leaseOwner: 'deploy-agent:deployment',
  }
  const running = startInfrastructureOperation(configuration.CONTROL_STATE_PATH, claimed.id, lease)
  try {
    await executeDeploymentOperation(
      running,
      lease,
      listRecoveryBackups(configuration.CONTROL_STATE_PATH, 100),
      deploymentPlatform,
      {
        backupFreshnessSeconds: deployment.DEPLOYMENT_BACKUP_MAX_AGE_SECONDS,
        controlStatePath: configuration.CONTROL_STATE_PATH,
        journalPath: deployment.DEPLOYMENT_JOURNAL_PATH,
        leaseSeconds: 3_600,
        migrationPolicyPath: deployment.DEPLOYMENT_MIGRATION_POLICY_PATH,
        stabilizationSeconds: deployment.DEPLOYMENT_STABILIZATION_SECONDS,
      },
    )
    finishInfrastructureOperation(configuration.CONTROL_STATE_PATH, claimed.id, lease, {
      phase: 'deployment-verified',
      status: 'completed',
    })
  } catch (error: unknown) {
    const message = safeErrorAttributes(error).message
    finishInfrastructureOperation(configuration.CONTROL_STATE_PATH, claimed.id, lease, {
      errorSummary: message,
      phase: 'deployment-failed',
      status: 'failed',
    })
    console.error(
      JSON.stringify({
        event: 'deployment_operation_failed',
        message,
        operationId: claimed.id,
      }),
    )
  }
  return true
}

function reconcileInterruptedDeployments() {
  const interrupted = listInfrastructureOperations(configuration.CONTROL_STATE_PATH, {
    operationTypes: ['deploy', 'rollback'],
    statuses: ['needs-attention'],
  })
  for (const operation of interrupted) {
    requeueDeploymentOperationForReconciliation(configuration.CONTROL_STATE_PATH, operation.id)
  }
  return interrupted.length
}

let polling = false
let pollTimer: NodeJS.Timeout | undefined
async function poll() {
  if (polling) return
  polling = true
  try {
    reconcileInterruptedDeployments()
    while (true) {
      const recovered =
        configuration.RECOVERY_POLLING_ENABLED === 'true' ? await executeClaimedRecovery() : false
      const deployed =
        deployment.DEPLOYMENT_POLLING_ENABLED === 'true' ? await executeClaimedDeployment() : false
      if (!recovered && !deployed) break
    }
  } finally {
    polling = false
  }
}

if (
  configuration.RECOVERY_POLLING_ENABLED === 'true' ||
  deployment.DEPLOYMENT_POLLING_ENABLED === 'true'
) {
  pollTimer = setInterval(() => void poll(), 1_000)
  void poll()
}

const server = createServer(async (request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' })
    return
  }
  if (request.url === '/health' || request.url === '/capabilities') {
    const dockerReady = await pingDocker()
    sendJson(response, dockerReady ? 200 : 503, {
      allowedDockerRequests: [
        'GET /_ping',
        'GET /containers/<declared>/json',
        'GET /containers/<migration>/logs',
        'GET /images/<digest>/json',
        'POST /containers/<slot>/start|stop',
        'DELETE /containers/<inactive-slot>',
        'POST /containers/create?name=<inactive-slot>',
        'POST /containers/<openresty>/exec',
        'POST /containers/<openresty>/kill?signal=HUP',
        'POST /containers/<postgres>/stop',
        'POST /containers/<postgres>/start',
      ],
      contract: serviceIdentityContracts['deploy-agent'],
      deploymentEngine: 'phase-14-shared-blue-green',
      dockerReady,
      mode: configuration.SITE_RUNTIME_MODE,
      productionOperations: true,
      recoveryEngine: 'phase-13',
      recoveryOperations: true,
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
      deploymentOperations: true,
      event: 'deploy_agent_started',
      mode: configuration.SITE_RUNTIME_MODE,
      port: configuration.DEPLOY_AGENT_PORT,
      recoveryOperations: true,
    }),
  )
})

function shutdown() {
  if (pollTimer) clearInterval(pollTimer)
  server.close((error) => {
    if (error) {
      console.error(
        JSON.stringify({ event: 'deploy_agent_shutdown_failed', ...safeErrorAttributes(error) }),
      )
      process.exitCode = 1
      return
    }
    process.exitCode = 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
