import { z } from 'zod'

const databaseConnectionSchema = z.object({
  applicationName: z.string().min(1),
  connectionTimeoutMilliseconds: z.number().int().min(100).max(30_000).default(2_000),
  connectionString: z.url().refine(
    (value) => {
      const protocol = new URL(value).protocol
      return protocol === 'postgres:' || protocol === 'postgresql:'
    },
    { message: 'Expected a PostgreSQL connection URL' },
  ),
  maxConnections: z.number().int().min(1).max(20),
  queryTimeoutMilliseconds: z.number().int().min(100).max(120_000).default(30_000),
})

export type DatabaseConnectionConfig = Readonly<z.infer<typeof databaseConnectionSchema>>

export function parseDatabaseConnectionConfig(input: unknown): DatabaseConnectionConfig {
  return Object.freeze(databaseConnectionSchema.parse(input))
}
