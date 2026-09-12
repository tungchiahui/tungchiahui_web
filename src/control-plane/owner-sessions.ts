import { randomBytes } from 'node:crypto'
import { and, eq, gt, lte, sql } from 'drizzle-orm'
import { createDatabaseClient } from '../database/client'
import { ownerSessions } from '../database/schema'
import { ownerDigest } from './owner-password'

export class OwnerSessionRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>

  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'owner-sessions',
      connectionString,
      maxConnections: 2,
    })
  }

  close() {
    return this.#client.close()
  }

  async create(credential: string) {
    const token = randomBytes(32).toString('hex')
    await this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.delete(ownerSessions).where(lte(ownerSessions.expiresAt, new Date()))
      await tx.insert(ownerSessions).values({
        tokenHash: ownerDigest(token),
        credentialVersion: ownerDigest(credential),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      })
    })
    return token
  }

  async valid(token: string, credential: string) {
    return this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const rows = await tx
        .select({ expiresAt: ownerSessions.expiresAt })
        .from(ownerSessions)
        .where(
          and(
            eq(ownerSessions.tokenHash, ownerDigest(token)),
            eq(ownerSessions.credentialVersion, ownerDigest(credential)),
            gt(ownerSessions.expiresAt, new Date()),
          ),
        )
        .limit(1)
      return rows.length === 1
    })
  }

  async revoke(token: string) {
    await this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.delete(ownerSessions).where(eq(ownerSessions.tokenHash, ownerDigest(token)))
    })
  }
}
