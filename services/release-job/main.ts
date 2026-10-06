import { z } from 'zod'
import {
  getInfrastructureOperation,
  listRecoveryBackups,
  readDeploymentState,
} from '../../src/control-plane/control-state'
import { parseDeploymentConfiguration } from '../../src/deployment/configuration'
import { DockerDeploymentPlatform } from '../../src/deployment/docker-platform'
import { executeDeploymentOperation } from '../../src/deployment/engine'

async function main() {
  process.umask(0o007)
  const [operationId, leaseOwner, fence, mode] = process.argv.slice(2)
  const id = z.uuid().parse(operationId)
  const lease = {
    leaseOwner: z.string().min(1).parse(leaseOwner),
    fencingToken: z.coerce.number().int().positive().parse(fence),
  }
  const path = z.string().startsWith('/control-state/').parse(process.env.CONTROL_STATE_PATH)
  const operation = getInfrastructureOperation(path, id)
  if (
    operation?.status !== 'running' ||
    operation.leaseOwner !== lease.leaseOwner ||
    operation.fencingToken !== lease.fencingToken ||
    !operation.leaseExpiresAt ||
    operation.leaseExpiresAt <= new Date().toISOString()
  )
    throw new Error('Release worker has no active fenced operation')
  const configuration = parseDeploymentConfiguration(process.env)
  const platform = new DockerDeploymentPlatform(
    configuration,
    z.string().startsWith('/run/deploy-capability/').parse(process.env.DOCKER_SOCKET_PATH),
  )
  const runtime = readDeploymentState(path)
  const executing =
    mode === 'compensate'
      ? {
          ...operation,
          phase: 'executing',
          operationType: 'rollback' as const,
          target: { targetSha: runtime.lastSha, targetDigest: runtime.lastDigest },
        }
      : operation
  if (mode === 'verify') {
    const active = {
      sha: z.string().parse(runtime.currentSha),
      digest: z.string().parse(runtime.currentDigest),
      slot: z.enum(['blue', 'green']).parse(runtime.activeSlot),
    }
    await platform.smokeRelease(active)
    await platform.smokePublicEntry(active)
    return
  }
  await executeDeploymentOperation(executing, lease, listRecoveryBackups(path, 100), platform, {
    backupFreshnessSeconds: configuration.DEPLOYMENT_BACKUP_MAX_AGE_SECONDS,
    controlStatePath: path,
    journalPath: configuration.DEPLOYMENT_JOURNAL_PATH,
    leaseSeconds: 3600,
    migrationPolicyPath: configuration.DEPLOYMENT_MIGRATION_POLICY_PATH,
  })
}
void main().catch(() => {
  console.error(JSON.stringify({ event: 'release_job_failed' }))
  process.exitCode = 1
})
