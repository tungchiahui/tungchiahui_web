import { spawnSync } from 'node:child_process'
import { lstatSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { parseEnv } from 'node:util'

import { parse } from 'yaml'
import { z } from 'zod'

import { validateProductionEnvironmentContents } from './initialize-secrets'

const canonicalProductionEnvPath = '/etc/tungchiahui/.env'
const defaultComposePath = '/etc/tungchiahui/compose.yaml'
const defaultProjectName = 'tungchiahui-production'

const composeSchema = z.object({
  services: z.record(
    z.string(),
    z
      .object({
        environment: z.record(z.string(), z.unknown()).optional(),
      })
      .passthrough(),
  ),
})

const inspectedContainerSchema = z.object({
  Config: z.object({ Env: z.array(z.string()).nullable() }),
})

const sourceReferencePattern = /^\$\{([A-Z][A-Z0-9_]*)(?::[-?][^}]*)?\}$/u

type EnvironmentContractIssue = Readonly<{
  key: string
  kind: 'disallowed-production-key' | 'stale-value'
  service: string
}>

function environmentMap(entries: readonly string[]) {
  return new Map(
    entries.map((entry) => {
      const separator = entry.indexOf('=')
      if (separator < 1) throw new Error('Container environment contains an invalid entry')
      return [entry.slice(0, separator), entry.slice(separator + 1)] as const
    }),
  )
}

export function analyzeServiceEnvironment(
  service: string,
  configuredEnvironment: Readonly<Record<string, unknown>>,
  productionEnvironment: Readonly<Record<string, string>>,
  containerEntries: readonly string[],
): readonly EnvironmentContractIssue[] {
  const issues: EnvironmentContractIssue[] = []
  const containerEnvironment = environmentMap(containerEntries)
  const allowedRuntimeKeys = new Set(Object.keys(configuredEnvironment))
  for (const key of Object.keys(productionEnvironment)) {
    if (containerEnvironment.has(key) && !allowedRuntimeKeys.has(key)) {
      issues.push({ key, kind: 'disallowed-production-key', service })
    }
  }
  for (const [runtimeKey, configuredValue] of Object.entries(configuredEnvironment)) {
    if (typeof configuredValue !== 'string') continue
    const sourceKey = sourceReferencePattern.exec(configuredValue)?.[1]
    if (sourceKey === undefined) continue
    const expected = productionEnvironment[sourceKey]
    const actual = containerEnvironment.get(runtimeKey)
    if (expected !== undefined && actual !== expected) {
      issues.push({ key: runtimeKey, kind: 'stale-value', service })
    }
  }
  return issues
}

function runDocker(arguments_: readonly string[]) {
  const result = spawnSync('docker', arguments_, {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    throw new Error(`Docker inspection failed: ${result.stderr.trim() || 'unknown error'}`)
  }
  return result.stdout.trim()
}

function validateFileMetadata(path: string, expectedMode: number, requireRoot: boolean) {
  const metadata = lstatSync(path)
  if (!metadata.isFile() || metadata.isSymbolicLink()) {
    throw new Error(`Production configuration must be a regular non-symlink file: ${path}`)
  }
  if ((metadata.mode & 0o777) !== expectedMode) {
    throw new Error(`Production configuration has an invalid mode: ${path}`)
  }
  if (requireRoot && metadata.uid !== 0) {
    throw new Error(`Production configuration must be owned by root: ${path}`)
  }
}

function requireDerivedSecret(envFile: string, relativePath: string, encoded: string) {
  const path = join(dirname(envFile), 'secrets', relativePath)
  const metadata = lstatSync(path)
  if (
    !metadata.isFile() ||
    metadata.isSymbolicLink() ||
    metadata.uid !== 0 ||
    (metadata.mode & 0o777) !== 0o640
  ) {
    throw new Error(`Derived runtime secret has invalid metadata: ${path}`)
  }
  const expected = Buffer.from(encoded.replace(/\s+/gu, ''), 'base64')
  const actual = readFileSync(path)
  if (!expected.equals(actual)) throw new Error(`Derived runtime secret is stale: ${path}`)
}

export function runProductionDoctor(
  envFile = canonicalProductionEnvPath,
  composeFile = defaultComposePath,
  projectName = defaultProjectName,
) {
  const resolvedEnvFile = resolve(envFile)
  const resolvedComposeFile = resolve(composeFile)
  validateFileMetadata(resolvedEnvFile, 0o600, resolvedEnvFile === canonicalProductionEnvPath)
  validateFileMetadata(resolvedComposeFile, 0o640, true)
  const contents = readFileSync(resolvedEnvFile, 'utf8')
  const validated = validateProductionEnvironmentContents(contents)
  const productionEnvironment = Object.fromEntries(
    Object.entries(parseEnv(contents)).filter(
      (entry): entry is [string, string] => entry[1] !== undefined,
    ),
  )
  requireDerivedSecret(
    resolvedEnvFile,
    'backup-age-identity.txt',
    productionEnvironment.BACKUP_AGE_IDENTITY_BASE64 ?? '',
  )
  requireDerivedSecret(
    resolvedEnvFile,
    'pgbouncer-userlist.txt',
    productionEnvironment.PGBOUNCER_USERLIST_BASE64 ?? '',
  )

  const compose = composeSchema.parse(
    parse(readFileSync(resolvedComposeFile, 'utf8'), { merge: true }) as unknown,
  )
  const names = runDocker([
    'ps',
    '--filter',
    `label=com.docker.compose.project=${projectName}`,
    '--format',
    '{{.Names}}',
  ])
    .split('\n')
    .filter((name) => name !== '')
  if (names.length === 0) throw new Error(`No running containers found for ${projectName}`)

  const issues: EnvironmentContractIssue[] = []
  const services: string[] = []
  for (const name of names) {
    const service = runDocker([
      'inspect',
      '--format',
      '{{index .Config.Labels "com.docker.compose.service"}}',
      name,
    ])
    const configured = compose.services[service]
    if (configured === undefined)
      throw new Error(`Running service is absent from Compose: ${service}`)
    const inspected = z
      .array(inspectedContainerSchema)
      .length(1)
      .parse(JSON.parse(runDocker(['inspect', name])) as unknown)[0]
    if (inspected === undefined) throw new Error(`Docker inspection returned no container: ${name}`)
    issues.push(
      ...analyzeServiceEnvironment(
        service,
        configured.environment ?? {},
        productionEnvironment,
        inspected.Config.Env ?? [],
      ),
    )
    services.push(service)
  }
  if (issues.length > 0) {
    const summary = issues.map((issue) => `${issue.service}:${issue.key}:${issue.kind}`).join(', ')
    throw new Error(`Production runtime environment drift detected: ${summary}`)
  }
  return Object.freeze({
    checks: Object.freeze({
      derivedSecrets: 2,
      environmentKeys: validated.keys,
      runtimeServices: services.length,
    }),
    projectName,
    services: services.toSorted(),
    status: 'healthy' as const,
  })
}
