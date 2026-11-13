import { setTimeout as delay } from 'node:timers/promises'
import { z } from 'zod'
import {
  checkpointRecoveryOperation,
  getInfrastructureOperation,
  heartbeatInfrastructureOperation,
} from '../../src/control-plane/control-state'
import { parseRecoveryConfiguration } from '../../src/recovery/configuration'
import { executeDatabaseBackup, verifyMaintenanceBackup } from '../../src/recovery/engine'

async function main() {
  const configuration = parseRecoveryConfiguration(process.env)
  const mode = z.enum(['verify', 'backup']).parse(process.argv[2])
  const identity = z
    .string()
    .regex(/^[a-zA-Z0-9_-]{1,200}$/)
    .parse(process.argv[3])
  const operationId = z.uuid().parse(process.argv[4])
  const lease = {
    leaseOwner: z.string().parse(process.argv[5]),
    fencingToken: z.coerce.number().int().positive().parse(process.argv[6]),
  }
  heartbeatInfrastructureOperation(configuration.controlStatePath, operationId, lease, 3600)
  const operation = getInfrastructureOperation(configuration.controlStatePath, operationId)
  if (
    operation?.status !== 'running' ||
    operation.target.action !== 'postgres-image-upgrade' ||
    !operation.leaseExpiresAt ||
    operation.leaseExpiresAt <= new Date().toISOString()
  )
    throw new Error('A running fenced PostgreSQL maintenance operation is required')
  const startedAt = z.iso
    .datetime()
    .parse(operation.result?.backupStartedAt ?? new Date().toISOString())
  if (mode === 'backup' && !operation.result?.backupStartedAt)
    throw new Error('Backup intent checkpoint is missing')
  if (mode === 'backup')
    await delay(Math.max(0, Math.ceil(Date.parse(startedAt) / 1000) * 1000 - Date.now()))
  const result =
    mode === 'verify'
      ? await verifyMaintenanceBackup(configuration, identity)
      : operation.result?.postBackup
        ? await verifyMaintenanceBackup(
            configuration,
            z.object({ backupId: z.string() }).parse(operation.result.postBackup).backupId,
          )
        : (await executeDatabaseBackup(configuration, 'full', { reuseCompletedAfter: startedAt }))
            .backup
  heartbeatInfrastructureOperation(configuration.controlStatePath, operationId, lease, 3600)
  if (mode === 'backup')
    checkpointRecoveryOperation(
      configuration.controlStatePath,
      operationId,
      lease,
      operation.phase,
      { ...operation.result, postBackup: result },
      'postgres-image-upgrade',
    )
  console.log(JSON.stringify(result))
}
void main().catch(() => {
  console.error(JSON.stringify({ event: 'postgres_maintenance_recovery_failed' }))
  process.exitCode = 1
})
