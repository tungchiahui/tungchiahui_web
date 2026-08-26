import { randomUUID } from 'node:crypto'

import { z } from 'zod'

export const telemetryComponentSchema = z.enum([
  'backup',
  'content-worker',
  'control-api',
  'deploy-agent',
  'host',
  'nextjs',
  'observability-agent',
  'openresty',
  'pgbouncer',
  'postgresql',
  's3',
])

export type TelemetryComponent = z.infer<typeof telemetryComponentSchema>

const telemetryLevelSchema = z.enum(['debug', 'info', 'warn', 'error'])
const safeAttributeKeySchema = z
  .string()
  .regex(/^[a-z][a-z0-9_]{0,63}$/)
  .refine(
    (key) =>
      !/(?:authorization|cookie|credential|password|private_key|secret|token|connection_string)/u.test(
        key,
      ),
    'Sensitive telemetry attribute name is forbidden',
  )
const safeScalarSchema = z.union([
  z.boolean(),
  z.number().finite(),
  z.string().max(500).transform(redactTelemetryText),
  z.null(),
])
const telemetryAttributesSchema = z.record(safeAttributeKeySchema, safeScalarSchema)

const sensitiveValuePatterns = [
  /\bBearer\s+[A-Za-z0-9._~+/=-]+/giu,
  /\b(?:postgres|postgresql):\/\/[^\s"']+/giu,
  /\bhttps?:\/\/[^\s/@"']+:[^\s/@"']+@[^\s"']+/giu,
  /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/gu,
  /\bage-secret-key-[A-Za-z0-9-]+/giu,
  /\b(?:gh[oprsu]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,})/gu,
  /\bX-Amz-(?:Credential|Security-Token|Signature)=[^&\s"']+/giu,
  /\b(?:authorization|cookie|password|secret|token)\s*[:=]\s*[^\s,;]+/giu,
] as const

export function redactTelemetryText(value: string) {
  let redacted = value
  for (const pattern of sensitiveValuePatterns) redacted = redacted.replace(pattern, '[REDACTED]')
  return redacted.slice(0, 500)
}

export function safeErrorAttributes(error: unknown) {
  if (!(error instanceof Error)) {
    return Object.freeze({ error_type: 'UnknownError', message: 'unknown error' })
  }
  return Object.freeze({
    error_type: error.name.slice(0, 100),
    message: redactTelemetryText(error.message),
  })
}

export type TelemetryEvent = Readonly<{
  attributes?: Readonly<Record<string, boolean | number | string | null>>
  component: TelemetryComponent
  event: string
  level: z.infer<typeof telemetryLevelSchema>
  requestId?: string
  timestamp?: string
}>

export function serializeTelemetryEvent(input: TelemetryEvent) {
  const attributes = telemetryAttributesSchema.parse(input.attributes ?? {})
  return JSON.stringify({
    attributes,
    component: telemetryComponentSchema.parse(input.component),
    event: z
      .string()
      .regex(/^[a-z][a-z0-9_]{1,99}$/)
      .parse(input.event),
    level: telemetryLevelSchema.parse(input.level),
    request_id: z
      .string()
      .min(8)
      .max(200)
      .parse(input.requestId ?? randomUUID()),
    timestamp: z.iso.datetime({ offset: true }).parse(input.timestamp ?? new Date().toISOString()),
  })
}

export function emitTelemetry(input: TelemetryEvent) {
  const line = serializeTelemetryEvent(input)
  if (input.level === 'error') {
    console.error(line)
    return
  }
  if (input.level === 'warn') {
    console.warn(line)
    return
  }
  console.log(line)
}

export function requestIdFromHeaders(headers: Headers) {
  const candidate = headers.get('x-request-id')
  return z
    .string()
    .regex(
      /^(?:[a-f0-9]{32}|[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12})$/iu,
    )
    .safeParse(candidate).success
    ? (candidate ?? randomUUID())
    : randomUUID()
}
