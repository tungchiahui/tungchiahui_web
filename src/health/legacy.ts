import { z } from 'zod'
import { createDatabaseClient } from '../database/client'
import { weightLossPayloadSchema } from '../personal/contracts'

// Retained rollback releases read the unified table through this private projection.
export class LegacyHealthRepository {
  readonly client: ReturnType<typeof createDatabaseClient>
  constructor(connectionString: string) {
    this.client = createDatabaseClient({
      connectionString,
      applicationName: 'health-compatibility',
      maxConnections: 2,
    })
  }
  close() {
    return this.client.close()
  }
  async read() {
    return this.client.database.transaction(async (tx) => {
      const { sql } = await import('drizzle-orm')
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const relation = await tx.execute(
        sql`SELECT to_regclass('app.weight_loss_private_compat') IS NOT NULL AS migrated`,
      )
      const migrated = relation.rows[0]?.migrated === true
      const result = migrated
        ? await tx.execute(sql`SELECT payload, revision FROM app.weight_loss_private_compat`)
        : await tx.execute(
            sql`SELECT payload, revision FROM app.owner_managed_datasets WHERE dataset_key = 'weight_loss'`,
          )
      const row = result.rows[0]
      return {
        migrated,
        dataset: row
          ? {
              payload: weightLossPayloadSchema.parse(row.payload),
              revision: z.coerce.number().int().nonnegative().parse(row.revision),
            }
          : null,
      }
    })
  }
}
