import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'
import { parseEnv } from 'node:util'

import { z } from 'zod'

import { capabilityValues } from '../../src/control-plane/contracts'
import {
  createPostgresScramVerifier,
  parsePgbouncerScramUserlist,
} from '../../src/database/postgres-scram'

const publicJwkSchema = z
  .object({
    crv: z.literal('Ed25519'),
    kty: z.literal('OKP'),
    x: z.string().min(16),
  })
  .strip()

const privateJwkSchema = z
  .object({
    crv: z.literal('Ed25519'),
    d: z.string().min(16),
    kty: z.literal('OKP'),
    x: z.string().min(16),
  })
  .strip()

const placeholderMarker = 'REPLACE_WITH_'
const defaultProductionEnvPath = '/etc/tungchiahui/.env'
const releaseWorkflowRef =
  'tungchiahui/tungchiahui_web/.github/workflows/release.yml@refs/heads/main'
const legacyDeployWorkflowRef =
  'tungchiahui/tungchiahui_web/.github/workflows/deploy.yml@refs/heads/main'

const requiredProductionEnvironmentKeys = Object.freeze([
  'ASSET_S3_ACCESS_KEY_ID',
  'ASSET_S3_BUCKET',
  'ASSET_S3_ENDPOINT',
  'ASSET_S3_FORCE_PATH_STYLE',
  'ASSET_S3_REGION',
  'ASSET_S3_SECRET_ACCESS_KEY',
  'BACKUP_AGE_IDENTITY_BASE64',
  'BACKUP_AGE_RECIPIENT',
  'BACKUP_OFFSITE_S3_ACCESS_KEY_ID',
  'BACKUP_OFFSITE_S3_BUCKET',
  'BACKUP_OFFSITE_S3_ENDPOINT',
  'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE',
  'BACKUP_OFFSITE_S3_REGION',
  'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY',
  'BACKUP_S3_ACCESS_KEY_ID',
  'BACKUP_S3_BUCKET',
  'BACKUP_S3_ENDPOINT',
  'BACKUP_S3_FORCE_PATH_STYLE',
  'BACKUP_S3_REGION',
  'BACKUP_S3_SECRET_ACCESS_KEY',
  'CONTENT_WORKER_DATABASE_URL',
  'CONTROL_API_DATABASE_URL',
  'CONTROL_GITHUB_OIDC_POLICY_JSON',
  'CONTROL_OPERATOR_KEYS_JSON',
  'DATABASE_ADMIN_URL',
  'DATABASE_MIGRATE_URL',
  'DEPLOYMENT_REGISTRY_TOKEN',
  'DEPLOYMENT_REGISTRY_USERNAME',
  'GITHUB_CONTENT_REPOSITORY',
  'PGBACKREST_REPO1_CIPHER_PASS',
  'PGBOUNCER_USERLIST_BASE64',
  'POSTGRES_DB',
  'POSTGRES_PASSWORD',
  'POSTGRES_USER',
  'SITE_APP_LOGIN_NAME',
  'SITE_APP_LOGIN_PASSWORD',
  'SITE_BASE_URL',
  'SITE_CONTENT_WORKER_LOGIN_NAME',
  'SITE_CONTENT_WORKER_LOGIN_PASSWORD',
  'SITE_CONTROL_API_LOGIN_NAME',
  'SITE_CONTROL_API_LOGIN_PASSWORD',
  'SITE_MIGRATOR_LOGIN_NAME',
  'SITE_MIGRATOR_LOGIN_PASSWORD',
  'SITE_REVALIDATION_SECRET',
  'WEB_DATABASE_URL',
] as const)

const productionEnvironmentSchema = z
  .object({
    ASSET_S3_ACCESS_KEY_ID: z.string().min(1),
    ASSET_S3_BUCKET: z.string().min(3),
    ASSET_S3_ENDPOINT: z.url(),
    ASSET_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']),
    ASSET_S3_REGION: z.string().min(1),
    ASSET_S3_SECRET_ACCESS_KEY: z.string().min(1),
    BACKUP_AGE_IDENTITY_BASE64: z.string().min(1),
    BACKUP_AGE_RECIPIENT: z.string().startsWith('age1'),
    BACKUP_OFFSITE_S3_ACCESS_KEY_ID: z.string().min(1),
    BACKUP_OFFSITE_S3_BUCKET: z.string().min(3),
    BACKUP_OFFSITE_S3_ENDPOINT: z.url(),
    BACKUP_OFFSITE_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']),
    BACKUP_OFFSITE_S3_REGION: z.string().min(1),
    BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY: z.string().min(1),
    BACKUP_S3_ACCESS_KEY_ID: z.string().min(1),
    BACKUP_S3_BUCKET: z.string().min(3),
    BACKUP_S3_ENDPOINT: z.url(),
    BACKUP_S3_FORCE_PATH_STYLE: z.enum(['true', 'false']),
    BACKUP_S3_REGION: z.string().min(1),
    BACKUP_S3_SECRET_ACCESS_KEY: z.string().min(1),
    CONTENT_WORKER_DATABASE_URL: z.string().url(),
    CONTROL_API_DATABASE_URL: z.string().url(),
    CONTROL_GITHUB_OIDC_POLICY_JSON: z.string().min(2),
    CONTROL_OPERATOR_KEYS_JSON: z.string().min(2),
    DATABASE_ADMIN_URL: z.string().url(),
    DATABASE_MIGRATE_URL: z.string().url(),
    DEPLOYMENT_REGISTRY_TOKEN: z.string().min(16),
    DEPLOYMENT_REGISTRY_USERNAME: z.string().min(1),
    GITHUB_CONTENT_READ_TOKEN: z.string().optional(),
    GITHUB_CONTENT_REPOSITORY: z.string().regex(/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/),
    OWNER_PASSWORD_HASH: z.string().optional(),
    PGBACKREST_REPO1_CIPHER_PASS: z.string().min(32),
    PGBOUNCER_USERLIST_BASE64: z.string().min(1),
    POSTGRES_DB: z.string().min(1),
    POSTGRES_PASSWORD: z.string().min(16),
    POSTGRES_USER: z.string().min(1),
    SITE_APP_LOGIN_NAME: z.literal('site_app_login'),
    SITE_APP_LOGIN_PASSWORD: z.string().min(16),
    SITE_BASE_URL: z.url(),
    SITE_CONTENT_WORKER_LOGIN_NAME: z.literal('site_content_worker_login'),
    SITE_CONTENT_WORKER_LOGIN_PASSWORD: z.string().min(16),
    SITE_CONTROL_API_LOGIN_NAME: z.literal('site_control_api_login'),
    SITE_CONTROL_API_LOGIN_PASSWORD: z.string().min(16),
    SITE_MIGRATOR_LOGIN_NAME: z.literal('site_migrator_login'),
    SITE_MIGRATOR_LOGIN_PASSWORD: z.string().min(16),
    SITE_REVALIDATION_SECRET: z.string().min(32),
    WEB_DATABASE_URL: z.string().url(),
  })
  .passthrough()

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

function encodeBase64(value: string) {
  return Buffer.from(value, 'utf8').toString('base64')
}

function decodeBase64(value: string, label: string) {
  const normalized = value.replace(/\s+/gu, '')
  if (!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(normalized)) {
    throw new Error(`${label} must be valid base64`)
  }
  const decoded = Buffer.from(normalized, 'base64')
  if (decoded.length === 0 || decoded.toString('base64') !== normalized) {
    throw new Error(`${label} must be valid base64`)
  }
  return decoded.toString('utf8')
}

function parseJson(value: string, label: string): unknown {
  try {
    return JSON.parse(value) as unknown
  } catch {
    throw new Error(`${label} must contain valid JSON`)
  }
}

function hasWorkflowReference(input: unknown, reference: string): boolean {
  if (typeof input !== 'object' || input === null) return false
  if (Array.isArray(input)) return input.some((item) => hasWorkflowReference(item, reference))
  return Object.values(input as Record<string, unknown>).some((value) => {
    if (value === reference) return true
    return hasWorkflowReference(value, reference)
  })
}

function githubOidcPolicies() {
  const issuer = 'https://token.actions.githubusercontent.com'
  const jwksUrl = `${issuer}/.well-known/jwks`
  const audience = 'tungchiahui-control-api'
  const environment = 'production'
  const ref = 'refs/heads/main'
  return [
    {
      audience,
      capabilities: [
        'status:read',
        'infrastructure-operation:create',
        'infrastructure-operation:read',
      ],
      environment,
      issuer,
      jwksUrl,
      ref,
      repository: 'tungchiahui/tungchiahui_web',
      workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/release.yml@refs/heads/main',
    },
    {
      audience,
      capabilities: [
        'translation:dry-run',
        'translation:execute',
        'translation:read',
        'translation:cancel',
      ],
      environment,
      issuer,
      jwksUrl,
      ref,
      repository: 'tungchiahui/tungchiahui_web',
      workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/translation.yml@refs/heads/main',
    },
    {
      audience,
      capabilities: ['application-job:create', 'application-job:read'],
      environment,
      issuer,
      jobWorkflowRef:
        'tungchiahui/tungchiahui_web/.github/workflows/content-sync.yml@refs/heads/main',
      jwksUrl,
      ref,
      repository: 'tungchiahui/tungchiahui_content',
    },
  ]
}

function formatEnvironment(lines: readonly (readonly [string, string] | string)[]) {
  return `${lines
    .map((line) => (typeof line === 'string' ? line : `${line[0]}=${line[1]}`))
    .join('\n')}\n`
}

export function validateProductionEnvironmentContents(contents: string) {
  const placeholderCount = contents.split(placeholderMarker).length - 1
  if (placeholderCount > 0) {
    throw new Error(
      `Production env is incomplete: ${String(placeholderCount)} placeholder values remain`,
    )
  }

  const environment = parseEnv(contents)
  const missing = requiredProductionEnvironmentKeys.filter((key) => !environment[key])
  if (missing.length > 0) {
    throw new Error(`Production env is missing required keys: ${missing.join(', ')}`)
  }
  if (Object.keys(environment).some((key) => key.startsWith('BACKUP_R2_'))) {
    throw new Error('Production env contains obsolete BACKUP_R2_* keys; use BACKUP_OFFSITE_S3_*')
  }

  const parsed = productionEnvironmentSchema.parse(environment)
  parseJson(parsed.CONTROL_OPERATOR_KEYS_JSON, 'CONTROL_OPERATOR_KEYS_JSON')
  const githubOidcPolicy = parseJson(
    parsed.CONTROL_GITHUB_OIDC_POLICY_JSON,
    'CONTROL_GITHUB_OIDC_POLICY_JSON',
  )
  if (!hasWorkflowReference(githubOidcPolicy, releaseWorkflowRef)) {
    throw new Error('CONTROL_GITHUB_OIDC_POLICY_JSON must authorize release.yml on main')
  }
  if (hasWorkflowReference(githubOidcPolicy, legacyDeployWorkflowRef)) {
    throw new Error('CONTROL_GITHUB_OIDC_POLICY_JSON still authorizes retired deploy.yml')
  }

  const backupAgeIdentity = decodeBase64(
    parsed.BACKUP_AGE_IDENTITY_BASE64,
    'BACKUP_AGE_IDENTITY_BASE64',
  )
  if (!backupAgeIdentity.includes('AGE-SECRET-KEY-')) {
    throw new Error('BACKUP_AGE_IDENTITY_BASE64 must decode to an age secret identity')
  }
  const pgbouncerUserlist = decodeBase64(
    parsed.PGBOUNCER_USERLIST_BASE64,
    'PGBOUNCER_USERLIST_BASE64',
  )
  parsePgbouncerScramUserlist(pgbouncerUserlist)

  const assetEndpoint = new URL(parsed.ASSET_S3_ENDPOINT)
  const primaryBackupEndpoint = new URL(parsed.BACKUP_S3_ENDPOINT)
  const offsiteBackupEndpoint = new URL(parsed.BACKUP_OFFSITE_S3_ENDPOINT)
  if (
    assetEndpoint.protocol !== 'https:' ||
    primaryBackupEndpoint.protocol !== 'https:' ||
    offsiteBackupEndpoint.protocol !== 'https:'
  ) {
    throw new Error('Production S3 endpoints must use HTTPS')
  }
  if (parsed.BACKUP_OFFSITE_S3_ACCESS_KEY_ID === parsed.ASSET_S3_ACCESS_KEY_ID) {
    throw new Error('Off-site backup credential must differ from the asset credential')
  }

  return Object.freeze({ keys: Object.keys(environment).length })
}

export function createProductionEnvironmentContents(backupIdentity: string, publicJwk: unknown) {
  const postgresPassword = randomSecret()
  const appPassword = randomSecret()
  const controlPassword = randomSecret()
  const workerPassword = randomSecret()
  const migratorPassword = randomSecret()
  const revalidationSecret = randomSecret(48)
  const repositoryCipher = randomSecret(48)
  const pgbouncerUserlist = [
    `"site_app_login" "${createPostgresScramVerifier(appPassword)}"`,
    `"site_content_worker_login" "${createPostgresScramVerifier(workerPassword)}"`,
    `"site_control_api_login" "${createPostgresScramVerifier(controlPassword)}"`,
    `"site_migrator_login" "${createPostgresScramVerifier(migratorPassword)}"`,
  ].join('\n')
  const operatorKeys = JSON.stringify([
    {
      actorId: 'owner:tungchiahui',
      capabilities: capabilityValues,
      keyId: 'production-owner-v1',
      publicKeyJwk: publicJwkSchema.parse(publicJwk),
    },
  ])

  return formatEnvironment([
    '# Single production env file. Keep this file off-repository, root-owned and mode 0600.',
    '# Recommended production path: /etc/tungchiahui/.env',
    ['POSTGRES_DB', 'tungchiahui'],
    ['POSTGRES_USER', 'tungchiahui'],
    ['POSTGRES_PASSWORD', postgresPassword],
    ['PGBACKREST_REPO1_CIPHER_PASS', repositoryCipher],
    ['WEB_DATABASE_URL', `postgresql://site_app_login:${appPassword}@pgbouncer:6432/tungchiahui`],
    [
      'CONTROL_API_DATABASE_URL',
      `postgresql://site_control_api_login:${controlPassword}@pgbouncer:6432/tungchiahui`,
    ],
    [
      'CONTENT_WORKER_DATABASE_URL',
      `postgresql://site_content_worker_login:${workerPassword}@pgbouncer:6432/tungchiahui`,
    ],
    [
      'DATABASE_MIGRATE_URL',
      `postgresql://site_migrator_login:${migratorPassword}@postgres:5432/tungchiahui`,
    ],
    [
      'DATABASE_ADMIN_URL',
      `postgresql://tungchiahui:${postgresPassword}@postgres:5432/tungchiahui`,
    ],
    ['SITE_APP_LOGIN_NAME', 'site_app_login'],
    ['SITE_APP_LOGIN_PASSWORD', appPassword],
    ['SITE_CONTENT_WORKER_LOGIN_NAME', 'site_content_worker_login'],
    ['SITE_CONTENT_WORKER_LOGIN_PASSWORD', workerPassword],
    ['SITE_CONTROL_API_LOGIN_NAME', 'site_control_api_login'],
    ['SITE_CONTROL_API_LOGIN_PASSWORD', controlPassword],
    ['SITE_MIGRATOR_LOGIN_NAME', 'site_migrator_login'],
    ['SITE_MIGRATOR_LOGIN_PASSWORD', migratorPassword],
    ['SITE_BASE_URL', 'https://www.tungchiahui.cn'],
    ['SITE_REVALIDATION_SECRET', revalidationSecret],
    ['GITHUB_CONTENT_REPOSITORY', 'tungchiahui/tungchiahui_content'],
    ['GITHUB_CONTENT_READ_TOKEN', ''],
    ['CONTROL_OPERATOR_KEYS_JSON', operatorKeys],
    ['CONTROL_GITHUB_OIDC_POLICY_JSON', JSON.stringify(githubOidcPolicies())],
    '# OWNER_PASSWORD_HASH=scrypt:<32-hex-salt>:<128-hex-derived-key>',
    ['ASSET_S3_ENDPOINT', 'https://REPLACE_WITH_ASSET_S3_ENDPOINT'],
    ['ASSET_S3_REGION', 'us-east-1'],
    ['ASSET_S3_BUCKET', 'REPLACE_WITH_ASSET_BUCKET'],
    ['ASSET_S3_ACCESS_KEY_ID', 'REPLACE_WITH_READ_ONLY_ASSET_ACCESS_KEY'],
    ['ASSET_S3_SECRET_ACCESS_KEY', 'REPLACE_WITH_READ_ONLY_ASSET_SECRET_KEY'],
    ['ASSET_S3_FORCE_PATH_STYLE', 'true'],
    ['BACKUP_AGE_RECIPIENT', 'age1REPLACE_WITH_BACKUP_PUBLIC_RECIPIENT'],
    ['BACKUP_AGE_IDENTITY_BASE64', encodeBase64(backupIdentity)],
    ['BACKUP_S3_ENDPOINT', 'https://REPLACE_WITH_SAME_ALIST_ENDPOINT_AS_ASSET_S3'],
    ['BACKUP_S3_REGION', 'us-east-1'],
    ['BACKUP_S3_BUCKET', 'REPLACE_WITH_SAME_ALIST_BUCKET_AS_ASSET_S3'],
    ['BACKUP_S3_ACCESS_KEY_ID', 'REPLACE_WITH_SAME_ALIST_ACCESS_KEY_AS_ASSET_S3'],
    ['BACKUP_S3_SECRET_ACCESS_KEY', 'REPLACE_WITH_SAME_ALIST_SECRET_KEY_AS_ASSET_S3'],
    ['BACKUP_S3_FORCE_PATH_STYLE', 'true'],
    ['BACKUP_OFFSITE_S3_ENDPOINT', 'https://REPLACE_WITH_OFFSITE_S3_ENDPOINT'],
    ['BACKUP_OFFSITE_S3_REGION', 'auto'],
    ['BACKUP_OFFSITE_S3_BUCKET', 'REPLACE_WITH_OFFSITE_BACKUP_BUCKET'],
    ['BACKUP_OFFSITE_S3_ACCESS_KEY_ID', 'REPLACE_WITH_OFFSITE_BACKUP_ACCESS_KEY'],
    ['BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY', 'REPLACE_WITH_OFFSITE_BACKUP_SECRET_KEY'],
    ['BACKUP_OFFSITE_S3_FORCE_PATH_STYLE', 'false'],
    ['DEPLOYMENT_REGISTRY_USERNAME', 'REPLACE_WITH_GHCR_USERNAME'],
    ['DEPLOYMENT_REGISTRY_TOKEN', 'REPLACE_WITH_GHCR_PACKAGE_READ_TOKEN'],
    ['PGBOUNCER_USERLIST_BASE64', encodeBase64(pgbouncerUserlist)],
  ])
}

export function initializeProductionSecrets(outputPath = defaultProductionEnvPath) {
  const userHome = homedir()
  const backupIdentityPath = resolve(userHome, '.config/tungchiahui-production/backup-age-key.txt')
  const operatorPrivatePath = resolve(
    userHome,
    '.config/tungchiahui-production/operator-private-v1.json',
  )
  const productionEnvPath = resolve(outputPath)

  if (!existsSync(backupIdentityPath)) {
    throw new Error(`Required backup age identity is missing: ${backupIdentityPath}`)
  }
  for (const output of [operatorPrivatePath, productionEnvPath]) {
    if (existsSync(output))
      throw new Error(`Refusing to overwrite production secret material: ${output}`)
  }

  const backupIdentity = readFileSync(backupIdentityPath, 'utf8')
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privateJwk = privateJwkSchema.parse(privateKey.export({ format: 'jwk' }))
  const contents = createProductionEnvironmentContents(
    backupIdentity,
    publicKey.export({ format: 'jwk' }),
  )
  const placeholdersRemaining = contents.split(placeholderMarker).length - 1

  mkdirSync(dirname(operatorPrivatePath), { mode: 0o700, recursive: true })
  mkdirSync(dirname(productionEnvPath), { mode: 0o700, recursive: true })
  writeFileSync(operatorPrivatePath, `${JSON.stringify(privateJwk)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  writeFileSync(productionEnvPath, contents, { flag: 'wx', mode: 0o600 })

  console.log(
    JSON.stringify(
      {
        next: `edit ${productionEnvPath} and replace every REPLACE_WITH_ value, then run ./site production secrets validate --env-file ${productionEnvPath}`,
        operatorPrivatePath,
        placeholdersRemaining,
        productionEnvPath,
        status: 'initialized',
      },
      null,
      2,
    ),
  )
}

export function validateProductionSecrets(envFile = defaultProductionEnvPath) {
  const productionEnvPath = resolve(envFile)
  if (!existsSync(productionEnvPath)) {
    throw new Error(`Production env file is missing: ${productionEnvPath}`)
  }
  const result = validateProductionEnvironmentContents(readFileSync(productionEnvPath, 'utf8'))
  console.log(
    JSON.stringify(
      {
        keys: result.keys,
        productionEnvPath,
        status: 'valid',
      },
      null,
      2,
    ),
  )
}
