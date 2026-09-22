import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdirSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import { parseEnv } from 'node:util'

import { z } from 'zod'

import { validateProductionEnvironmentContents } from './initialize-secrets'

const defaultOutputPath = '/etc/tungchiahui/.env'
const releaseWorkflowRef =
  'tungchiahui/tungchiahui_web/.github/workflows/release.yml@refs/heads/main'
const legacyDeployWorkflowRef =
  'tungchiahui/tungchiahui_web/.github/workflows/deploy.yml@refs/heads/main'

const legacyProductionSecretDocumentSchema = z
  .object({
    backup_age_identity: z.string().min(1),
    backup_env: z.string().min(1),
    content_worker_env: z.string().min(1),
    control_api_env: z.string().min(1),
    database_migrate_env: z.string().min(1),
    database_role_bootstrap_env: z.string().min(1),
    deployment_registry_env: z.string().min(1),
    observability_env: z.string().optional().default(''),
    pgbouncer_userlist: z.string().min(1),
    postgres_env: z.string().min(1),
    web_env: z.string().min(1),
  })
  .strict()

function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64')
}

function formatEnvironment(lines: readonly (readonly [string, string] | string)[]) {
  return `${lines
    .map((line) => (typeof line === 'string' ? line : `${line[0]}=${line[1]}`))
    .join('\n')}\n`
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${label} must contain valid JSON`)
  }
}

function parseEnvironmentSection(contents: string): Readonly<Record<string, string>> {
  const entries = Object.entries(parseEnv(contents)).filter(
    (entry): entry is [string, string] => entry[1] !== undefined,
  )
  return Object.freeze(Object.fromEntries(entries))
}

function requiredEnvironmentValue(
  section: Readonly<Record<string, string>>,
  sectionName: string,
  key: string,
) {
  const value = section[key]
  if (value === undefined || value.length === 0) {
    throw new Error(`${sectionName} is missing required key ${key}`)
  }
  return value
}

function migrateGithubOidcPolicy(value: string) {
  return JSON.stringify(
    parseJson(
      value.replaceAll(legacyDeployWorkflowRef, releaseWorkflowRef),
      'CONTROL_GITHUB_OIDC_POLICY_JSON',
    ),
  )
}

function addEnvironmentEntry(
  entries: Map<string, string>,
  key: string,
  value: string,
  source: string,
) {
  const current = entries.get(key)
  if (current !== undefined && current !== value) {
    throw new Error(`${key} has conflicting values while converting ${source}`)
  }
  entries.set(key, value)
}

function firstEnvironmentValue(
  sections: readonly Readonly<Record<string, string>>[],
  key: string,
  fallback: string,
) {
  for (const section of sections) {
    const value = section[key]
    if (value !== undefined) return value
  }
  return fallback
}

export function createProductionEnvironmentContentsFromLegacySopsDocument(input: unknown) {
  const document = legacyProductionSecretDocumentSchema.parse(input)
  const web = parseEnvironmentSection(document.web_env)
  const controlApi = parseEnvironmentSection(document.control_api_env)
  const contentWorker = parseEnvironmentSection(document.content_worker_env)
  const databaseBootstrap = parseEnvironmentSection(document.database_role_bootstrap_env)
  const databaseMigrate = parseEnvironmentSection(document.database_migrate_env)
  const postgres = parseEnvironmentSection(document.postgres_env)
  const backup = parseEnvironmentSection(document.backup_env)
  const deploymentRegistry = parseEnvironmentSection(document.deployment_registry_env)
  const observability = parseEnvironmentSection(document.observability_env)
  const entries = new Map<string, string>()
  const addRequired = (
    sectionName: string,
    section: Readonly<Record<string, string>>,
    key: string,
    outputKey = key,
  ) =>
    addEnvironmentEntry(
      entries,
      outputKey,
      requiredEnvironmentValue(section, sectionName, key),
      sectionName,
    )

  addRequired('postgres_env', postgres, 'POSTGRES_DB')
  addRequired('postgres_env', postgres, 'POSTGRES_USER')
  addRequired('postgres_env', postgres, 'POSTGRES_PASSWORD')
  addRequired('postgres_env', postgres, 'PGBACKREST_REPO1_CIPHER_PASS')
  addRequired('web_env', web, 'DATABASE_URL', 'WEB_DATABASE_URL')
  addRequired('control_api_env', controlApi, 'DATABASE_URL', 'CONTROL_API_DATABASE_URL')
  addRequired('content_worker_env', contentWorker, 'DATABASE_URL', 'CONTENT_WORKER_DATABASE_URL')
  addRequired('database_migrate_env', databaseMigrate, 'DATABASE_URL', 'DATABASE_MIGRATE_URL')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'DATABASE_ADMIN_URL')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_APP_LOGIN_NAME')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_APP_LOGIN_PASSWORD')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_CONTENT_WORKER_LOGIN_NAME')
  addRequired(
    'database_role_bootstrap_env',
    databaseBootstrap,
    'SITE_CONTENT_WORKER_LOGIN_PASSWORD',
  )
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_CONTROL_API_LOGIN_NAME')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_CONTROL_API_LOGIN_PASSWORD')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_MIGRATOR_LOGIN_NAME')
  addRequired('database_role_bootstrap_env', databaseBootstrap, 'SITE_MIGRATOR_LOGIN_PASSWORD')
  addRequired('web_env', web, 'SITE_BASE_URL')
  addRequired('web_env', web, 'SITE_REVALIDATION_SECRET')
  addRequired('content_worker_env', contentWorker, 'GITHUB_CONTENT_REPOSITORY')
  addEnvironmentEntry(
    entries,
    'GITHUB_CONTENT_READ_TOKEN',
    contentWorker.GITHUB_CONTENT_READ_TOKEN ?? '',
    'content_worker_env',
  )
  addRequired('control_api_env', controlApi, 'CONTROL_OPERATOR_KEYS_JSON')
  addEnvironmentEntry(
    entries,
    'CONTROL_GITHUB_OIDC_POLICY_JSON',
    migrateGithubOidcPolicy(
      requiredEnvironmentValue(controlApi, 'control_api_env', 'CONTROL_GITHUB_OIDC_POLICY_JSON'),
    ),
    'control_api_env',
  )
  addRequired('web_env', web, 'ASSET_S3_ENDPOINT')
  addRequired('web_env', web, 'ASSET_S3_REGION')
  addRequired('web_env', web, 'ASSET_S3_BUCKET')
  addRequired('web_env', web, 'ASSET_S3_ACCESS_KEY_ID')
  addRequired('web_env', web, 'ASSET_S3_SECRET_ACCESS_KEY')
  addRequired('web_env', web, 'ASSET_S3_FORCE_PATH_STYLE')
  addRequired('backup_env', backup, 'BACKUP_AGE_RECIPIENT')
  addEnvironmentEntry(
    entries,
    'BACKUP_AGE_IDENTITY_BASE64',
    encodeBase64(document.backup_age_identity),
    'backup_age_identity',
  )
  for (const key of [
    'BACKUP_S3_ENDPOINT',
    'BACKUP_S3_REGION',
    'BACKUP_S3_BUCKET',
    'BACKUP_S3_ACCESS_KEY_ID',
    'BACKUP_S3_SECRET_ACCESS_KEY',
    'BACKUP_S3_FORCE_PATH_STYLE',
    'BACKUP_OFFSITE_S3_ENDPOINT',
    'BACKUP_OFFSITE_S3_REGION',
    'BACKUP_OFFSITE_S3_BUCKET',
    'BACKUP_OFFSITE_S3_ACCESS_KEY_ID',
    'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY',
    'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE',
  ] as const) {
    addRequired('backup_env', backup, key)
  }
  addRequired('deployment_registry_env', deploymentRegistry, 'DEPLOYMENT_REGISTRY_USERNAME')
  addRequired('deployment_registry_env', deploymentRegistry, 'DEPLOYMENT_REGISTRY_TOKEN')
  addEnvironmentEntry(
    entries,
    'PGBOUNCER_USERLIST_BASE64',
    encodeBase64(document.pgbouncer_userlist),
    'pgbouncer_userlist',
  )

  const legacySections = [
    web,
    controlApi,
    contentWorker,
    databaseBootstrap,
    databaseMigrate,
    postgres,
    backup,
    deploymentRegistry,
    observability,
  ] as const
  const productionConfigurationDefaults = {
    TUNGCHIAHUI_BACKUP_REPLICATION_CONCURRENCY: '8',
    TUNGCHIAHUI_CONTENT_POLLING_ENABLED: 'false',
    TUNGCHIAHUI_CONTROL_RATE_LIMIT_PER_MINUTE: '120',
    TUNGCHIAHUI_DEPLOYMENT_ARTICLE_PATH: '/blog/2026-09-02-wm-lun-wen-luo-lie',
    TUNGCHIAHUI_DEPLOYMENT_ASSET_PATH: '/docs/ros2/core/index.html',
    TUNGCHIAHUI_DEPLOYMENT_BACKUP_MAX_AGE_SECONDS: '172800',
    TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY: 'ghcr.io/tungchiahui/tungchiahui_web',
    TUNGCHIAHUI_DEPLOYMENT_SEARCH_QUERY: 'ROS2_Control',
    TUNGCHIAHUI_OBSERVABILITY_BACKUP_MAX_AGE_SECONDS: '172800',
    TUNGCHIAHUI_OBSERVABILITY_DISK_CRITICAL_PERCENT: '90',
    TUNGCHIAHUI_OBSERVABILITY_INTERVAL_SECONDS: '30',
    TUNGCHIAHUI_OBSERVABILITY_JOB_MAX_AGE_SECONDS: '900',
    TUNGCHIAHUI_OBSERVABILITY_LATENCY_WARNING_MS: '2000',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_HOSTNAME: 'ddns.tungchiahui.cn',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_IPV6_REQUIRED: 'true',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_SERVER_NAME: 'ddns.tungchiahui.cn',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_URL: 'https://ddns.tungchiahui.cn:8443/api/ready',
    TUNGCHIAHUI_OBSERVABILITY_PUBLIC_ASSET_PATH: '/api/assets/monitoring/health.svg',
    TUNGCHIAHUI_OBSERVABILITY_PUBLIC_SERVER_NAME: 'www.tungchiahui.cn',
    TUNGCHIAHUI_OBSERVABILITY_PUBLIC_URL: 'https://www.tungchiahui.cn/',
    TUNGCHIAHUI_OBSERVABILITY_RESTORE_DRILL_MAX_AGE_SECONDS: '2678400',
    TUNGCHIAHUI_OBSERVABILITY_RESTORE_DRILL_TIMESTAMP:
      observability.OBSERVABILITY_RESTORE_DRILL_TIMESTAMP ?? '1970-01-01T00:00:00.000Z',
    TUNGCHIAHUI_ORIGIN_BIND_ADDRESS: '127.0.0.1',
    TUNGCHIAHUI_ORIGIN_PORT: '3100',
    TUNGCHIAHUI_SEARCH_POLLING_ENABLED: 'false',
  } as const
  for (const [key, fallback] of Object.entries(productionConfigurationDefaults)) {
    addEnvironmentEntry(
      entries,
      key,
      firstEnvironmentValue(legacySections, key, fallback),
      'legacy production configuration',
    )
  }
  for (const key of [
    'OBSERVABILITY_ALERT_WEBHOOK_URL',
    'OBSERVABILITY_ALERT_WEBHOOK_BEARER_TOKEN',
    'OWNER_PASSWORD_HASH',
  ] as const) {
    const value = firstEnvironmentValue(legacySections, key, '')
    if (value !== '') addEnvironmentEntry(entries, key, value, 'legacy optional configuration')
  }

  const contents = formatEnvironment([
    '# Converted from the legacy SOPS production secret document.',
    '# Keep this file off-repository, root-owned and mode 0600.',
    ...[...entries.entries()],
  ])
  validateProductionEnvironmentContents(contents)
  return contents
}

function decryptLegacySopsDocument(inputPath: string) {
  const result = spawnSync('sops', ['--decrypt', '--output-type', 'json', inputPath], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  if (result.status !== 0) {
    throw new Error(`sops decrypt failed: ${result.stderr.trim() || 'unknown error'}`)
  }
  try {
    return JSON.parse(result.stdout) as unknown
  } catch {
    throw new Error('sops decrypt did not return valid JSON')
  }
}

export function convertLegacyProductionSopsToEnv(
  inputPath: string,
  outputPath = defaultOutputPath,
  options: Readonly<{ force?: boolean }> = {},
) {
  const productionEnvPath = resolve(outputPath)
  if (existsSync(productionEnvPath) && options.force !== true) {
    throw new Error(`Refusing to overwrite production env file: ${productionEnvPath}`)
  }
  const contents = createProductionEnvironmentContentsFromLegacySopsDocument(
    decryptLegacySopsDocument(resolve(inputPath)),
  )
  mkdirSync(dirname(productionEnvPath), { mode: 0o700, recursive: true })
  writeFileSync(productionEnvPath, contents, {
    flag: options.force === true ? 'w' : 'wx',
    mode: 0o600,
  })
  chmodSync(productionEnvPath, 0o600)
  return Object.freeze({ keys: parseEnv(contents), productionEnvPath })
}

function parseArguments(arguments_: readonly string[]) {
  let force = false
  let inputPath: string | undefined
  let outputPath = defaultOutputPath
  let index = 0
  while (index < arguments_.length) {
    const argument = arguments_[index]
    if (argument === '--input') {
      inputPath = z
        .string()
        .min(1)
        .parse(arguments_[index + 1])
      index += 2
      continue
    }
    if (argument === '--output') {
      outputPath = z
        .string()
        .min(1)
        .parse(arguments_[index + 1])
      index += 2
      continue
    }
    if (argument === '--force') {
      force = true
      index += 1
      continue
    }
    throw new Error(`Unknown argument: ${String(argument)}`)
  }
  if (inputPath === undefined) {
    throw new Error(
      'Usage: tsx tools/production/convert-legacy-sops-to-env.ts --input <production.sops.yaml> [--output /etc/tungchiahui/.env] [--force]',
    )
  }
  return Object.freeze({ force, inputPath, outputPath })
}

function main() {
  const command = parseArguments(process.argv.slice(2))
  const result = convertLegacyProductionSopsToEnv(command.inputPath, command.outputPath, {
    force: command.force,
  })
  console.log(
    JSON.stringify(
      {
        keyCount: Object.keys(result.keys).length,
        next: `install ${result.productionEnvPath} as root:root mode 0600, then validate it without printing values`,
        productionEnvPath: result.productionEnvPath,
        status: 'converted',
      },
      null,
      2,
    ),
  )
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main()
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error))
    process.exit(1)
  }
}
