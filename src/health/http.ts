import type { IncomingMessage } from 'node:http'
import { z } from 'zod'
import type { ControlApiConfiguration } from '../control-plane/configuration'
import { ownerRequestOriginAllowed } from '../control-plane/owner-http'
import { FixedWindowRateLimiter } from '../control-plane/rate-limit'
import { healthExchangeSchema, measurementInputSchema } from './contracts'
import { HealthConflict, type HealthRepository, HealthSourceProtected } from './repository'

async function readBody(request: IncomingMessage) {
  const chunks: Buffer[] = []
  let bytes = 0
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
    bytes += buffer.length
    if (bytes > 32 * 1024 * 1024) throw new Error('health_payload_too_large')
    chunks.push(buffer)
  }
  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as unknown
}
export function createHealthHttpHandler(
  configuration: Pick<ControlApiConfiguration, 'mode'>,
  sessions: {
    current(token: string): Promise<{ id: string; role: 'owner' | 'user' } | undefined>
  } | null,
  repository: HealthRepository | null,
) {
  const limiter = new FixedWindowRateLimiter(120)
  return async (request: IncomingMessage, headers: Headers) => {
    const respond = (status: number, body: unknown) => ({
      status,
      body,
      headers: { 'cache-control': 'private, no-store' },
    })
    try {
      const cookies = (headers.get('cookie') ?? '')
        .split(';')
        .map((part) => part.trim())
        .filter((part) => part.startsWith('site_session='))
      const token = cookies.length === 1 ? cookies[0]?.slice('site_session='.length) : undefined
      const account =
        token && /^[a-f0-9]{64}$/.test(token) ? await sessions?.current(token) : undefined
      if (!account) return respond(401, { error: 'session_required' })
      if (account.role !== 'owner') return respond(403, { error: 'owner_required' })
      if (request.method !== 'GET' && !ownerRequestOriginAllowed(headers, configuration.mode))
        return respond(403, { error: 'origin_denied' })
      if (!limiter.consume(account.id).allowed)
        return respond(429, { error: 'rate_limit_exceeded' })
      if (!repository) return respond(503, { error: 'health_store_unavailable' })
      const path = new URL(request.url ?? '/', 'http://control-api').pathname
      if (path === '/api/ops/health/snapshot' && request.method === 'GET')
        return respond(200, await repository.snapshot())
      if (!['POST', 'PUT', 'DELETE', 'PATCH'].includes(request.method ?? ''))
        return respond(405, { error: 'method_not_allowed' })
      if (!/^application\/json(?:\s*;.*)?$/i.test(headers.get('content-type') ?? ''))
        return respond(415, { error: 'application_json_required' })
      const body = await readBody(request)
      if (path === '/api/ops/health/import' && request.method === 'POST') {
        const input = z
          .object({
            file: healthExchangeSchema,
            expectedRevision: z.number().int().nonnegative().optional(),
          })
          .strict()
          .parse(body)
        return respond(200, await repository.importExchange(input.file, input.expectedRevision))
      }
      if (path === '/api/ops/health/measurements' && request.method === 'POST') {
        const input = z
          .object({ id: z.uuid(), measurement: measurementInputSchema })
          .strict()
          .parse(body)
        return respond(201, await repository.save(null, input.measurement, 0, input.id))
      }
      const match = /^\/api\/ops\/health\/measurements\/([^/]+)$/.exec(path)
      if (!match) return respond(404, { error: 'not_found' })
      const id = z.uuid().parse(match[1])
      if (request.method === 'PUT') {
        const input = z
          .object({
            measurement: measurementInputSchema,
            expectedRevision: z.number().int().nonnegative(),
          })
          .strict()
          .parse(body)
        return respond(200, await repository.save(id, input.measurement, input.expectedRevision))
      }
      if (request.method === 'DELETE') {
        const input = z
          .object({ expectedRevision: z.number().int().nonnegative() })
          .strict()
          .parse(body)
        await repository.remove(id, input.expectedRevision)
        return respond(200, { deleted: true })
      }
      if (request.method === 'PATCH') {
        const input = z
          .object({
            expectedRevision: z.number().int().nonnegative(),
            note: z.string().trim().max(10000).nullable(),
            excluded: z.boolean(),
          })
          .strict()
          .parse(body)
        return respond(
          200,
          await repository.annotate(id, input.expectedRevision, input.note, input.excluded),
        )
      }
      return respond(405, { error: 'method_not_allowed' })
    } catch (error: unknown) {
      if (error instanceof HealthConflict)
        return respond(409, { error: 'health_revision_conflict' })
      if (error instanceof HealthSourceProtected)
        return respond(403, { error: 'health_source_protected' })
      if (error instanceof z.ZodError || error instanceof SyntaxError)
        return respond(400, { error: 'health_invalid_input' })
      if (error instanceof Error && error.message === 'health_payload_too_large')
        return respond(413, { error: 'health_payload_too_large' })
      return respond(503, { error: 'health_unavailable' })
    }
  }
}
