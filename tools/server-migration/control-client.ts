import { randomUUID } from 'node:crypto'

import { z } from 'zod'

import { controlRequest } from '../control/client'

const inventoryHostSchema = z.string().regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/)

export async function createServerMigration(
  input: Readonly<{
    action: 'planned-migration' | 'provision-only'
    inventoryHost: string
    reason: string
  }>,
) {
  const inventoryHost = inventoryHostSchema.parse(input.inventoryHost)
  return controlRequest('/api/ops/infrastructure-operations', {
    body: {
      operationType: 'server-migration',
      reason: input.reason,
      target: { action: input.action, inventoryHost },
    },
    idempotencyKey: `server-migration:${input.action}:${inventoryHost}:${randomUUID()}`,
    method: 'POST',
    purpose: `server-migration-${input.action}-${inventoryHost}`,
  })
}
