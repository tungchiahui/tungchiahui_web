import { z } from 'zod'
import { defaultStartPayload, startPayloadSchema } from '../start/contracts'
import type { AccountSessionRepository } from './account-sessions'
import type { ApplicationJobRepository } from './application-jobs'
import type { ControlApiConfiguration } from './configuration'
import { ownerDatasetUpdateSchema } from './contracts'
import { verifyAccountPassword } from './owner-password'
import { FixedWindowRateLimiter } from './rate-limit'

const cookieName = 'site_session'
function tokenFrom(headers: Headers) {
  const value =
    (headers.get('cookie') ?? '')
      .split(';')
      .map((part) => part.trim())
      .find((part) => part.startsWith(`${cookieName}=`))
      ?.slice(cookieName.length + 1) ?? ''
  return /^[a-f0-9]{64}$/.test(value) ? value : ''
}
function cookie(token: string, production: boolean) {
  return `${cookieName}=${token}; Path=/; HttpOnly; SameSite=Strict${production ? '; Secure' : ''}${token ? '' : '; Max-Age=0'}`
}
function originAllowed(headers: Headers, mode: ControlApiConfiguration['mode']) {
  const origin = headers.get('origin')
  if (!origin) return false
  if (mode === 'production') return origin === 'https://www.tungchiahui.cn'
  try {
    const url = new URL(origin)
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.origin === origin
    )
  } catch {
    return false
  }
}

export function createAccountHttpHandler(
  configuration: ControlApiConfiguration,
  sessions: {
    findAccount(
      username: string,
    ): Promise<
      { id: string; username: string; role: 'owner' | 'user'; passwordHash: string } | undefined
    >
    createSession(accountId: string, credentialVersion: string): Promise<string>
    current(
      token: string,
    ): Promise<{ id: string; username: string; role: 'owner' | 'user' } | undefined>
    revoke(token: string): Promise<void>
    readStart(accountId: string): Promise<{ payload: unknown; revision: number } | undefined>
    updateStart(
      accountId: string,
      expectedRevision: number,
      payload: Readonly<Record<string, unknown>>,
      updatedBy: string,
    ): Promise<{ payload: unknown; revision: number } | undefined>
  } | null,
  datasets: Pick<ApplicationJobRepository, 'updateOwnerDataset'> | null,
) {
  const loginLimiter = new FixedWindowRateLimiter(5)
  let deriving = false
  return async (path: string, method: string, headers: Headers, body: Uint8Array) => {
    const isAuth = path === '/api/ops/auth/session'
    const isStart = path === '/api/ops/start/data'
    const datasetKey = /^\/api\/ops\/site\/datasets\/(tech_footprint|weight_loss)$/.exec(path)?.[1]
    if (!isAuth && !isStart && !datasetKey) return { status: 404, body: { error: 'not_found' } }
    if (method !== 'GET' && !originAllowed(headers, configuration.mode))
      return { status: 403, body: { error: 'origin_denied' } }
    if (!sessions) return { status: 503, body: { error: 'account_store_unavailable' } }
    const token = tokenFrom(headers)
    const account = token ? await sessions.current(token) : undefined
    if (isAuth) {
      if (method === 'GET')
        return {
          status: 200,
          body: {
            authenticated: Boolean(account),
            account: account ? { username: account.username, role: account.role } : null,
          },
        }
      if (method === 'DELETE') {
        if (token) await sessions.revoke(token)
        return {
          status: 200,
          body: { authenticated: false, account: null },
          headers: { 'set-cookie': cookie('', configuration.mode === 'production') },
        }
      }
      if (method !== 'POST')
        return {
          status: 405,
          body: { error: 'method_not_allowed' },
          headers: { allow: 'GET, POST, DELETE' },
        }
      if (!/^application\/json(?:\s*;.*)?$/i.test(headers.get('content-type') ?? ''))
        return { status: 415, body: { error: 'application_json_required' } }
      let input: { username: string; password: string }
      try {
        input = z
          .object({
            username: z.string().trim().min(1).max(80),
            password: z.string().min(8).max(256),
          })
          .strict()
          .parse(JSON.parse(Buffer.from(body).toString('utf8')) as unknown)
      } catch (error: unknown) {
        if (error instanceof SyntaxError) return { status: 400, body: { error: 'malformed_json' } }
        throw error
      }
      const rate = loginLimiter.consume(`account-login:${input.username.toLowerCase()}`)
      if (!rate.allowed || deriving)
        return {
          status: 429,
          body: { error: 'rate_limit_exceeded' },
          headers: { 'retry-after': String(rate.retryAfterSeconds) },
        }
      const found = await sessions.findAccount(input.username)
      if (!found) return { status: 401, body: { error: 'invalid_credentials' } }
      deriving = true
      let valid = false
      try {
        valid = await verifyAccountPassword(input.password, found.passwordHash)
      } finally {
        deriving = false
      }
      if (!valid) return { status: 401, body: { error: 'invalid_credentials' } }
      if (token) await sessions.revoke(token)
      const created = await sessions.createSession(found.id, found.passwordHash)
      return {
        status: 200,
        body: { authenticated: true, account: { username: found.username, role: found.role } },
        headers: { 'set-cookie': cookie(created, configuration.mode === 'production') },
      }
    }
    if (datasetKey) {
      if (method !== 'PUT')
        return { status: 405, body: { error: 'method_not_allowed' }, headers: { allow: 'PUT' } }
      if (account?.role !== 'owner') return { status: 403, body: { error: 'owner_required' } }
      if (!datasets) return { status: 503, body: { error: 'dataset_store_unavailable' } }
      const input = z
        .object({ expectedRevision: z.number().int().nonnegative(), payload: z.unknown() })
        .strict()
        .parse(JSON.parse(Buffer.from(body).toString('utf8')) as unknown)
      const update = ownerDatasetUpdateSchema.parse({ ...input, datasetKey })
      const saved = await datasets.updateOwnerDataset(update, {
        id: account.id,
        kind: 'owner',
        capabilities: ['owner-dataset:write'],
      })
      return {
        status: 200,
        body: { dataset: { payload: saved.payload, revision: saved.revision } },
      }
    }
    if (method !== 'GET' && method !== 'PUT')
      return { status: 405, body: { error: 'method_not_allowed' }, headers: { allow: 'GET, PUT' } }
    const payload = account ? await sessions.readStart(account.id) : undefined
    const dataset = payload
      ? { payload: startPayloadSchema.parse(payload.payload), revision: payload.revision }
      : { payload: defaultStartPayload, revision: 0 }
    if (method === 'GET')
      return {
        status: 200,
        body: {
          authenticated: Boolean(account),
          account: account ? { username: account.username, role: account.role } : null,
          dataset,
        },
      }
    if (!account) return { status: 401, body: { error: 'session_required' } }
    if (!/^application\/json(?:\s*;.*)?$/i.test(headers.get('content-type') ?? ''))
      return { status: 415, body: { error: 'application_json_required' } }
    const input = z
      .object({ expectedRevision: z.number().int().nonnegative(), payload: startPayloadSchema })
      .strict()
      .parse(JSON.parse(Buffer.from(body).toString('utf8')) as unknown)
    const saved = await sessions.updateStart(
      account.id,
      input.expectedRevision,
      input.payload,
      account.username,
    )
    if (!saved) return { status: 409, body: { error: 'revision_conflict' } }
    return {
      status: 200,
      body: {
        authenticated: true,
        account: { username: account.username, role: account.role },
        dataset: { payload: startPayloadSchema.parse(saved.payload), revision: saved.revision },
      },
    }
  }
}
