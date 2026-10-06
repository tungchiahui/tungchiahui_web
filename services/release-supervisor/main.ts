import { type ChildProcess, spawn } from 'node:child_process'
import { randomUUID } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import {
  getInfrastructureOperation,
  heartbeatInfrastructureOperation,
  listInfrastructureOperations,
  reconcileInfrastructureOperations,
  requeueDeploymentOperationForReconciliation,
} from '../../src/control-plane/control-state'
import { hostGenerationDirectory } from '../../src/host-release/artifacts'
import { hostSettingsSchema } from '../../src/host-release/contracts'
import { hostControlPath } from '../../src/host-release/coordinator'
import { runHostCommand } from '../../src/host-release/provision'
import {
  acquireHostExecutor,
  readHostRuntime,
  releaseHostExecutor,
} from '../../src/host-release/state'

async function main() {
  if (process.getuid?.() !== 0) throw new Error('Server administrator identity required')
  process.umask(0o007)
  const settings = hostSettingsSchema.parse(
    JSON.parse(
      readFileSync(process.argv[2] ?? '/etc/tungchiahui/host-runtime/settings.json', 'utf8'),
    ) as unknown,
  )
  const path = hostControlPath(settings)
  const owner = `deploy-agent:host:${randomUUID()}`
  while (!acquireHostExecutor(path, owner)) await delay(2000)
  let child: ChildProcess | undefined
  let stopping = false
  let leaseLost = false
  const stop = () => {
    stopping = true
    child?.kill('SIGTERM')
  }
  process.on('SIGTERM', stop)
  process.on('SIGINT', stop)
  const heartbeat = setInterval(() => {
    try {
      if (!acquireHostExecutor(path, owner)) {
        leaseLost = true
        stop()
      }
      for (const operation of listInfrastructureOperations(path, {
        operationTypes: ['deploy', 'rollback'],
        statuses: ['running'],
      })) {
        if (operation.leaseOwner === owner) {
          try {
            heartbeatInfrastructureOperation(
              path,
              operation.id,
              { leaseOwner: owner, fencingToken: operation.fencingToken },
              3600,
            )
          } catch (error: unknown) {
            const current = getInfrastructureOperation(path, operation.id)
            if (current?.status === 'running' || current?.status === 'claimed') throw error
          }
        }
      }
    } catch {
      leaseLost = true
      stop()
    }
  }, 10_000)
  try {
    reconcileInfrastructureOperations(path)
    const interrupted = listInfrastructureOperations(path, {
      operationTypes: ['deploy', 'rollback'],
      statuses: ['needs-attention'],
    })
    for (const operation of interrupted) {
      runHostCommand(
        'docker',
        ['rm', '--force', `${settings.projectName}-release-${operation.id}`],
        {},
        true,
      )
      requeueDeploymentOperationForReconciliation(path, operation.id)
    }
    while (!stopping) {
      const runtime = readHostRuntime(path)
      if (!runtime.current_sha) throw new Error('Host executor has no installed generation')
      const directory = hostGenerationDirectory(settings, runtime.current_sha)
      const code = await new Promise<number>((resolveExit, reject) => {
        const running = spawn(join(directory, 'node'), [join(directory, 'host-coordinator.cjs')], {
          env: {
            NODE_ENV: 'production',
            PATH: '/usr/sbin:/usr/bin:/sbin:/bin',
            HOST_RELEASE_SETTINGS: JSON.stringify(settings),
            HOST_RELEASE_OWNER: owner,
          },
          stdio: ['ignore', 'inherit', 'inherit'],
        })
        child = running
        running.once('error', reject)
        running.once('exit', (value) => resolveExit(value ?? 1))
      })
      child = undefined
      if (code !== 0 && !stopping) {
        // Do not abandon a job whose child exited mid-cutover. Expire only this supervisor's lease.
        releaseHostExecutor(path, owner)
        acquireHostExecutor(path, owner)
        reconcileInfrastructureOperations(path)
        for (const operation of listInfrastructureOperations(path, {
          operationTypes: ['deploy', 'rollback'],
          statuses: ['needs-attention'],
        })) {
          runHostCommand(
            'docker',
            ['rm', '--force', `${settings.projectName}-release-${operation.id}`],
            {},
            true,
          )
          requeueDeploymentOperationForReconciliation(path, operation.id)
        }
        console.error(JSON.stringify({ event: 'host_executor_child_restarted' }))
      }
      await delay(2000)
    }
  } finally {
    clearInterval(heartbeat)
    if (!leaseLost) releaseHostExecutor(path, owner)
  }
  if (leaseLost) throw new Error('Host executor lease was lost')
}
void main().catch(() => {
  console.error(JSON.stringify({ event: 'host_executor_stopped' }))
  process.exitCode = 1
})
