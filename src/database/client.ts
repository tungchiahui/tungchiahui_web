import { drizzle } from 'drizzle-orm/node-postgres'
import { Pool } from 'pg'

import { emitTelemetry, safeErrorAttributes } from '../observability/telemetry'
import { parseDatabaseConnectionConfig } from './config'
import { persistenceSchema } from './schema'

export function createDatabaseClient(input: unknown) {
  const configuration = parseDatabaseConnectionConfig(input)
  const pool = new Pool({
    application_name: configuration.applicationName,
    connectionTimeoutMillis: configuration.connectionTimeoutMilliseconds,
    connectionString: configuration.connectionString,
    max: configuration.maxConnections,
    query_timeout: configuration.queryTimeoutMilliseconds,
  })
  pool.on('error', (error) => {
    emitTelemetry({
      attributes: {
        application_name: configuration.applicationName,
        ...safeErrorAttributes(error),
      },
      component: 'postgresql',
      event: 'idle_client_error',
      level: 'error',
    })
  })
  const database = drizzle({ client: pool, schema: persistenceSchema })

  return Object.freeze({
    close: () => pool.end(),
    database,
    pool,
  })
}
