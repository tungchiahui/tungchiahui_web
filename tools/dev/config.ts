import { isAbsolute, relative, resolve } from 'node:path'

import { z } from 'zod'

const localCredential = Object.freeze({
  databasePassword: 'local-only-postgres',
  databaseUser: 'tungchiahui',
  s3AccessKeyId: 'local-only-access-key',
  s3SecretAccessKey: 'local-only-secret-key',
})

const rawLocalInfrastructureSchema = z.object({
  controlApiUrl: z.url(),
  controlStatePath: z.string().min(1),
  databaseUrl: z.url(),
  fakeDeployAgentUrl: z.url(),
  mode: z.enum(['local', 'test']),
  openRestyUrl: z.url(),
  s3AccessKeyId: z.string(),
  s3Bucket: z.string().min(3).max(63),
  s3Endpoint: z.url(),
  s3SecretAccessKey: z.string(),
  siteBaseUrl: z.url(),
  translationProvider: z.literal('fake'),
})

export type LocalInfrastructureInput = z.input<typeof rawLocalInfrastructureSchema>

export type LocalInfrastructureConfig = Readonly<{
  controlApiUrl: URL
  controlStatePath: string
  databaseUrl: URL
  fakeDeployAgentUrl: URL
  mode: 'local' | 'test'
  openRestyUrl: URL
  s3AccessKeyId: string
  s3Bucket: string
  s3Endpoint: URL
  s3SecretAccessKey: string
  siteBaseUrl: URL
  translationProvider: 'fake'
}>

export class LocalInfrastructureValidationError extends Error {
  override readonly name = 'LocalInfrastructureValidationError'

  constructor(issues: readonly string[]) {
    super(`Invalid local/test infrastructure configuration: ${issues.join('; ')}`)
  }
}

const allowedServiceHosts = new Set([
  '127.0.0.1',
  '::1',
  'control-api',
  'fake-deploy-agent',
  'localhost',
  'openresty',
  'pgbouncer',
  'postgres',
  's3mock',
  'web',
])

function requireLocalUrl(
  name: string,
  value: string,
  protocols: readonly string[],
  issues: string[],
) {
  const url = new URL(value)

  if (!protocols.includes(url.protocol)) {
    issues.push(`${name}: protocol is not allowed for local/test mode`)
  }

  if (!allowedServiceHosts.has(url.hostname)) {
    issues.push(`${name}: host is not an approved loopback or Docker service name`)
  }

  return url
}

function isWithin(parent: string, candidate: string) {
  const relation = relative(parent, candidate)
  return relation === '' || (!relation.startsWith('..') && !isAbsolute(relation))
}

export function parseLocalInfrastructureConfig(
  input: LocalInfrastructureInput,
  allowedControlStateRoot: string,
): LocalInfrastructureConfig {
  const result = rawLocalInfrastructureSchema.safeParse(input)

  if (!result.success) {
    throw new LocalInfrastructureValidationError(
      result.error.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`),
    )
  }

  const issues: string[] = []
  const databaseUrl = requireLocalUrl(
    'databaseUrl',
    result.data.databaseUrl,
    ['postgres:', 'postgresql:'],
    issues,
  )
  const s3Endpoint = requireLocalUrl('s3Endpoint', result.data.s3Endpoint, ['http:'], issues)
  const siteBaseUrl = requireLocalUrl('siteBaseUrl', result.data.siteBaseUrl, ['http:'], issues)
  const controlApiUrl = requireLocalUrl(
    'controlApiUrl',
    result.data.controlApiUrl,
    ['http:'],
    issues,
  )
  const fakeDeployAgentUrl = requireLocalUrl(
    'fakeDeployAgentUrl',
    result.data.fakeDeployAgentUrl,
    ['http:'],
    issues,
  )
  const openRestyUrl = requireLocalUrl('openRestyUrl', result.data.openRestyUrl, ['http:'], issues)
  const expectedBucketPrefix = `tungchiahui-${result.data.mode}-`
  const expectedControlRoot = resolve(allowedControlStateRoot)
  const controlStatePath = resolve(result.data.controlStatePath)

  if (
    databaseUrl.username !== localCredential.databaseUser ||
    databaseUrl.password !== localCredential.databasePassword
  ) {
    issues.push('databaseUrl: only the documented local/test credential is allowed')
  }

  if (!result.data.s3Bucket.startsWith(expectedBucketPrefix)) {
    issues.push(`s3Bucket: must use the ${expectedBucketPrefix} namespace`)
  }

  if (result.data.s3AccessKeyId !== localCredential.s3AccessKeyId) {
    issues.push('s3AccessKeyId: only the documented local/test credential is allowed')
  }

  if (result.data.s3SecretAccessKey !== localCredential.s3SecretAccessKey) {
    issues.push('s3SecretAccessKey: only the documented local/test credential is allowed')
  }

  if (!isWithin(expectedControlRoot, controlStatePath)) {
    issues.push('controlStatePath: must stay inside the dedicated local/test state directory')
  }

  if (issues.length > 0) {
    throw new LocalInfrastructureValidationError(issues)
  }

  return Object.freeze({
    controlApiUrl,
    controlStatePath,
    databaseUrl,
    fakeDeployAgentUrl,
    mode: result.data.mode,
    openRestyUrl,
    s3AccessKeyId: result.data.s3AccessKeyId,
    s3Bucket: result.data.s3Bucket,
    s3Endpoint,
    s3SecretAccessKey: result.data.s3SecretAccessKey,
    siteBaseUrl,
    translationProvider: result.data.translationProvider,
  })
}

export const documentedLocalCredentials = localCredential
