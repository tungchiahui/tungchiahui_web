import { z } from 'zod'

import { telemetryComponentSchema } from './telemetry'

export const productionComponentCatalog = Object.freeze([
  { component: 'openresty', health: '/openresty-health', owner: 'operations' },
  { component: 'nextjs', health: '/api/health + /api/ready', owner: 'web' },
  { component: 'control-api', health: 'internal /health', owner: 'operations' },
  { component: 'content-worker', health: 'internal /health', owner: 'content' },
  { component: 'deploy-agent', health: 'internal /health', owner: 'operations' },
  { component: 'postgresql', health: 'Next readiness dependency', owner: 'database' },
  { component: 'pgbouncer', health: 'application-network TCP probe', owner: 'database' },
  { component: 's3', health: 'representative public asset read', owner: 'storage' },
  { component: 'backup', health: 'control-state backup/WAL/replica snapshot', owner: 'recovery' },
  { component: 'host', health: 'read-only proc/filesystem snapshot', owner: 'operations' },
  {
    component: 'observability-agent',
    health: 'internal /health and /metrics',
    owner: 'operations',
  },
] as const satisfies readonly {
  component: z.infer<typeof telemetryComponentSchema>
  health: string
  owner: string
}[])

export const alertRuleSchema = z
  .object({
    component: telemetryComponentSchema,
    description: z.string().min(1),
    name: z.string().regex(/^[A-Z][A-Za-z0-9]+$/),
    runbook: z.string().startsWith('docs/operations/runbook.md#'),
    severity: z.enum(['warning', 'critical']),
  })
  .strict()

export const productionAlertRules = Object.freeze(
  [
    {
      component: 'nextjs',
      description: 'Public or origin availability check failed',
      name: 'WebAvailabilityFailed',
      runbook: 'docs/operations/runbook.md#availability-or-5xx',
      severity: 'critical',
    },
    {
      component: 'nextjs',
      description: 'Representative latency exceeds the measured readiness threshold',
      name: 'WebLatencyHigh',
      runbook: 'docs/operations/runbook.md#latency-or-pool-saturation',
      severity: 'warning',
    },
    {
      component: 'nextjs',
      description: 'Representative public or origin path returned repeated 5xx responses',
      name: 'Web5xxSpike',
      runbook: 'docs/operations/runbook.md#availability-or-5xx',
      severity: 'critical',
    },
    {
      component: 'postgresql',
      description: 'Application readiness cannot reach PostgreSQL',
      name: 'PostgresqlUnavailable',
      runbook: 'docs/operations/runbook.md#database-incident',
      severity: 'critical',
    },
    {
      component: 'pgbouncer',
      description: 'PgBouncer TCP probe failed',
      name: 'PgbouncerUnavailable',
      runbook: 'docs/operations/runbook.md#latency-or-pool-saturation',
      severity: 'critical',
    },
    {
      component: 'content-worker',
      description: 'Application job age, lease, backlog, budget stop, or failure needs action',
      name: 'ApplicationJobStuck',
      runbook: 'docs/operations/runbook.md#worker-backlog-or-budget-stop',
      severity: 'warning',
    },
    {
      component: 'control-api',
      description: 'SQLite operation is stuck, failed, or audit continuity is invalid',
      name: 'InfrastructureOperationStuck',
      runbook: 'docs/operations/runbook.md#control-state-or-audit-continuity',
      severity: 'critical',
    },
    {
      component: 'deploy-agent',
      description: 'Deployment and recovery agent health is unavailable',
      name: 'DeployAgentUnavailable',
      runbook: 'docs/operations/runbook.md#control-state-or-audit-continuity',
      severity: 'critical',
    },
    {
      component: 'backup',
      description: 'Backup, WAL, off-site replica, or restore drill evidence is stale or failed',
      name: 'RecoveryEvidenceStale',
      runbook: 'docs/operations/runbook.md#backup-wal-r2-or-restore-drill',
      severity: 'critical',
    },
    {
      component: 'host',
      description: 'Disk bytes or inodes crossed the configured threshold',
      name: 'HostDiskPressure',
      runbook: 'docs/operations/runbook.md#disk-pressure',
      severity: 'critical',
    },
    {
      component: 's3',
      description: 'Representative S3-backed public asset cannot be read',
      name: 'AssetStorageUnavailable',
      runbook: 'docs/operations/runbook.md#s3-incident',
      severity: 'warning',
    },
    {
      component: 'openresty',
      description: 'Direct-origin IPv6 check failed while IPv6 is required',
      name: 'OriginIpv6Unavailable',
      runbook: 'docs/operations/runbook.md#origin-connectivity',
      severity: 'warning',
    },
    {
      component: 'observability-agent',
      description: 'External container health detected a stale observability collection loop',
      name: 'ObservabilityAgentDegraded',
      runbook: 'docs/operations/runbook.md#control-state-or-audit-continuity',
      severity: 'critical',
    },
  ].map((rule) => Object.freeze(alertRuleSchema.parse(rule))),
)

export type AlertSignal = Readonly<{
  active: boolean
  details: Readonly<Record<string, boolean | number | string | null>>
  name: string
}>

export class AlertLifecycle {
  readonly #states = new Map<string, boolean>()

  evaluate(signals: readonly AlertSignal[]) {
    const transitions: { name: string; state: 'firing' | 'resolved' }[] = []
    for (const signal of signals) {
      const previous = this.#states.get(signal.name) ?? false
      if (signal.active !== previous) {
        transitions.push({ name: signal.name, state: signal.active ? 'firing' : 'resolved' })
      }
      this.#states.set(signal.name, signal.active)
    }
    return Object.freeze(transitions)
  }
}
