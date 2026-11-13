import { controlRequest } from '../control/client'
import type {
  PostgresMaintenanceCommand,
  PostgresMaintenanceRetryCommand,
} from './postgres-command'

export function createPostgresMaintenance(command: PostgresMaintenanceCommand) {
  return controlRequest('/api/ops/infrastructure-operations', {
    body: { operationType: 'server-migration', reason: command.reason, target: command.target },
    idempotencyKey: command.idempotencyKey,
    method: 'POST',
    purpose: 'postgres-image-maintenance',
  })
}

export function retryPostgresMaintenance(command: PostgresMaintenanceRetryCommand) {
  return controlRequest(`/api/ops/infrastructure-operations/${command.operationId}/retry`, {
    body: { confirmation: command.confirmation, reason: command.reason },
    idempotencyKey: command.idempotencyKey,
    method: 'POST',
    purpose: 'postgres-image-maintenance-retry',
  })
}
