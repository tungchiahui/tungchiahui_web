import { resolve6 } from 'node:dns/promises'
import { readFileSync, statfsSync } from 'node:fs'
import { createServer, type ServerResponse } from 'node:http'
import { request as httpsRequest } from 'node:https'
import { connect } from 'node:net'

import { z } from 'zod'

import {
  AlertLifecycle,
  type AlertSignal,
  productionAlertRules,
} from '../../src/observability/policy'
import { emitTelemetry, safeErrorAttributes } from '../../src/observability/telemetry'

const configuration = z
  .object({
    OBSERVABILITY_ALERT_WEBHOOK_BEARER_TOKEN: z.string().min(16).optional(),
    OBSERVABILITY_ALERT_WEBHOOK_URL: z.url().startsWith('https://').optional(),
    OBSERVABILITY_BACKUP_MAX_AGE_SECONDS: z.coerce.number().int().positive(),
    OBSERVABILITY_CONTROL_URL: z.url(),
    OBSERVABILITY_DEPLOY_AGENT_URL: z.url(),
    OBSERVABILITY_DISK_CRITICAL_PERCENT: z.coerce.number().min(50).max(99),
    OBSERVABILITY_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
    OBSERVABILITY_INTERVAL_SECONDS: z.coerce.number().int().min(10).max(300),
    OBSERVABILITY_JOB_MAX_AGE_SECONDS: z.coerce.number().int().positive(),
    OBSERVABILITY_LATENCY_WARNING_MS: z.coerce.number().int().positive(),
    OBSERVABILITY_ORIGIN_HOSTNAME: z.string().min(1),
    OBSERVABILITY_ORIGIN_IPV6_REQUIRED: z
      .enum(['true', 'false'])
      .transform((value) => value === 'true'),
    OBSERVABILITY_ORIGIN_SERVER_NAME: z.string().min(1),
    OBSERVABILITY_ORIGIN_URL: z.url().startsWith('https://'),
    OBSERVABILITY_PGBOUNCER_HOST: z.string().min(1),
    OBSERVABILITY_PGBOUNCER_PORT: z.coerce.number().int().min(1).max(65_535),
    OBSERVABILITY_PORT: z.coerce.number().int().min(1024).max(65_535),
    OBSERVABILITY_PUBLIC_ASSET_PATH: z.string().startsWith('/'),
    OBSERVABILITY_PUBLIC_SERVER_NAME: z.string().min(1),
    OBSERVABILITY_PUBLIC_URL: z.url().startsWith('https://'),
    OBSERVABILITY_RESTORE_DRILL_MAX_AGE_SECONDS: z.coerce.number().int().positive(),
    OBSERVABILITY_RESTORE_DRILL_TIMESTAMP: z.iso.datetime({ offset: true }),
    OBSERVABILITY_TLS_CA_PATH: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().startsWith('/').optional(),
    ),
    OBSERVABILITY_WEB_URL: z.url(),
    OBSERVABILITY_WORKER_URL: z.url(),
    SITE_RUNTIME_MODE: z.literal('production'),
  })
  .superRefine((value, context) => {
    if (
      (value.OBSERVABILITY_ALERT_WEBHOOK_URL === undefined) !==
      (value.OBSERVABILITY_ALERT_WEBHOOK_BEARER_TOKEN === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message: 'Alert webhook URL and bearer token must be configured together',
        path: ['OBSERVABILITY_ALERT_WEBHOOK_URL'],
      })
    }
  })
  .parse(process.env)

type Probe = Readonly<{ durationMs: number; ok: boolean; status: number | null }>

function requestProbe(url: string, servername?: string): Promise<Probe> {
  const startedAt = performance.now()
  const parsed = new URL(url)
  return new Promise((resolveProbe) => {
    const request = httpsRequest(
      parsed,
      {
        ...(configuration.OBSERVABILITY_TLS_CA_PATH === undefined
          ? {}
          : { ca: readFileSync(configuration.OBSERVABILITY_TLS_CA_PATH) }),
        headers: { host: servername ?? parsed.hostname, 'user-agent': 'tungchiahui-readiness/1' },
        method: 'GET',
        servername: servername ?? parsed.hostname,
        timeout: 5_000,
      },
      (response) => {
        response.resume()
        response.once('end', () =>
          resolveProbe({
            durationMs: performance.now() - startedAt,
            ok: (response.statusCode ?? 500) >= 200 && (response.statusCode ?? 500) < 400,
            status: response.statusCode ?? null,
          }),
        )
      },
    )
    request.once('error', () =>
      resolveProbe({ durationMs: performance.now() - startedAt, ok: false, status: null }),
    )
    request.once('timeout', () => request.destroy(new Error('probe timed out')))
    request.end()
  })
}

async function jsonProbe(url: string) {
  const startedAt = performance.now()
  try {
    const response = await fetch(url, { signal: AbortSignal.timeout(5_000) })
    const body = (await response.json()) as unknown
    return Object.freeze({
      body,
      durationMs: performance.now() - startedAt,
      ok: response.ok,
      status: response.status,
    })
  } catch {
    return Object.freeze({
      body: null,
      durationMs: performance.now() - startedAt,
      ok: false,
      status: null,
    })
  }
}

function tcpProbe(host: string, port: number) {
  const startedAt = performance.now()
  return new Promise<Probe>((resolveProbe) => {
    const socket = connect({ host, port, timeout: 2_000 })
    const finish = (ok: boolean) => {
      socket.destroy()
      resolveProbe({ durationMs: performance.now() - startedAt, ok, status: null })
    }
    socket.once('connect', () => finish(true))
    socket.once('error', () => finish(false))
    socket.once('timeout', () => finish(false))
  })
}

function diskUsedPercent(path: string) {
  const stats = statfsSync(path)
  const bytePercent = stats.blocks === 0 ? 0 : ((stats.blocks - stats.bavail) / stats.blocks) * 100
  const inodePercent = stats.files === 0 ? 0 : ((stats.files - stats.ffree) / stats.files) * 100
  return Math.max(bytePercent, inodePercent)
}

const controlHealthSchema = z
  .object({
    applicationJobs: z
      .object({
        backlog_count: z.number().int().nonnegative(),
        budget_stop_count: z.number().int().nonnegative(),
        expired_lease_count: z.number().int().nonnegative(),
        failed_24h_count: z.number().int().nonnegative(),
        oldest_incomplete_age_seconds: z.number().nonnegative(),
      })
      .nullable(),
    infrastructure: z.object({
      audit: z.object({
        count: z.number().int().nonnegative(),
        maxId: z.number().int().nonnegative(),
      }),
      backup: z
        .object({
          ageSeconds: z.number().nonnegative(),
          primaryReplicaStatus: z.string(),
          r2ReplicaStatus: z.string(),
          valid: z.boolean(),
          walArchivePresent: z.boolean(),
        })
        .nullable(),
      integrity: z.literal('ok'),
      operations: z.object({
        expiredLeaseCount: z.number().int().nonnegative(),
        failed24hCount: z.number().int().nonnegative(),
        needsAttentionCount: z.number().int().nonnegative(),
        oldestIncompleteAgeSeconds: z.number().nonnegative(),
      }),
    }),
  })
  .passthrough()

const lifecycle = new AlertLifecycle()
let lastSnapshot: Readonly<Record<string, unknown>> | null = null
let lastSuccessAt: string | null = null
let firingAlerts = 0
let consecutive5xx = 0

async function deliverAlert(name: string, state: 'firing' | 'resolved') {
  const rule = productionAlertRules.find((candidate) => candidate.name === name)
  if (!rule) return
  emitTelemetry({
    attributes: { alert: name, runbook: rule.runbook, severity: rule.severity, state },
    component: rule.component,
    event: 'alert_transition',
    level: state === 'firing' ? 'error' : 'info',
  })
  if (!configuration.OBSERVABILITY_ALERT_WEBHOOK_URL) return
  const response = await fetch(configuration.OBSERVABILITY_ALERT_WEBHOOK_URL, {
    body: JSON.stringify({ alert: name, runbook: rule.runbook, severity: rule.severity, state }),
    headers: {
      authorization: `Bearer ${configuration.OBSERVABILITY_ALERT_WEBHOOK_BEARER_TOKEN ?? ''}`,
      'content-type': 'application/json',
    },
    method: 'POST',
    signal: AbortSignal.timeout(5_000),
  })
  if (!response.ok) throw new Error(`Alert webhook returned HTTP ${String(response.status)}`)
}

async function collect() {
  const [publicPath, originPath, control, worker, deployAgent, webReady, pgbouncer, ipv6Addresses] =
    await Promise.all([
      requestProbe(
        configuration.OBSERVABILITY_PUBLIC_URL,
        configuration.OBSERVABILITY_PUBLIC_SERVER_NAME,
      ),
      requestProbe(
        configuration.OBSERVABILITY_ORIGIN_URL,
        configuration.OBSERVABILITY_ORIGIN_SERVER_NAME,
      ),
      jsonProbe(configuration.OBSERVABILITY_CONTROL_URL),
      jsonProbe(configuration.OBSERVABILITY_WORKER_URL),
      jsonProbe(configuration.OBSERVABILITY_DEPLOY_AGENT_URL),
      jsonProbe(configuration.OBSERVABILITY_WEB_URL),
      tcpProbe(
        configuration.OBSERVABILITY_PGBOUNCER_HOST,
        configuration.OBSERVABILITY_PGBOUNCER_PORT,
      ),
      resolve6(configuration.OBSERVABILITY_ORIGIN_HOSTNAME).catch(() => []),
    ])
  const asset = await requestProbe(
    new URL(
      configuration.OBSERVABILITY_PUBLIC_ASSET_PATH,
      configuration.OBSERVABILITY_PUBLIC_URL,
    ).toString(),
    configuration.OBSERVABILITY_PUBLIC_SERVER_NAME,
  )
  const controlSnapshot = controlHealthSchema.safeParse(control.body)
  const applicationJobs = controlSnapshot.success ? controlSnapshot.data.applicationJobs : null
  const infrastructure = controlSnapshot.success ? controlSnapshot.data.infrastructure : null
  const diskPercent = Math.max(
    diskUsedPercent('/host-data'),
    diskUsedPercent('/host-control-state'),
  )
  const restoreDrillAgeSeconds =
    (Date.now() - new Date(configuration.OBSERVABILITY_RESTORE_DRILL_TIMESTAMP).getTime()) / 1_000
  const recoveryInvalid =
    infrastructure?.backup === null ||
    infrastructure?.backup === undefined ||
    infrastructure.backup.ageSeconds > configuration.OBSERVABILITY_BACKUP_MAX_AGE_SECONDS ||
    !infrastructure.backup.valid ||
    infrastructure.backup.primaryReplicaStatus !== 'fresh' ||
    infrastructure.backup.r2ReplicaStatus !== 'fresh' ||
    !infrastructure.backup.walArchivePresent ||
    restoreDrillAgeSeconds > configuration.OBSERVABILITY_RESTORE_DRILL_MAX_AGE_SECONDS
  const currentProbeHas5xx = [publicPath.status, originPath.status].some(
    (status) => status !== null && status >= 500,
  )
  consecutive5xx = currentProbeHas5xx ? consecutive5xx + 1 : 0
  const signals: AlertSignal[] = [
    { active: !publicPath.ok || !originPath.ok, details: {}, name: 'WebAvailabilityFailed' },
    {
      active:
        Math.max(publicPath.durationMs, originPath.durationMs) >
        configuration.OBSERVABILITY_LATENCY_WARNING_MS,
      details: {},
      name: 'WebLatencyHigh',
    },
    { active: consecutive5xx >= 3, details: {}, name: 'Web5xxSpike' },
    {
      active: controlSnapshot.success && applicationJobs === null,
      details: {},
      name: 'PostgresqlUnavailable',
    },
    { active: !pgbouncer.ok, details: {}, name: 'PgbouncerUnavailable' },
    {
      active:
        !worker.ok ||
        applicationJobs === null ||
        applicationJobs.budget_stop_count > 0 ||
        applicationJobs.expired_lease_count > 0 ||
        applicationJobs.failed_24h_count > 0 ||
        applicationJobs.oldest_incomplete_age_seconds >
          configuration.OBSERVABILITY_JOB_MAX_AGE_SECONDS,
      details: {},
      name: 'ApplicationJobStuck',
    },
    {
      active:
        !control.ok ||
        infrastructure === null ||
        infrastructure.integrity !== 'ok' ||
        infrastructure.operations.expiredLeaseCount > 0 ||
        infrastructure.operations.failed24hCount > 0 ||
        infrastructure.operations.needsAttentionCount > 0 ||
        infrastructure.operations.oldestIncompleteAgeSeconds >
          configuration.OBSERVABILITY_JOB_MAX_AGE_SECONDS,
      details: {},
      name: 'InfrastructureOperationStuck',
    },
    { active: !deployAgent.ok, details: {}, name: 'DeployAgentUnavailable' },
    { active: recoveryInvalid, details: {}, name: 'RecoveryEvidenceStale' },
    {
      active: diskPercent >= configuration.OBSERVABILITY_DISK_CRITICAL_PERCENT,
      details: {},
      name: 'HostDiskPressure',
    },
    { active: !asset.ok, details: {}, name: 'AssetStorageUnavailable' },
    {
      active: configuration.OBSERVABILITY_ORIGIN_IPV6_REQUIRED && ipv6Addresses.length === 0,
      details: {},
      name: 'OriginIpv6Unavailable',
    },
  ]
  firingAlerts = signals.filter((signal) => signal.active).length
  for (const transition of lifecycle.evaluate(signals)) {
    await deliverAlert(transition.name, transition.state).catch((error: unknown) =>
      emitTelemetry({
        attributes: { alert: transition.name, ...safeErrorAttributes(error) },
        component: 'observability-agent',
        event: 'alert_delivery_failed',
        level: 'error',
      }),
    )
  }
  lastSnapshot = Object.freeze({
    activeAlerts: signals.filter((signal) => signal.active).map((signal) => signal.name),
    applicationJobBacklog: applicationJobs?.backlog_count ?? null,
    applicationJobBudgetStops: applicationJobs?.budget_stop_count ?? null,
    auditEventCount: infrastructure?.audit.count ?? null,
    controlStateIntegrity: infrastructure?.integrity ?? 'unavailable',
    diskUsedPercent: Number(diskPercent.toFixed(2)),
    firingAlerts,
    originIpv6AddressCount: ipv6Addresses.length,
    probes: { asset, control, deployAgent, originPath, pgbouncer, publicPath, webReady, worker },
    restoreDrillAgeSeconds: Math.max(0, restoreDrillAgeSeconds),
  })
  lastSuccessAt = new Date().toISOString()
  emitTelemetry({
    attributes: {
      disk_used_percent: Number(diskPercent.toFixed(2)),
      firing_alerts: firingAlerts,
      origin_duration_ms: Number(originPath.durationMs.toFixed(2)),
      public_duration_ms: Number(publicPath.durationMs.toFixed(2)),
    },
    component: 'observability-agent',
    event: 'readiness_snapshot_collected',
    level: firingAlerts === 0 ? 'info' : 'warn',
  })
}

function sendJson(response: ServerResponse, status: number, payload: unknown) {
  response.statusCode = status
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.setHeader('x-content-type-options', 'nosniff')
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    response.setHeader('allow', 'GET')
    sendJson(response, 405, { error: 'method_not_allowed' })
    return
  }
  if (request.url === '/health') {
    const stale =
      lastSuccessAt === null ||
      Date.now() - new Date(lastSuccessAt).getTime() >
        configuration.OBSERVABILITY_INTERVAL_SECONDS * 3_000
    sendJson(response, stale ? 503 : 200, {
      firingAlerts,
      lastSuccessAt,
      service: 'observability-agent',
      status: lastSuccessAt === null ? 'starting' : stale ? 'stale' : 'ok',
    })
    return
  }
  if (request.url === '/metrics') {
    sendJson(response, lastSnapshot === null ? 503 : 200, lastSnapshot ?? { status: 'starting' })
    return
  }
  sendJson(response, 404, { error: 'not_found' })
})

let collecting = false
async function runCollection() {
  if (collecting) return
  collecting = true
  try {
    await collect()
  } catch (error: unknown) {
    emitTelemetry({
      attributes: safeErrorAttributes(error),
      component: 'observability-agent',
      event: 'readiness_collection_failed',
      level: 'error',
    })
  } finally {
    collecting = false
  }
}

const timer = setInterval(
  () => void runCollection(),
  configuration.OBSERVABILITY_INTERVAL_SECONDS * 1_000,
)
void runCollection()
server.listen(configuration.OBSERVABILITY_PORT, configuration.OBSERVABILITY_HOST, () =>
  emitTelemetry({
    attributes: { interval_seconds: configuration.OBSERVABILITY_INTERVAL_SECONDS },
    component: 'observability-agent',
    event: 'observability_agent_started',
    level: 'info',
  }),
)

function shutdown() {
  clearInterval(timer)
  server.close()
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
