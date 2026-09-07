import { spawnSync } from 'node:child_process'
import { generateKeyPairSync, randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { homedir } from 'node:os'
import { dirname, resolve } from 'node:path'

import { stringify } from 'yaml'
import { z } from 'zod'

import { capabilityValues } from '../../src/control-plane/contracts'
import { createPostgresScramVerifier } from '../../src/database/postgres-scram'

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

function parseEnvironmentKeys(label: string, contents: string) {
  const keys = new Set<string>()
  for (const line of contents.split('\n')) {
    const trimmed = line.trim()
    if (trimmed.length === 0 || trimmed.startsWith('#')) continue
    const separator = trimmed.indexOf('=')
    const key = separator > 0 ? trimmed.slice(0, separator) : ''
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) {
      throw new Error(`${label} contains an invalid environment assignment`)
    }
    if (keys.has(key)) throw new Error(`${label} contains duplicate key ${key}`)
    keys.add(key)
  }
  return keys
}

function requireEnvironmentKeys(label: string, contents: string, required: readonly string[]) {
  const keys = parseEnvironmentKeys(label, contents)
  const missing = required.filter((key) => !keys.has(key))
  if (missing.length > 0)
    throw new Error(`${label} is missing required keys: ${missing.join(', ')}`)
  return keys
}

const productionSecretDocumentSchema = z
  .object({
    backup_age_identity: z.string().min(1),
    backup_env: z.string().min(1),
    content_worker_env: z.string().min(1),
    control_api_env: z.string().min(1),
    database_migrate_env: z.string().min(1),
    database_role_bootstrap_env: z.string().min(1),
    deployment_registry_env: z.string().min(1),
    observability_env: z.string(),
    pgbouncer_userlist: z.string().min(1),
    postgres_env: z.string().min(1),
    web_env: z.string().min(1),
  })
  .strict()

function run(executable: string, arguments_: readonly string[], input?: string) {
  const result = spawnSync(executable, arguments_, {
    encoding: 'utf8',
    ...(input === undefined ? {} : { input }),
  })
  if (result.status !== 0) {
    throw new Error(`${executable} failed: ${result.stderr.trim() || 'unknown error'}`)
  }
  return result.stdout
}

function randomSecret(bytes = 32) {
  return randomBytes(bytes).toString('base64url')
}

export function validateProductionSecretDocument(input: unknown) {
  const document = productionSecretDocumentSchema.parse(input)
  const placeholdersRemaining = Object.values(document).reduce(
    (count, value) => count + value.split(placeholderMarker).length - 1,
    0,
  )
  if (placeholdersRemaining > 0) {
    throw new Error(
      `Production secrets are incomplete: ${String(placeholdersRemaining)} placeholder values remain`,
    )
  }
  const backupKeys = requireEnvironmentKeys('backup_env', document.backup_env, [
    'PGBACKREST_REPO1_CIPHER_PASS',
    'BACKUP_AGE_RECIPIENT',
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
  ])
  if ([...backupKeys].some((key) => key.startsWith('BACKUP_R2_'))) {
    throw new Error('backup_env contains obsolete BACKUP_R2_* keys; use BACKUP_OFFSITE_S3_*')
  }
  requireEnvironmentKeys('web_env', document.web_env, [
    'DATABASE_URL',
    'SITE_BASE_URL',
    'SITE_REVALIDATION_SECRET',
    'ASSET_S3_ENDPOINT',
    'ASSET_S3_REGION',
    'ASSET_S3_BUCKET',
    'ASSET_S3_ACCESS_KEY_ID',
    'ASSET_S3_SECRET_ACCESS_KEY',
    'ASSET_S3_FORCE_PATH_STYLE',
  ])
  requireEnvironmentKeys('deployment_registry_env', document.deployment_registry_env, [
    'DEPLOYMENT_REGISTRY_USERNAME',
    'DEPLOYMENT_REGISTRY_TOKEN',
  ])
  return Object.freeze({ sections: Object.keys(document).length })
}

export function createSopsEncryptArguments(recipient: string) {
  return Object.freeze([
    'encrypt',
    '--age',
    recipient,
    '--input-type',
    'yaml',
    '--output-type',
    'yaml',
    '--filename-override',
    'production.sops.yaml',
  ])
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
      workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/deploy.yml@refs/heads/main',
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

export function initializeProductionSecrets() {
  const userHome = homedir()
  const sopsIdentityPath = resolve(userHome, '.config/sops/age/keys.txt')
  const backupIdentityPath = resolve(userHome, '.config/tungchiahui-production/backup-age-key.txt')
  const operatorPrivatePath = resolve(
    userHome,
    '.config/tungchiahui-production/operator-private-v1.json',
  )
  const encryptedSecretPath = resolve('ops/production/secrets/production.sops.yaml')

  for (const requiredPath of [sopsIdentityPath, backupIdentityPath]) {
    if (!existsSync(requiredPath))
      throw new Error(`Required age identity is missing: ${requiredPath}`)
  }
  for (const outputPath of [operatorPrivatePath, encryptedSecretPath]) {
    if (existsSync(outputPath)) {
      throw new Error(`Refusing to overwrite existing production secret material: ${outputPath}`)
    }
  }

  const sopsRecipient = run('age-keygen', ['--y', sopsIdentityPath]).trim()
  const backupIdentity = readFileSync(backupIdentityPath, 'utf8')
  const backupRecipient = run('age-keygen', ['--y', backupIdentityPath]).trim()
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const privateJwk = privateJwkSchema.parse(privateKey.export({ format: 'jwk' }))
  const publicJwk = publicJwkSchema.parse(publicKey.export({ format: 'jwk' }))

  const postgresPassword = randomSecret()
  const appPassword = randomSecret()
  const controlPassword = randomSecret()
  const workerPassword = randomSecret()
  const migratorPassword = randomSecret()
  const revalidationSecret = randomSecret(48)
  const repositoryCipher = randomSecret(48)
  const operatorKeys = JSON.stringify([
    {
      actorId: 'owner:tungchiahui',
      capabilities: capabilityValues,
      keyId: 'production-owner-v1',
      publicKeyJwk: publicJwk,
    },
  ])

  const payload = {
    backup_age_identity: backupIdentity,
    backup_env: [
      `PGBACKREST_REPO1_CIPHER_PASS=${repositoryCipher}`,
      `BACKUP_AGE_RECIPIENT=${backupRecipient}`,
      'BACKUP_S3_ENDPOINT=REPLACE_WITH_SAME_HTTPS_ALIST_ENDPOINT_AS_ASSET_S3',
      'BACKUP_S3_REGION=us-east-1',
      'BACKUP_S3_BUCKET=REPLACE_WITH_SAME_ALIST_BUCKET_AS_ASSET_S3',
      'BACKUP_S3_ACCESS_KEY_ID=REPLACE_WITH_SAME_ALIST_ACCESS_KEY_AS_ASSET_S3',
      'BACKUP_S3_SECRET_ACCESS_KEY=REPLACE_WITH_SAME_ALIST_SECRET_KEY_AS_ASSET_S3',
      'BACKUP_S3_FORCE_PATH_STYLE=true',
      'BACKUP_OFFSITE_S3_ENDPOINT=REPLACE_WITH_HTTPS_OFFSITE_S3_ENDPOINT',
      'BACKUP_OFFSITE_S3_REGION=auto',
      'BACKUP_OFFSITE_S3_BUCKET=REPLACE_WITH_OFFSITE_BACKUP_BUCKET',
      'BACKUP_OFFSITE_S3_ACCESS_KEY_ID=REPLACE_WITH_OFFSITE_BACKUP_ACCESS_KEY',
      'BACKUP_OFFSITE_S3_SECRET_ACCESS_KEY=REPLACE_WITH_OFFSITE_BACKUP_SECRET_KEY',
      'BACKUP_OFFSITE_S3_FORCE_PATH_STYLE=false',
    ].join('\n'),
    content_worker_env: [
      `DATABASE_URL=postgresql://site_content_worker_login:${workerPassword}@pgbouncer:6432/tungchiahui`,
      'GITHUB_CONTENT_REPOSITORY=tungchiahui/tungchiahui_content',
      'GITHUB_CONTENT_READ_TOKEN=',
      `SITE_REVALIDATION_SECRET=${revalidationSecret}`,
    ].join('\n'),
    control_api_env: [
      `DATABASE_URL=postgresql://site_control_api_login:${controlPassword}@pgbouncer:6432/tungchiahui`,
      `CONTROL_OPERATOR_KEYS_JSON=${operatorKeys}`,
      `CONTROL_GITHUB_OIDC_POLICY_JSON=${JSON.stringify(githubOidcPolicies())}`,
    ].join('\n'),
    database_migrate_env: `DATABASE_URL=postgresql://site_migrator_login:${migratorPassword}@postgres:5432/tungchiahui`,
    database_role_bootstrap_env: [
      `DATABASE_ADMIN_URL=postgresql://tungchiahui:${postgresPassword}@postgres:5432/tungchiahui`,
      'SITE_APP_LOGIN_NAME=site_app_login',
      `SITE_APP_LOGIN_PASSWORD=${appPassword}`,
      'SITE_CONTENT_WORKER_LOGIN_NAME=site_content_worker_login',
      `SITE_CONTENT_WORKER_LOGIN_PASSWORD=${workerPassword}`,
      'SITE_CONTROL_API_LOGIN_NAME=site_control_api_login',
      `SITE_CONTROL_API_LOGIN_PASSWORD=${controlPassword}`,
      'SITE_MIGRATOR_LOGIN_NAME=site_migrator_login',
      `SITE_MIGRATOR_LOGIN_PASSWORD=${migratorPassword}`,
    ].join('\n'),
    deployment_registry_env: [
      'DEPLOYMENT_REGISTRY_USERNAME=REPLACE_WITH_GHCR_USERNAME',
      'DEPLOYMENT_REGISTRY_TOKEN=REPLACE_WITH_GHCR_PACKAGE_READ_TOKEN',
    ].join('\n'),
    observability_env: '',
    pgbouncer_userlist: [
      `"site_app_login" "${createPostgresScramVerifier(appPassword)}"`,
      `"site_content_worker_login" "${createPostgresScramVerifier(workerPassword)}"`,
      `"site_control_api_login" "${createPostgresScramVerifier(controlPassword)}"`,
      `"site_migrator_login" "${createPostgresScramVerifier(migratorPassword)}"`,
    ].join('\n'),
    postgres_env: [
      'POSTGRES_DB=tungchiahui',
      'POSTGRES_USER=tungchiahui',
      `POSTGRES_PASSWORD=${postgresPassword}`,
      `PGBACKREST_REPO1_CIPHER_PASS=${repositoryCipher}`,
    ].join('\n'),
    web_env: [
      `DATABASE_URL=postgresql://site_app_login:${appPassword}@pgbouncer:6432/tungchiahui`,
      'SITE_BASE_URL=https://www.tungchiahui.cn',
      `SITE_REVALIDATION_SECRET=${revalidationSecret}`,
      'ASSET_S3_ENDPOINT=REPLACE_WITH_HTTPS_ASSET_S3_ENDPOINT',
      'ASSET_S3_REGION=us-east-1',
      'ASSET_S3_BUCKET=REPLACE_WITH_ASSET_BUCKET',
      'ASSET_S3_ACCESS_KEY_ID=REPLACE_WITH_READ_ONLY_ASSET_ACCESS_KEY',
      'ASSET_S3_SECRET_ACCESS_KEY=REPLACE_WITH_READ_ONLY_ASSET_SECRET_KEY',
      'ASSET_S3_FORCE_PATH_STYLE=true',
    ].join('\n'),
  }

  const plaintextPayload = stringify(payload)
  const placeholdersRemaining = plaintextPayload.split(placeholderMarker).length - 1

  const encrypted = run('sops', createSopsEncryptArguments(sopsRecipient), plaintextPayload)
  if (!encrypted.includes('ENC[AES256_GCM')) throw new Error('SOPS did not encrypt the payload')

  mkdirSync(dirname(operatorPrivatePath), { mode: 0o700, recursive: true })
  mkdirSync(dirname(encryptedSecretPath), { recursive: true })
  writeFileSync(operatorPrivatePath, `${JSON.stringify(privateJwk)}\n`, {
    flag: 'wx',
    mode: 0o600,
  })
  writeFileSync(encryptedSecretPath, encrypted, { flag: 'wx', mode: 0o600 })

  console.log(
    JSON.stringify(
      {
        encryptedSecretPath,
        next: `sops ${encryptedSecretPath}`,
        operatorPrivatePath,
        placeholdersRemaining,
        status: 'initialized',
      },
      null,
      2,
    ),
  )
}

export function validateProductionSecrets() {
  const encryptedSecretPath = resolve('ops/production/secrets/production.sops.yaml')
  if (!existsSync(encryptedSecretPath)) {
    throw new Error(`Encrypted production secret file is missing: ${encryptedSecretPath}`)
  }

  const decryptedJson = run('sops', ['--decrypt', '--output-type', 'json', encryptedSecretPath])
  let document: unknown
  try {
    document = JSON.parse(decryptedJson)
  } catch {
    throw new Error('SOPS decrypted the production secret file, but it is not valid JSON')
  }
  const result = validateProductionSecretDocument(document)
  console.log(
    JSON.stringify(
      {
        encryptedSecretPath,
        sections: result.sections,
        status: 'valid',
      },
      null,
      2,
    ),
  )
}
