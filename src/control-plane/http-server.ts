import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'

import { z } from 'zod'

import {
  ApplicationJobIdempotencyConflictError,
  ApplicationJobRepository,
  ApplicationJobStoreUnavailableError,
  OwnerDatasetRevisionConflictError,
} from './application-jobs'
import {
  AuthenticationError,
  AuthorizationError,
  authenticateControlRequest,
  requireCapability,
} from './auth'
import type { ControlApiConfiguration } from './configuration'
import {
  type ActorIdentity,
  applicationJobCreateSchema,
  type Capability,
  infrastructureOperationRequestSchema,
  ownerDatasetPathSchema,
  ownerDatasetUpdateSchema,
  serviceIdentityContracts,
  translationJobCreateSchema,
} from './contracts'
import {
  appendControlAuditEvent,
  ControlStateConflictError,
  consumeControlNonce,
  createInfrastructureOperation,
  getInfrastructureOperation,
  readControlState,
} from './control-state'
import { FixedWindowRateLimiter } from './rate-limit'
import {
  TranslationArticleNotFoundError,
  TranslationControlRepository,
  TranslationJobNotFoundError,
} from './translation-jobs'

const idempotencyKeySchema = z
  .string()
  .trim()
  .min(8)
  .max(200)
  .regex(/^[A-Za-z0-9._:-]+$/)
const jsonContentTypeSchema = z.string().regex(/^application\/json(?:\s*;.*)?$/i)
const maximumBodyBytes = 1024 * 1024

type JsonResponse = Readonly<{
  body: unknown
  headers?: Readonly<Record<string, string>>
  status: number
}>

function requestHeaders(request: IncomingMessage) {
  const headers = new Headers()
  for (const [name, value] of Object.entries(request.headers)) {
    if (typeof value === 'string') {
      headers.set(name, value)
    } else if (value) {
      headers.set(name, value.join(', '))
    }
  }
  return headers
}

async function readRequestBody(request: IncomingMessage) {
  const chunks: Uint8Array[] = []
  let size = 0
  for await (const chunk of request) {
    const bytes = typeof chunk === 'string' ? Buffer.from(chunk) : new Uint8Array(chunk)
    size += bytes.byteLength
    if (size > maximumBodyBytes) {
      throw new HttpError(413, 'payload_too_large')
    }
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

function parseJsonBody(body: Uint8Array, contentType: string | null) {
  if (!jsonContentTypeSchema.safeParse(contentType).success) {
    throw new HttpError(415, 'application_json_required')
  }
  try {
    return JSON.parse(Buffer.from(body).toString('utf8')) as unknown
  } catch {
    throw new HttpError(400, 'malformed_json')
  }
}

function sendJson(response: ServerResponse, payload: JsonResponse) {
  response.statusCode = payload.status
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('x-content-type-options', 'nosniff')
  for (const [name, value] of Object.entries(payload.headers ?? {})) {
    response.setHeader(name, value)
  }
  response.end(JSON.stringify(payload.body))
}

class HttpError extends Error {
  override readonly name = 'HttpError'
  readonly status: number

  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

function routeShape(pathname: string) {
  if (pathname === '/api/ops/status') {
    return Object.freeze({ allow: 'GET', kind: 'status' as const })
  }
  if (pathname === '/api/ops/application-jobs') {
    return Object.freeze({ allow: 'POST', kind: 'application-job-create' as const })
  }
  if (pathname === '/api/ops/translations') {
    return Object.freeze({ allow: 'POST', kind: 'translation-create' as const })
  }
  if (pathname === '/api/ops/translations/status') {
    return Object.freeze({ allow: 'GET', kind: 'translation-list' as const })
  }
  const translationCancellation = /^\/api\/ops\/translations\/([^/]+)\/cancel$/.exec(pathname)
  if (translationCancellation?.[1]) {
    return Object.freeze({
      allow: 'POST',
      id: translationCancellation[1],
      kind: 'translation-cancel' as const,
    })
  }
  const translationJob = /^\/api\/ops\/translations\/([^/]+)$/.exec(pathname)
  if (translationJob?.[1]) {
    return Object.freeze({
      allow: 'GET',
      id: translationJob[1],
      kind: 'translation-read' as const,
    })
  }
  const applicationJob = /^\/api\/ops\/application-jobs\/([^/]+)$/.exec(pathname)
  if (applicationJob?.[1]) {
    return Object.freeze({
      allow: 'GET',
      id: applicationJob[1],
      kind: 'application-job-read' as const,
    })
  }
  if (pathname === '/api/ops/infrastructure-operations') {
    return Object.freeze({ allow: 'POST', kind: 'infrastructure-operation-create' as const })
  }
  const infrastructureOperation = /^\/api\/ops\/infrastructure-operations\/([^/]+)$/.exec(pathname)
  if (infrastructureOperation?.[1]) {
    return Object.freeze({
      allow: 'GET',
      id: infrastructureOperation[1],
      kind: 'infrastructure-operation-read' as const,
    })
  }
  const dataset = /^\/api\/ops\/datasets\/([^/]+)$/.exec(pathname)
  if (dataset?.[1]) {
    return Object.freeze({ allow: 'PUT', datasetKey: dataset[1], kind: 'dataset-update' as const })
  }
  return null
}

function auditFailure(
  configuration: ControlApiConfiguration,
  actorId: string,
  eventType: string,
  outcome: 'denied' | 'failed',
  details: Readonly<Record<string, unknown>>,
) {
  appendControlAuditEvent(configuration.statePath, {
    actorId,
    createdAt: new Date().toISOString(),
    details,
    eventType,
    operationId: null,
    outcome,
  })
}

function auditAuthorization(
  configuration: ControlApiConfiguration,
  actor: ActorIdentity,
  capability: Capability,
  method: string,
  path: string,
) {
  appendControlAuditEvent(configuration.statePath, {
    actorId: actor.id,
    createdAt: new Date().toISOString(),
    details: { actorKind: actor.kind, capability, method, path },
    eventType: 'control_request_authorized',
    operationId: null,
    outcome: 'accepted',
  })
}

function errorResponse(error: unknown): JsonResponse {
  if (error instanceof HttpError) {
    return { body: { error: error.message }, status: error.status }
  }
  if (error instanceof AuthenticationError) {
    return { body: { error: error.code }, status: 401 }
  }
  if (error instanceof AuthorizationError) {
    return { body: { error: 'capability_denied' }, status: 403 }
  }
  if (error instanceof z.ZodError) {
    return { body: { error: 'validation_failed', issues: error.issues }, status: 400 }
  }
  if (
    error instanceof ApplicationJobIdempotencyConflictError ||
    error instanceof ControlStateConflictError
  ) {
    return { body: { error: 'idempotency_conflict' }, status: 409 }
  }
  if (error instanceof OwnerDatasetRevisionConflictError) {
    return {
      body: { currentRevision: error.currentRevision, error: 'revision_conflict' },
      status: 409,
    }
  }
  if (
    error instanceof TranslationArticleNotFoundError ||
    error instanceof TranslationJobNotFoundError
  ) {
    return { body: { error: 'translation_job_not_found' }, status: 404 }
  }
  if (error instanceof ApplicationJobStoreUnavailableError) {
    return { body: { error: 'application_job_store_unavailable' }, status: 503 }
  }
  return { body: { error: 'internal_error' }, status: 500 }
}

export function createControlApiServer(configuration: ControlApiConfiguration) {
  const applicationJobs = configuration.databaseUrl
    ? new ApplicationJobRepository(configuration.databaseUrl)
    : null
  const translationJobs = configuration.databaseUrl
    ? new TranslationControlRepository(configuration.databaseUrl)
    : null
  const rateLimiter = new FixedWindowRateLimiter(configuration.rateLimitPerMinute)

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? '/', 'http://control-api')
    const canonicalPath = `${url.pathname}${url.search}`

    if (url.pathname === '/health') {
      if (request.method !== 'GET') {
        sendJson(response, {
          body: { error: 'method_not_allowed' },
          headers: { allow: 'GET' },
          status: 405,
        })
        return
      }
      sendJson(response, {
        body: {
          controlState: readControlState(configuration.statePath),
          mode: configuration.mode,
          service: 'control-api',
          status: 'ok',
        },
        status: 200,
      })
      return
    }

    const route = routeShape(url.pathname)
    if (!route) {
      sendJson(response, { body: { error: 'not_found' }, status: 404 })
      return
    }
    if (request.method !== route.allow) {
      sendJson(response, {
        body: { error: 'method_not_allowed' },
        headers: { allow: route.allow },
        status: 405,
      })
      return
    }

    const clientIdentity = request.socket.remoteAddress ?? 'unknown'
    const rate = rateLimiter.consume(clientIdentity)
    response.setHeader('x-ratelimit-limit', String(rate.limit))
    response.setHeader('x-ratelimit-remaining', String(rate.remaining))
    if (!rate.allowed) {
      auditFailure(configuration, 'anonymous', 'rate_limit_denied', 'denied', {
        method: request.method,
        path: url.pathname,
      })
      sendJson(response, {
        body: { error: 'rate_limit_exceeded' },
        headers: { 'retry-after': String(rate.retryAfterSeconds) },
        status: 429,
      })
      return
    }

    const headers = requestHeaders(request)
    let actorId = 'anonymous'
    try {
      const body = await readRequestBody(request)
      const actor = await authenticateControlRequest(
        {
          body,
          headers,
          method: request.method,
          now: new Date(),
          path: canonicalPath,
        },
        configuration.authentication,
        {
          consumeNonce: (nonce) => consumeControlNonce(configuration.statePath, nonce),
        },
      )
      actorId = actor.id

      switch (route.kind) {
        case 'status': {
          requireCapability(actor, 'status:read')
          auditAuthorization(configuration, actor, 'status:read', request.method, url.pathname)
          const availability = applicationJobs
            ? await applicationJobs.availability()
            : { available: false as const, error: 'database_not_configured' }
          sendJson(response, {
            body: {
              applicationJobs: availability,
              controlState: readControlState(configuration.statePath),
              deployAgent: 'fake',
              identityContracts: serviceIdentityContracts,
              mode: configuration.mode,
              productionOperations: false,
            },
            status: 200,
          })
          return
        }
        case 'application-job-create': {
          requireCapability(actor, 'application-job:create')
          if (!applicationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          const parsedBody = applicationJobCreateSchema.parse(
            parseJsonBody(body, headers.get('content-type')),
          )
          const idempotencyKey = idempotencyKeySchema.parse(headers.get('idempotency-key'))
          auditAuthorization(
            configuration,
            actor,
            'application-job:create',
            request.method,
            url.pathname,
          )
          const result = await applicationJobs.createJob(parsedBody, actor, idempotencyKey)
          sendJson(response, { body: result, status: result.created ? 202 : 200 })
          return
        }
        case 'application-job-read': {
          requireCapability(actor, 'application-job:read')
          if (!applicationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          auditAuthorization(
            configuration,
            actor,
            'application-job:read',
            request.method,
            url.pathname,
          )
          const job = await applicationJobs.getJob(route.id)
          sendJson(
            response,
            job
              ? { body: { job }, status: 200 }
              : { body: { error: 'application_job_not_found' }, status: 404 },
          )
          return
        }
        case 'translation-create': {
          const parsedBody = translationJobCreateSchema.parse(
            parseJsonBody(body, headers.get('content-type')),
          )
          const capability =
            parsedBody.mode === 'dry-run' ? 'translation:dry-run' : 'translation:execute'
          requireCapability(actor, capability)
          if (!translationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          const idempotencyKey = idempotencyKeySchema.parse(headers.get('idempotency-key'))
          auditAuthorization(configuration, actor, capability, request.method, url.pathname)
          const result = await translationJobs.create(parsedBody, actor, idempotencyKey)
          sendJson(response, { body: result, status: result.created ? 202 : 200 })
          return
        }
        case 'translation-list': {
          requireCapability(actor, 'translation:read')
          if (!translationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          auditAuthorization(configuration, actor, 'translation:read', request.method, url.pathname)
          const jobs = await translationJobs.list(url.searchParams.get('limit') ?? 10)
          sendJson(response, { body: { jobs }, status: 200 })
          return
        }
        case 'translation-read': {
          requireCapability(actor, 'translation:read')
          if (!translationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          auditAuthorization(configuration, actor, 'translation:read', request.method, url.pathname)
          const job = await translationJobs.get(route.id)
          sendJson(
            response,
            job
              ? { body: { job }, status: 200 }
              : { body: { error: 'translation_job_not_found' }, status: 404 },
          )
          return
        }
        case 'translation-cancel': {
          requireCapability(actor, 'translation:cancel')
          if (!translationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          z.object({})
            .strict()
            .parse(parseJsonBody(body, headers.get('content-type')))
          auditAuthorization(
            configuration,
            actor,
            'translation:cancel',
            request.method,
            url.pathname,
          )
          const job = await translationJobs.cancel(route.id, actor)
          sendJson(response, { body: { job }, status: 200 })
          return
        }
        case 'infrastructure-operation-create': {
          requireCapability(actor, 'infrastructure-operation:create')
          const operationRequest = infrastructureOperationRequestSchema.parse(
            parseJsonBody(body, headers.get('content-type')),
          )
          const idempotencyKey = idempotencyKeySchema.parse(headers.get('idempotency-key'))
          auditAuthorization(
            configuration,
            actor,
            'infrastructure-operation:create',
            request.method,
            url.pathname,
          )
          const result = createInfrastructureOperation(
            configuration.statePath,
            operationRequest,
            actor,
            idempotencyKey,
          )
          sendJson(response, { body: result, status: result.created ? 202 : 200 })
          return
        }
        case 'infrastructure-operation-read': {
          requireCapability(actor, 'infrastructure-operation:read')
          auditAuthorization(
            configuration,
            actor,
            'infrastructure-operation:read',
            request.method,
            url.pathname,
          )
          const operation = getInfrastructureOperation(configuration.statePath, route.id)
          sendJson(
            response,
            operation
              ? { body: { operation }, status: 200 }
              : { body: { error: 'infrastructure_operation_not_found' }, status: 404 },
          )
          return
        }
        case 'dataset-update': {
          requireCapability(actor, 'owner-dataset:write')
          if (!applicationJobs) {
            throw new ApplicationJobStoreUnavailableError('Database is not configured')
          }
          const datasetKey = ownerDatasetPathSchema.parse(route.datasetKey)
          const bodyInput = z
            .object({ expectedRevision: z.number(), payload: z.unknown() })
            .strict()
            .parse(parseJsonBody(body, headers.get('content-type')))
          const update = ownerDatasetUpdateSchema.parse({ datasetKey, ...bodyInput })
          auditAuthorization(
            configuration,
            actor,
            'owner-dataset:write',
            request.method,
            url.pathname,
          )
          const dataset = await applicationJobs.updateOwnerDataset(update, actor)
          sendJson(response, { body: { dataset }, status: 200 })
          return
        }
      }
    } catch (error: unknown) {
      const mapped = errorResponse(error)
      const authenticationFailure = error instanceof AuthenticationError
      const authorizationFailure = error instanceof AuthorizationError
      auditFailure(
        configuration,
        authenticationFailure ? 'anonymous' : actorId,
        authenticationFailure
          ? 'authentication_failed'
          : authorizationFailure
            ? 'authorization_denied'
            : 'control_request_failed',
        mapped.status >= 500 ? 'failed' : 'denied',
        {
          code:
            error instanceof AuthenticationError
              ? error.code
              : authorizationFailure
                ? 'capability_denied'
                : mapped.status === 500
                  ? 'internal_error'
                  : 'request_rejected',
          method: request.method,
          path: url.pathname,
        },
      )
      sendJson(response, mapped)
    }
  })

  return Object.freeze({
    close: async () => {
      await Promise.all([applicationJobs?.close(), translationJobs?.close()])
      await new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()))
      })
    },
    server,
  })
}
