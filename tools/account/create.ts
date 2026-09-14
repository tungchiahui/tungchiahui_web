import { stdin as input, stdout as output } from 'node:process'
import { createInterface } from 'node:readline/promises'
import { hashAccountPassword } from '../../src/control-plane/owner-password'
import { createDatabaseClient } from '../../src/database/client'
import { accounts, startDatasets } from '../../src/database/schema'
import { defaultStartPayload } from '../../src/start/contracts'

export async function createAccount(databaseUrl: string, username: string, role: 'owner' | 'user') {
  const readline = createInterface({ input, output })
  const password = await readline.question('Password: ')
  readline.close()
  const passwordHash = await hashAccountPassword(password)
  const client = createDatabaseClient({
    applicationName: 'site-account-create',
    connectionString: databaseUrl,
    maxConnections: 1,
  })
  try {
    const result = await client.database.transaction(async (tx) => {
      const account = (
        await tx
          .insert(accounts)
          .values({ username, role, passwordHash })
          .returning({ id: accounts.id, username: accounts.username, role: accounts.role })
      )[0]
      if (!account) throw new Error('account_creation_failed')
      await tx.insert(startDatasets).values({
        accountId: account.id,
        payload: defaultStartPayload,
        updatedBy: `account:${username}`,
      })
      return account
    })
    return result
  } finally {
    await client.close()
  }
}
