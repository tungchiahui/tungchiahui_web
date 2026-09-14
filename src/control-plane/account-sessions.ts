import { randomBytes } from 'node:crypto'
import { and, eq, gt, lte, sql } from 'drizzle-orm'
import { createDatabaseClient } from '../database/client'
import { accountSessions, accounts, startDatasets } from '../database/schema'
import type { JsonValue } from '../domain/persistence'
import { ownerDigest } from './owner-password'

export class AccountSessionRepository {
  readonly #client: ReturnType<typeof createDatabaseClient>
  constructor(connectionString: string) {
    this.#client = createDatabaseClient({
      applicationName: 'account-sessions',
      connectionString,
      maxConnections: 2,
    })
  }
  close() {
    return this.#client.close()
  }
  async findAccount(username: string) {
    return this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const rows = await tx
        .select({
          id: accounts.id,
          username: accounts.username,
          role: accounts.role,
          passwordHash: accounts.passwordHash,
          disabled: accounts.disabled,
        })
        .from(accounts)
        .where(eq(accounts.username, username))
        .limit(1)
      const account = rows[0]
      return account && !account.disabled ? account : undefined
    })
  }
  async createSession(accountId: string, credentialVersion: string) {
    const token = randomBytes(32).toString('hex')
    await this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.delete(accountSessions).where(lte(accountSessions.expiresAt, new Date()))
      await tx.insert(accountSessions).values({
        tokenHash: ownerDigest(token),
        accountId,
        credentialVersion: ownerDigest(credentialVersion),
        expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000),
      })
    })
    return token
  }
  async current(token: string) {
    return this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const rows = await tx
        .select({
          id: accounts.id,
          username: accounts.username,
          role: accounts.role,
          passwordHash: accounts.passwordHash,
          credentialVersion: accountSessions.credentialVersion,
        })
        .from(accountSessions)
        .innerJoin(accounts, eq(accountSessions.accountId, accounts.id))
        .where(
          and(
            eq(accountSessions.tokenHash, ownerDigest(token)),
            gt(accountSessions.expiresAt, new Date()),
            eq(accounts.disabled, false),
          ),
        )
        .limit(1)
      const row = rows[0]
      return row && row.credentialVersion === ownerDigest(row.passwordHash) ? row : undefined
    })
  }
  async revoke(token: string) {
    await this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      await tx.delete(accountSessions).where(eq(accountSessions.tokenHash, ownerDigest(token)))
    })
  }
  async readStart(accountId: string) {
    return this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      return (
        await tx.select().from(startDatasets).where(eq(startDatasets.accountId, accountId)).limit(1)
      )[0]
    })
  }
  async updateStart(
    accountId: string,
    expectedRevision: number,
    payload: Readonly<Record<string, unknown>>,
    updatedBy: string,
  ) {
    return this.#client.database.transaction(async (tx) => {
      await tx.execute(sql`SET LOCAL ROLE site_control_api`)
      const rows = await tx
        .update(startDatasets)
        .set({
          payload: payload as Readonly<Record<string, JsonValue>>,
          revision: sql`${startDatasets.revision} + 1`,
          updatedBy,
          updatedAt: new Date(),
        })
        .where(
          and(eq(startDatasets.accountId, accountId), eq(startDatasets.revision, expectedRevision)),
        )
        .returning()
      return rows[0]
    })
  }
}
