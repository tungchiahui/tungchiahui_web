import { describe, expect, it } from 'vitest'

import { createAccountHttpHandler } from '../../src/control-plane/account-http'
import { localOwnerPasswordHash } from '../../src/control-plane/owner-password'
import { defaultStartPayload } from '../../src/start/contracts'

const configuration = { mode: 'test' } as never
const origin = new Headers({ origin: 'http://127.0.0.1:3000' })
const jsonHeaders = new Headers({
  'content-type': 'application/json',
  origin: 'http://127.0.0.1:3000',
})

function fixture() {
  const accounts = new Map([
    [
      'owner',
      {
        id: 'owner-id',
        username: 'owner',
        role: 'owner' as const,
        passwordHash: localOwnerPasswordHash,
        disabled: false,
        credentialVersion: '',
      },
    ],
    [
      'alice',
      {
        id: 'alice-id',
        username: 'alice',
        role: 'user' as const,
        passwordHash: localOwnerPasswordHash,
        disabled: false,
        credentialVersion: '',
      },
    ],
  ])
  const sessions = new Map<
    string,
    { account: typeof accounts extends Map<string, infer V> ? V : never; token: string }
  >()
  const datasets = new Map<string, { payload: typeof defaultStartPayload; revision: number }>()
  for (const account of accounts.values())
    datasets.set(account.id, { payload: structuredClone(defaultStartPayload), revision: 0 })
  const repository = {
    async findAccount(username: string) {
      return accounts.get(username)
    },
    async createSession(accountId: string) {
      const token = accountId === 'owner-id' ? 'a'.repeat(64) : 'b'.repeat(64)
      const account = [...accounts.values()].find((item) => item.id === accountId)
      if (!account) throw new Error('missing_account')
      sessions.set(token, { account, token })
      return token
    },
    async current(token: string) {
      return sessions.get(token)?.account
    },
    async revoke(token: string) {
      sessions.delete(token)
    },
    async readStart(accountId: string) {
      return datasets.get(accountId)
    },
    async updateStart(accountId: string, revision: number, payload: typeof defaultStartPayload) {
      const current = datasets.get(accountId)
      if (!current || current.revision !== revision) return undefined
      const saved = { payload, revision: revision + 1 }
      datasets.set(accountId, saved)
      return saved
    },
  }
  const datasetsStore = {
    async updateOwnerDataset() {
      throw new Error('unused')
    },
  }
  return {
    handler: createAccountHttpHandler(configuration, repository, datasetsStore),
    repository,
    datasets,
  }
}

async function request(
  handler: ReturnType<typeof createAccountHttpHandler>,
  path: string,
  method: string,
  headers: Headers,
  body: unknown = '',
) {
  return handler(
    path,
    method,
    headers,
    Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)),
  )
}

describe('unified account HTTP boundary', () => {
  it('serves default content anonymously and rejects writes', async () => {
    const { handler } = fixture()
    const read = await request(handler, '/api/ops/start/data', 'GET', origin)
    expect(read.status).toBe(200)
    expect(read.body).toMatchObject({
      authenticated: false,
      dataset: { revision: 0, payload: defaultStartPayload },
    })
    const write = await request(handler, '/api/ops/start/data', 'PUT', jsonHeaders, {
      expectedRevision: 0,
      payload: defaultStartPayload,
    })
    expect(write.status).toBe(401)
  })

  it('isolates user datasets and enforces owner-only global dataset writes', async () => {
    const { handler, datasets } = fixture()
    const login = await request(handler, '/api/ops/auth/session', 'POST', jsonHeaders, {
      username: 'alice',
      password: 'local-only-owner-password',
    })
    expect(login.status).toBe(200)
    const cookie = new Headers({
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:3000',
      cookie: `site_session=${
        String((login.headers as Record<string, string>)['set-cookie'])
          .split('=')[1]
          ?.split(';')[0] ?? ''
      }`,
    })
    const changed = structuredClone(defaultStartPayload)
    changed.detailed = true
    const saved = await request(handler, '/api/ops/start/data', 'PUT', cookie, {
      expectedRevision: 0,
      payload: changed,
    })
    expect(saved.status).toBe(200)
    expect(datasets.get('alice-id')?.payload.detailed).toBe(true)
    const global = await request(handler, '/api/ops/site/datasets/weight_loss', 'PUT', cookie, {
      expectedRevision: 0,
      payload: { version: 2, records: [] },
    })
    expect(global.status).toBe(403)
  })

  it('returns a CAS conflict for stale start revisions', async () => {
    const { handler } = fixture()
    const login = await request(handler, '/api/ops/auth/session', 'POST', jsonHeaders, {
      username: 'alice',
      password: 'local-only-owner-password',
    })
    const token =
      String((login.headers as Record<string, string>)['set-cookie']).match(
        /site_session=([a-f0-9]{64})/,
      )?.[1] ?? ''
    const headers = new Headers({
      'content-type': 'application/json',
      origin: 'http://127.0.0.1:3000',
      cookie: `site_session=${token}`,
    })
    expect(
      (
        await request(handler, '/api/ops/start/data', 'PUT', headers, {
          expectedRevision: 0,
          payload: defaultStartPayload,
        })
      ).status,
    ).toBe(200)
    expect(
      (
        await request(handler, '/api/ops/start/data', 'PUT', headers, {
          expectedRevision: 0,
          payload: defaultStartPayload,
        })
      ).status,
    ).toBe(409)
  })
})
