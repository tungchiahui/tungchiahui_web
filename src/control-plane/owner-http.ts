import { z } from 'zod'
import { techRecordKeySet } from '../personal/roadmap'
import type { ApplicationJobRepository } from './application-jobs'
import type { ControlApiConfiguration } from './configuration'
import { type ActorIdentity, ownerDatasetUpdateSchema } from './contracts'
import { verifyOwnerPassword } from './owner-password'
import type { OwnerSessionRepository } from './owner-sessions'
import { FixedWindowRateLimiter } from './rate-limit'

export const browserOwner: ActorIdentity = {
  id: 'site-owner',
  kind: 'owner',
  capabilities: ['owner-dataset:write'],
}
const cookieName = 'site_owner_session'

export function ownerRequestOriginAllowed(headers: Headers, mode: ControlApiConfiguration['mode']) {
  const origin = headers.get('origin')
  if (!origin) return false
  if (mode === 'production') return origin === 'https://www.tungchiahui.cn'
  try {
    const url = new URL(origin)
    // Only the hermetic development environment accepts variable loopback ports.
    return (
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      url.origin === origin
    )
  } catch {
    return false
  }
}

function readSession(headers: Headers) {
  const matches = (headers.get('cookie') ?? '')
    .split(';')
    .map((part) => part.trim())
    .filter((part) => part.startsWith(`${cookieName}=`))
  if (matches.length !== 1) return ''
  const value = matches[0]?.slice(cookieName.length + 1) ?? ''
  return /^[a-f0-9]{64}$/.test(value) ? value : ''
}

export function ownerSessionCookie(token: string, production: boolean) {
  return `${cookieName}=${token}; Path=/api/ops/owner; HttpOnly; SameSite=Strict${production ? '; Secure' : ''}${token ? '' : '; Max-Age=0'}`
}

export function createOwnerHttpHandler(
  configuration: ControlApiConfiguration,
  sessions: Pick<OwnerSessionRepository, 'create' | 'valid' | 'revoke'> | null,
  datasets: Pick<ApplicationJobRepository, 'updateOwnerDataset'> | null,
) {
  const loginLimiter = new FixedWindowRateLimiter(5)
  let deriving = false
  return async (path: string, method: string, headers: Headers, body: Uint8Array) => {
    const response = (status: number, data: unknown, extra: Record<string, string> = {}) => ({
      status,
      body: data,
      headers: extra,
    })
    const isSession = path === '/api/ops/owner/session'
    const datasetKey = /^\/api\/ops\/owner\/datasets\/(tech_footprint|weight_loss)$/.exec(path)?.[1]
    if (!isSession && !datasetKey) return response(404, { error: 'not_found' })
    const allowed = isSession ? ['GET', 'POST', 'DELETE'] : ['PUT']
    if (!allowed.includes(method))
      return response(405, { error: 'method_not_allowed' }, { allow: allowed.join(', ') })
    if (method !== 'GET' && !ownerRequestOriginAllowed(headers, configuration.mode))
      return response(403, { error: 'origin_denied' })
    const credential = configuration.ownerPasswordHash
    if (!credential)
      return response(isSession && method === 'GET' ? 200 : 503, {
        authenticated: false,
        enabled: false,
        error: 'owner_login_disabled',
      })
    if (!sessions || !datasets) return response(503, { error: 'owner_store_unavailable' })
    const token = readSession(headers)
    if (method === 'GET')
      return response(200, {
        enabled: true,
        authenticated: Boolean(token) && (await sessions.valid(token, credential)),
      })
    if (method === 'DELETE') {
      if (token) await sessions.revoke(token)
      return response(
        200,
        { authenticated: false },
        { 'set-cookie': ownerSessionCookie('', configuration.mode === 'production') },
      )
    }
    if (!/^application\/json(?:\s*;.*)?$/i.test(headers.get('content-type') ?? ''))
      return response(415, { error: 'application_json_required' })
    let input: unknown
    try {
      input = JSON.parse(Buffer.from(body).toString('utf8')) as unknown
    } catch {
      return response(400, { error: 'malformed_json' })
    }
    if (isSession) {
      const parsed = z
        .object({ password: z.string().min(1).max(256) })
        .strict()
        .parse(input)
      const rate = loginLimiter.consume('owner-login')
      if (!rate.allowed || deriving)
        return response(
          429,
          { error: 'rate_limit_exceeded' },
          { 'retry-after': String(rate.retryAfterSeconds) },
        )
      deriving = true
      let valid = false
      try {
        valid = await verifyOwnerPassword(parsed.password, credential)
      } finally {
        deriving = false
      }
      if (!valid) return response(401, { error: 'invalid_credentials' })
      if (token) await sessions.revoke(token)
      const created = await sessions.create(credential)
      return response(
        200,
        { authenticated: true },
        { 'set-cookie': ownerSessionCookie(created, configuration.mode === 'production') },
      )
    }
    if (!token || !(await sessions.valid(token, credential)))
      return response(401, { error: 'owner_session_required' })
    const updateBody = z
      .object({ expectedRevision: z.number().int().nonnegative(), payload: z.unknown() })
      .strict()
      .parse(input)
    const update = ownerDatasetUpdateSchema.parse({ ...updateBody, datasetKey })
    if (
      update.datasetKey === 'tech_footprint' &&
      !Object.keys(update.payload.records).every((key) => techRecordKeySet.has(key))
    ) {
      return response(400, { error: 'unknown_roadmap_task' })
    }
    const saved = await datasets.updateOwnerDataset(update, browserOwner)
    return response(200, { dataset: { payload: saved.payload, revision: saved.revision } })
  }
}
