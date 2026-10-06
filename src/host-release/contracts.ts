import { resolve } from 'node:path'
import { z } from 'zod'

export const releaseShaSchema = z.string().regex(/^[a-f0-9]{40}$/)
export const releaseDigestSchema = z.string().regex(/^sha256:[a-f0-9]{64}$/)
export const immutableImageSchema = z
  .string()
  .regex(/^[-a-z0-9.:/_]+(?::[a-f0-9]{40}|@sha256:[a-f0-9]{64})$/)
export const topologyFiles = [
  'compose.yaml',
  'openresty.conf',
  'pgbouncer.ini',
  'pgbackrest.conf',
] as const
export const independentServices = [
  'control-api',
  'content-worker',
  'deploy-agent',
  'observability-agent',
] as const

export const hostSettingsSchema = z
  .object({
    configRoot: z
      .string()
      .regex(/^\/[a-zA-Z0-9/_-]+$/)
      .refine((value) => resolve(value) === value)
      .default('/etc/tungchiahui'),
    dataRoot: z
      .string()
      .regex(/^\/[a-zA-Z0-9/_-]+$/)
      .refine((value) => resolve(value) === value)
      .default('/var/lib/tungchiahui'),
    projectName: z
      .string()
      .regex(/^tungchiahui[-a-z0-9]{0,80}$/)
      .default('tungchiahui-production'),
    runtimeGroupGid: z.literal(10050).default(10050),
    manageSystemd: z.boolean().default(true),
  })
  .strict()
export type HostSettings = Readonly<z.infer<typeof hostSettingsSchema>>

export const provisionRequestSchema = z
  .object({
    settings: hostSettingsSchema,
    sourceRoot: z.string().startsWith('/'),
    sha: releaseShaSchema,
    webImage: immutableImageSchema,
    webDigest: releaseDigestSchema,
    serviceImage: immutableImageSchema,
    recoveryImage: immutableImageSchema,
    postgresImage: immutableImageSchema,
    mode: z.enum(['bootstrap', 'services', 'configuration']),
    deploymentPollingEnabled: z.boolean().optional(),
    backupScheduleEnabled: z.boolean().default(false),
    maintenanceScheduleEnabled: z.boolean().default(false),
  })
  .strict()
export type ProvisionRequest = Readonly<z.infer<typeof provisionRequestSchema>>

export const hostReleaseSchema = z
  .object({
    sha: releaseShaSchema,
    webDigest: releaseDigestSchema,
    serviceDigest: releaseDigestSchema,
    recoveryDigest: releaseDigestSchema,
  })
  .strict()
export type HostRelease = Readonly<z.infer<typeof hostReleaseSchema>>
