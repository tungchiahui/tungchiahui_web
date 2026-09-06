import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { stringify } from 'yaml'
import { z } from 'zod'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import {
  claimNextInfrastructureOperation,
  createConsistentControlStateSnapshot,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  getInfrastructureOperation,
  initializeControlState,
  inspectControlStateSnapshot,
  listControlAuditEvents,
  readDeploymentState,
  restoreControlStateSnapshot,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import { seedDevelopmentDatabase } from '../../src/database/seed'
import { SearchIndexRepository } from '../../src/search/repository'
import {
  executeServerMigrationOperation,
  type ServerMigrationPlatform,
} from '../../src/server-migration/engine'
import { controlRequest } from '../control/client'

const input = z
  .object({
    PHASE12_GIT_SHA: z.string().regex(/^[a-f0-9]{40}$/),
    PHASE12_HOST_GID: z.coerce.number().int().nonnegative(),
    PHASE12_HOST_ROOT: z.string().startsWith('/'),
    PHASE12_HOST_UID: z.coerce.number().int().nonnegative(),
    PHASE12_ORIGIN_PORT: z.coerce.number().int().min(1024).max(65_535),
    PHASE15_REGISTRY_PORT: z.coerce.number().int().min(1024).max(65_535),
    PHASE17_TARGET_ORIGIN_PORT: z.coerce.number().int().min(1024).max(65_535),
  })
  .parse(process.env)

const projectName = `tungchiahui-phase12-${process.pid}`
const registryContainer = `${projectName}-registry`
const registryImage =
  'registry:3.0.0@sha256:6c5666b861f3505b116bb9aa9b25175e71210414bd010d92035ff64018f9457e'
const registryRepository = `127.0.0.1:${String(input.PHASE15_REGISTRY_PORT)}/tungchiahui-web`
const registryTag = `${registryRepository}:${input.PHASE12_GIT_SHA}`
let registryDigest = ''
const webImage = `tungchiahui-web:${input.PHASE12_GIT_SHA}`
const serviceImage = `tungchiahui-services:${input.PHASE12_GIT_SHA}`
const recoveryImage = `tungchiahui-recovery:${input.PHASE12_GIT_SHA}`
const postgresImage = `tungchiahui-postgres:${input.PHASE12_GIT_SHA}`
const trivyImage =
  'aquasec/trivy@sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969'
const configRoot = join(input.PHASE12_HOST_ROOT, 'etc')
const dataRoot = join(input.PHASE12_HOST_ROOT, 'var')
const secretRoot = join(input.PHASE12_HOST_ROOT, 'run', 'secrets')
const workRoot = join(input.PHASE12_HOST_ROOT, 'work')
const identityPath = join(workRoot, 'age-identity.txt')
const plainSecretPath = join(workRoot, 'production.plain.yaml')
const encryptedSecretPath = join(workRoot, 'production.sops.yaml')
const inventoryPath = join(workRoot, 'inventory.yml')
const variablesPath = join(workRoot, 'variables.json')
const targetProjectName = `tungchiahui-phase17-target-${process.pid}`
const targetRoot = join(input.PHASE12_HOST_ROOT, 'phase17-target')
const targetConfigRoot = join(targetRoot, 'etc')
const targetDataRoot = join(targetRoot, 'var')
const targetSecretRoot = join(targetRoot, 'run', 'secrets')
const targetWorkRoot = join(targetRoot, 'work')
const targetInventoryPath = join(targetWorkRoot, 'inventory.yml')
const targetVariablesPath = join(targetWorkRoot, 'variables.json')

for (const directory of [configRoot, dataRoot, secretRoot, workRoot]) {
  mkdirSync(directory, { mode: 0o755, recursive: true })
}
for (const directory of [targetConfigRoot, targetDataRoot, targetSecretRoot, targetWorkRoot]) {
  mkdirSync(directory, { mode: 0o755, recursive: true })
}
chmodSync(input.PHASE12_HOST_ROOT, 0o755)

function execute(
  executable: string,
  arguments_: readonly string[],
  options: Readonly<{
    allowFailure?: boolean
    environment?: Readonly<Record<string, string>>
    input?: string
  }> = {},
) {
  const result = spawnSync(executable, arguments_, {
    encoding: 'utf8',
    env: { ...process.env, ...options.environment },
    input: options.input,
    maxBuffer: 64 * 1_024 * 1_024,
  })
  if (result.error) throw result.error
  if (result.status !== 0 && options.allowFailure !== true) {
    throw new Error(
      `${executable} ${arguments_.join(' ')} failed (${String(result.status)}):\n${result.stdout}\n${result.stderr}`,
    )
  }
  return Object.freeze({
    status: result.status ?? 1,
    stderr: result.stderr,
    stdout: result.stdout,
  })
}

function composeEnvironment() {
  const socket = execute('stat', ['--format=%g', '/var/run/docker.sock']).stdout.trim()
  return {
    TUNGCHIAHUI_BLUE_CONTAINER_NAME: `${projectName}-web-blue-1`,
    TUNGCHIAHUI_BLUE_DEPLOYMENT_SHA: input.PHASE12_GIT_SHA,
    TUNGCHIAHUI_CONFIG_ROOT: configRoot,
    TUNGCHIAHUI_CONTENT_POLLING_ENABLED: 'false',
    TUNGCHIAHUI_CONTROL_RATE_LIMIT_PER_MINUTE: '1000',
    TUNGCHIAHUI_DATA_ROOT: dataRoot,
    TUNGCHIAHUI_DEPLOYMENT_ARTICLE_PATH: '/blog/phase-3-seed',
    TUNGCHIAHUI_DEPLOYMENT_ASSET_PATH: '/docs/ros2/core/index.html',
    TUNGCHIAHUI_DEPLOYMENT_BACKUP_MAX_AGE_SECONDS: '86400',
    TUNGCHIAHUI_DEPLOYMENT_STABILIZATION_SECONDS: '0',
    TUNGCHIAHUI_DEPLOYMENT_IMAGE_REPOSITORY: registryRepository,
    TUNGCHIAHUI_DEPLOYMENT_SEARCH_QUERY: 'ROS2_Control',
    TUNGCHIAHUI_DOCKER_SOCKET_GID: socket,
    TUNGCHIAHUI_GREEN_CONTAINER_NAME: `${projectName}-web-green-1`,
    TUNGCHIAHUI_GREEN_DEPLOYMENT_SHA: input.PHASE12_GIT_SHA,
    TUNGCHIAHUI_MIGRATION_CONTAINER_NAME: `${projectName}-database-migrate-1`,
    TUNGCHIAHUI_OPENRESTY_CONTAINER_NAME: `${projectName}-openresty-1`,
    TUNGCHIAHUI_ORIGIN_PORT: String(input.PHASE12_ORIGIN_PORT),
    TUNGCHIAHUI_OBSERVABILITY_BACKUP_MAX_AGE_SECONDS: '86400',
    TUNGCHIAHUI_OBSERVABILITY_DISK_CRITICAL_PERCENT: '99',
    TUNGCHIAHUI_OBSERVABILITY_INTERVAL_SECONDS: '10',
    TUNGCHIAHUI_OBSERVABILITY_JOB_MAX_AGE_SECONDS: '3600',
    TUNGCHIAHUI_OBSERVABILITY_LATENCY_WARNING_MS: '10000',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_HOSTNAME: 'localhost',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_IPV6_REQUIRED: 'false',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_SERVER_NAME: 'ddns.tungchiahui.cn',
    TUNGCHIAHUI_OBSERVABILITY_ORIGIN_URL: 'http://openresty:8082/api/ready',
    TUNGCHIAHUI_OBSERVABILITY_PUBLIC_ASSET_PATH: '/api/assets/monitoring/health.svg',
    TUNGCHIAHUI_OBSERVABILITY_PUBLIC_SERVER_NAME: 'www.tungchiahui.cn',
    TUNGCHIAHUI_OBSERVABILITY_PUBLIC_URL: 'http://openresty:8082/',
    TUNGCHIAHUI_OBSERVABILITY_RESTORE_DRILL_MAX_AGE_SECONDS: '86400',
    TUNGCHIAHUI_OBSERVABILITY_RESTORE_DRILL_TIMESTAMP: new Date().toISOString(),
    TUNGCHIAHUI_POSTGRES_CONTAINER_NAME: `${projectName}-postgres-1`,
    TUNGCHIAHUI_POSTGRES_IMAGE: postgresImage,
    TUNGCHIAHUI_RECOVERY_IMAGE: recoveryImage,
    TUNGCHIAHUI_SEARCH_POLLING_ENABLED: 'false',
    TUNGCHIAHUI_SECRET_DIRECTORY: secretRoot,
    TUNGCHIAHUI_SERVICE_IMAGE: serviceImage,
    TUNGCHIAHUI_WEB_BLUE_IMAGE: webImage,
    TUNGCHIAHUI_WEB_GREEN_IMAGE: webImage,
  }
}

function compose(arguments_: readonly string[], allowFailure = false) {
  return execute(
    'docker',
    [
      'compose',
      '--project-name',
      projectName,
      '--file',
      join(configRoot, 'compose.yaml'),
      ...arguments_,
    ],
    { allowFailure, environment: composeEnvironment() },
  )
}

function targetComposeEnvironment() {
  const socket = execute('stat', ['--format=%g', '/var/run/docker.sock']).stdout.trim()
  return {
    ...composeEnvironment(),
    TUNGCHIAHUI_BLUE_CONTAINER_NAME: `${targetProjectName}-web-blue-1`,
    TUNGCHIAHUI_CONFIG_ROOT: targetConfigRoot,
    TUNGCHIAHUI_DATA_ROOT: targetDataRoot,
    TUNGCHIAHUI_DOCKER_SOCKET_GID: socket,
    TUNGCHIAHUI_GREEN_CONTAINER_NAME: `${targetProjectName}-web-green-1`,
    TUNGCHIAHUI_MIGRATION_CONTAINER_NAME: `${targetProjectName}-database-migrate-1`,
    TUNGCHIAHUI_OPENRESTY_CONTAINER_NAME: `${targetProjectName}-openresty-1`,
    TUNGCHIAHUI_ORIGIN_BIND_ADDRESS: '::1',
    TUNGCHIAHUI_ORIGIN_PORT: String(input.PHASE17_TARGET_ORIGIN_PORT),
    TUNGCHIAHUI_POSTGRES_CONTAINER_NAME: `${targetProjectName}-postgres-1`,
    TUNGCHIAHUI_SECRET_DIRECTORY: targetSecretRoot,
  }
}

function targetCompose(arguments_: readonly string[], allowFailure = false) {
  return execute(
    'docker',
    [
      'compose',
      '--project-name',
      targetProjectName,
      '--file',
      join(targetConfigRoot, 'compose.yaml'),
      ...arguments_,
    ],
    { allowFailure, environment: targetComposeEnvironment() },
  )
}

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function createEncryptedSecret() {
  execute('age-keygen', ['--output', identityPath])
  chmodSync(identityPath, 0o600)
  const recipient = execute('age-keygen', ['--y', identityPath]).stdout.trim()
  const { privateKey, publicKey } = generateKeyPairSync('ed25519')
  const publicJwk = publicKey.export({ format: 'jwk' })
  const privateJwk = privateKey.export({ format: 'jwk' })
  writeFileSync(join(workRoot, 'operator-private.json'), JSON.stringify(privateJwk), {
    mode: 0o600,
  })
  const operatorKeys = JSON.stringify([
    {
      actorId: 'phase12-production-like-operator',
      capabilities: [
        'status:read',
        'infrastructure-operation:create',
        'infrastructure-operation:read',
      ],
      keyId: 'phase12-test-operator',
      publicKeyJwk: publicJwk,
    },
  ])
  const githubPolicy = JSON.stringify([
    {
      audience: 'tungchiahui-control-api',
      capabilities: ['translation:read'],
      environment: 'production',
      issuer: 'https://token.actions.githubusercontent.com',
      jwksUrl: 'https://token.actions.githubusercontent.com/.well-known/jwks',
      ref: 'refs/heads/main',
      repository: 'tungchiahui/tungchiahui_web',
      workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/translation.yml@refs/heads/main',
    },
  ])
  const testPassword = 'phase12-disposable-password'
  const testSecret = 'phase12-disposable-revalidation-secret-value'
  const appPassword = 'phase12-disposable-app-password-0001'
  const controlPassword = 'phase12-disposable-control-password-0001'
  const migratorPassword = 'phase12-disposable-migrator-password-0001'
  const workerPassword = 'phase12-disposable-worker-password-0001'
  const payload = {
    backup_age_identity: readFileSync(identityPath, 'utf8'),
    backup_env: [
      `PGBACKREST_REPO1_CIPHER_PASS=phase13-disposable-pgbackrest-cipher-${'x'.repeat(48)}`,
      `BACKUP_AGE_RECIPIENT=${recipient}`,
      'BACKUP_S3_ENDPOINT=https://phase13.r2.cloudflarestorage.com',
      'BACKUP_S3_REGION=auto',
      'BACKUP_S3_BUCKET=phase13-offsite-backup',
      'BACKUP_S3_ACCESS_KEY_ID=phase13-backup-only-access',
      'BACKUP_S3_SECRET_ACCESS_KEY=phase13-backup-only-secret',
      'BACKUP_S3_FORCE_PATH_STYLE=false',
    ].join('\n'),
    content_worker_env: [
      `DATABASE_URL=postgresql://site_content_worker_login:${workerPassword}@pgbouncer:6432/tungchiahui`,
      'GITHUB_CONTENT_REPOSITORY=tungchiahui/tungchiahui_content',
      `SITE_REVALIDATION_SECRET=${testSecret}`,
    ].join('\n'),
    control_api_env: [
      `DATABASE_URL=postgresql://site_control_api_login:${controlPassword}@pgbouncer:6432/tungchiahui`,
      `CONTROL_OPERATOR_KEYS_JSON=${operatorKeys}`,
      `CONTROL_GITHUB_OIDC_POLICY_JSON=${githubPolicy}`,
    ].join('\n'),
    deployment_registry_env: '\n',
    database_role_bootstrap_env: [
      `DATABASE_ADMIN_URL=postgresql://tungchiahui:${testPassword}@postgres:5432/tungchiahui`,
      'SITE_APP_LOGIN_NAME=site_app_login',
      `SITE_APP_LOGIN_PASSWORD=${appPassword}`,
      'SITE_CONTENT_WORKER_LOGIN_NAME=site_content_worker_login',
      `SITE_CONTENT_WORKER_LOGIN_PASSWORD=${workerPassword}`,
      'SITE_CONTROL_API_LOGIN_NAME=site_control_api_login',
      `SITE_CONTROL_API_LOGIN_PASSWORD=${controlPassword}`,
      'SITE_MIGRATOR_LOGIN_NAME=site_migrator_login',
      `SITE_MIGRATOR_LOGIN_PASSWORD=${migratorPassword}`,
    ].join('\n'),
    database_migrate_env: [
      `DATABASE_URL=postgresql://site_migrator_login:${migratorPassword}@postgres:5432/tungchiahui`,
    ].join('\n'),
    observability_env: '\n',
    pgbouncer_userlist: [
      `"site_app_login" "${appPassword}"`,
      `"site_content_worker_login" "${workerPassword}"`,
      `"site_control_api_login" "${controlPassword}"`,
      `"site_migrator_login" "${migratorPassword}"`,
    ].join('\n'),
    postgres_env: [
      'POSTGRES_DB=tungchiahui',
      'POSTGRES_USER=tungchiahui',
      `POSTGRES_PASSWORD=${testPassword}`,
      `PGBACKREST_REPO1_CIPHER_PASS=phase13-disposable-pgbackrest-cipher-${'x'.repeat(48)}`,
    ].join('\n'),
    web_env: [
      `DATABASE_URL=postgresql://site_app_login:${appPassword}@pgbouncer:6432/tungchiahui`,
      'SITE_BASE_URL=https://www.tungchiahui.cn',
      `SITE_REVALIDATION_SECRET=${testSecret}`,
      'ASSET_S3_ENDPOINT=https://s3.example.invalid',
      'ASSET_S3_REGION=us-east-1',
      'ASSET_S3_BUCKET=phase12-disposable-assets',
      'ASSET_S3_ACCESS_KEY_ID=phase12-disposable-access',
      'ASSET_S3_SECRET_ACCESS_KEY=phase12-disposable-secret',
      'ASSET_S3_FORCE_PATH_STYLE=true',
    ].join('\n'),
  }
  writeFileSync(plainSecretPath, stringify(payload), { mode: 0o600 })
  execute('sops', [
    '--encrypt',
    '--age',
    recipient,
    '--input-type',
    'yaml',
    '--output-type',
    'yaml',
    '--output',
    encryptedSecretPath,
    plainSecretPath,
  ])
  const encrypted = readFileSync(encryptedSecretPath, 'utf8')
  expect(encrypted.includes('ENC[AES256_GCM'), 'SOPS output is not encrypted')
  for (const password of [
    testPassword,
    appPassword,
    controlPassword,
    migratorPassword,
    workerPassword,
  ]) {
    expect(!encrypted.includes(password), 'SOPS output leaked a plaintext secret')
  }
  return {
    identityPath,
    secretSentinels: [
      testPassword,
      testSecret,
      appPassword,
      controlPassword,
      migratorPassword,
      workerPassword,
      'phase12-disposable-access',
      'phase12-disposable-secret',
      'phase13-primary-only-secret',
      'phase13-r2-only-secret',
    ],
    workerPassword,
  }
}

function buildImages() {
  execute('docker', [
    'build',
    '--file',
    'ops/production/images/services.Dockerfile',
    '--tag',
    serviceImage,
    '.',
  ])
  execute('docker', [
    'build',
    '--file',
    'ops/production/images/postgres.Dockerfile',
    '--tag',
    postgresImage,
    '.',
  ])
  execute('docker', [
    'build',
    '--file',
    'ops/production/images/recovery.Dockerfile',
    '--tag',
    recoveryImage,
    '.',
  ])
  execute('docker', [
    'build',
    '--build-arg',
    `SITE_DEPLOYMENT_SHA=${input.PHASE12_GIT_SHA}`,
    '--file',
    'ops/production/images/web.Dockerfile',
    '--tag',
    webImage,
    '.',
  ])
  execute('docker', ['tag', webImage, registryTag])
  execute('docker', ['push', registryTag])
  const repositoryDigest = execute('docker', [
    'image',
    'inspect',
    '--format',
    '{{index .RepoDigests 0}}',
    registryTag,
  ]).stdout.trim()
  registryDigest =
    z
      .string()
      .regex(/^127\.0\.0\.1:[0-9]+\/tungchiahui-web@sha256:[a-f0-9]{64}$/)
      .parse(repositoryDigest)
      .split('@')[1] ?? ''
}

function verifyImageSecurity() {
  const cacheRoot = join(workRoot, 'trivy-cache')
  mkdirSync(cacheRoot, { mode: 0o755, recursive: true })
  execute('docker', ['pull', trivyImage])
  const images = [
    webImage,
    serviceImage,
    recoveryImage,
    postgresImage,
    'openresty/openresty:1.31.1.1-2-alpine-fat@sha256:427d94fea0c24b099e7891e8d1b7976f6d008e2d427e56bab725c8b8b293795b',
    'percona/percona-pgbouncer:1.25.2-5@sha256:ee8f9b3e8b80b379b47ae41419a0d16de7a20c2be0cae5dbf55fe403d3d9f33d',
  ]
  for (const image of images) {
    execute('docker', [
      'run',
      '--rm',
      '--volume',
      '/var/run/docker.sock:/var/run/docker.sock',
      '--volume',
      `${cacheRoot}:/root/.cache`,
      trivyImage,
      'image',
      '--scanners',
      'vuln,secret',
      '--severity',
      'CRITICAL',
      '--exit-code',
      '1',
      '--quiet',
      image,
    ])
    const sbom = execute('docker', [
      'run',
      '--rm',
      '--volume',
      '/var/run/docker.sock:/var/run/docker.sock',
      '--volume',
      `${cacheRoot}:/root/.cache`,
      trivyImage,
      'image',
      '--format',
      'cyclonedx',
      '--scanners',
      'vuln',
      '--skip-db-update',
      '--quiet',
      image,
    ]).stdout
    const components = z
      .object({ components: z.array(z.unknown()).min(1) })
      .passthrough()
      .parse(JSON.parse(sbom) as unknown).components
    expect(components.length > 0, `${image} produced an empty SBOM`)
  }
}

function startRegistry() {
  execute('docker', [
    'run',
    '--detach',
    '--name',
    registryContainer,
    '--publish',
    `127.0.0.1:${String(input.PHASE15_REGISTRY_PORT)}:5000`,
    registryImage,
  ])
}

function runProvision(identityPath: string) {
  writeFileSync(
    inventoryPath,
    stringify({
      all: {
        children: {
          production_origins: {
            hosts: {
              production_like_origin: {
                ansible_connection: 'local',
                ansible_host: 'phase12-production-like-origin',
                ansible_python_interpreter: '/usr/local/bin/python',
              },
            },
          },
        },
      },
    }),
  )
  writeFileSync(
    variablesPath,
    JSON.stringify({
      tungchiahui_compose_project_name: projectName,
      tungchiahui_config_root: configRoot,
      tungchiahui_content_polling_enabled: 'false',
      tungchiahui_control_rate_limit_per_minute: '1000',
      tungchiahui_data_root: dataRoot,
      tungchiahui_deployment_article_path: '/blog/phase-3-seed',
      tungchiahui_deployment_asset_path: '/docs/ros2/core/index.html',
      tungchiahui_deployment_sha: input.PHASE12_GIT_SHA,
      tungchiahui_deployment_backup_max_age_seconds: '86400',
      tungchiahui_deployment_stabilization_seconds: '0',
      tungchiahui_deployment_image_repository: registryRepository,
      tungchiahui_deployment_search_query: 'ROS2_Control',
      tungchiahui_install_packages: false,
      tungchiahui_manage_stack: true,
      tungchiahui_origin_bind_address: '127.0.0.1',
      tungchiahui_origin_port: String(input.PHASE12_ORIGIN_PORT),
      tungchiahui_observability_backup_max_age_seconds: '86400',
      tungchiahui_observability_disk_critical_percent: '99',
      tungchiahui_observability_interval_seconds: '10',
      tungchiahui_observability_job_max_age_seconds: '3600',
      tungchiahui_observability_latency_warning_ms: '10000',
      tungchiahui_observability_origin_hostname: 'localhost',
      tungchiahui_observability_origin_ipv6_required: 'false',
      tungchiahui_observability_origin_server_name: 'ddns.tungchiahui.cn',
      tungchiahui_observability_origin_url: 'http://openresty:8082/api/ready',
      tungchiahui_observability_public_asset_path: '/api/assets/monitoring/health.svg',
      tungchiahui_observability_public_server_name: 'www.tungchiahui.cn',
      tungchiahui_observability_public_url: 'http://openresty:8082/',
      tungchiahui_observability_restore_drill_max_age_seconds: '86400',
      tungchiahui_observability_restore_drill_timestamp: new Date().toISOString(),
      tungchiahui_postgres_image: postgresImage,
      tungchiahui_recovery_image: recoveryImage,
      tungchiahui_repository_root: '/workspace',
      tungchiahui_search_polling_enabled: 'false',
      tungchiahui_secret_file: encryptedSecretPath,
      tungchiahui_secret_root: secretRoot,
      tungchiahui_service_image: serviceImage,
      tungchiahui_web_image: webImage,
    }),
  )
  const command = [
    '-i',
    inventoryPath,
    'ops/production/ansible/playbooks/provision.yml',
    '--extra-vars',
    `@${variablesPath}`,
  ]
  const environment = {
    ANSIBLE_CONFIG: resolve('ops/production/ansible/ansible.cfg'),
    SOPS_AGE_KEY_FILE: identityPath,
  }
  const first = execute('ansible-playbook', command, { environment })
  expect(/changed=[1-9][0-9]*/.test(first.stdout), 'Initial provision did not report changes')
  const second = execute('ansible-playbook', command, { environment })
  expect(
    /changed=0\b/.test(second.stdout),
    `Second provision was not idempotent:\n${second.stdout}`,
  )
}

function runMigrationTargetProvision(identityPath: string) {
  writeFileSync(
    targetInventoryPath,
    stringify({
      all: {
        children: {
          production_origins: {
            hosts: {
              phase17_nonproduction_target: {
                ansible_connection: 'local',
                ansible_host: 'phase17-nonproduction-target',
                ansible_python_interpreter: '/usr/local/bin/python',
              },
            },
          },
        },
      },
    }),
  )
  writeFileSync(
    targetVariablesPath,
    JSON.stringify({
      tungchiahui_compose_project_name: targetProjectName,
      tungchiahui_config_root: targetConfigRoot,
      tungchiahui_content_polling_enabled: 'false',
      tungchiahui_control_rate_limit_per_minute: '1000',
      tungchiahui_data_root: targetDataRoot,
      tungchiahui_deployment_article_path: '/blog/phase-3-seed',
      tungchiahui_deployment_asset_path: '/docs/ros2/core/index.html',
      tungchiahui_deployment_sha: input.PHASE12_GIT_SHA,
      tungchiahui_deployment_backup_max_age_seconds: '86400',
      tungchiahui_deployment_stabilization_seconds: '0',
      tungchiahui_deployment_image_repository: registryRepository,
      tungchiahui_deployment_search_query: 'ROS2_Control',
      tungchiahui_install_packages: false,
      tungchiahui_manage_stack: true,
      tungchiahui_origin_bind_address: '::1',
      tungchiahui_origin_port: String(input.PHASE17_TARGET_ORIGIN_PORT),
      tungchiahui_observability_backup_max_age_seconds: '86400',
      tungchiahui_observability_disk_critical_percent: '99',
      tungchiahui_observability_interval_seconds: '10',
      tungchiahui_observability_job_max_age_seconds: '3600',
      tungchiahui_observability_latency_warning_ms: '10000',
      tungchiahui_observability_origin_hostname: 'localhost',
      tungchiahui_observability_origin_ipv6_required: 'false',
      tungchiahui_observability_origin_server_name: 'ddns.tungchiahui.cn',
      tungchiahui_observability_origin_url: 'http://openresty:8082/api/ready',
      tungchiahui_observability_public_asset_path: '/api/assets/monitoring/health.svg',
      tungchiahui_observability_public_server_name: 'www.tungchiahui.cn',
      tungchiahui_observability_public_url: 'http://openresty:8082/',
      tungchiahui_observability_restore_drill_max_age_seconds: '86400',
      tungchiahui_observability_restore_drill_timestamp: new Date().toISOString(),
      tungchiahui_postgres_image: postgresImage,
      tungchiahui_recovery_image: recoveryImage,
      tungchiahui_repository_root: '/workspace',
      tungchiahui_search_polling_enabled: 'false',
      tungchiahui_secret_file: encryptedSecretPath,
      tungchiahui_secret_root: targetSecretRoot,
      tungchiahui_service_image: serviceImage,
      tungchiahui_web_image: webImage,
    }),
  )
  const command = [
    '-i',
    targetInventoryPath,
    'ops/production/ansible/playbooks/provision.yml',
    '--extra-vars',
    `@${targetVariablesPath}`,
  ]
  const environment = {
    ANSIBLE_CONFIG: resolve('ops/production/ansible/ansible.cfg'),
    SOPS_AGE_KEY_FILE: identityPath,
  }
  const first = execute('ansible-playbook', command, { environment })
  expect(/changed=[1-9][0-9]*/.test(first.stdout), 'Migration target provision reported no changes')
  const second = execute('ansible-playbook', command, { environment })
  expect(
    /changed=0\b/.test(second.stdout),
    `Migration target provision was not idempotent:\n${second.stdout}`,
  )
}

function inspectHardening() {
  for (const image of [webImage, serviceImage, recoveryImage, postgresImage]) {
    const user = execute('docker', [
      'image',
      'inspect',
      '--format',
      '{{.Config.User}}',
      image,
    ]).stdout.trim()
    expect(
      user !== '' && user !== '0' && user !== 'root',
      `${image} does not declare a non-root user`,
    )
    const history = execute('docker', [
      'history',
      '--no-trunc',
      '--format',
      '{{.CreatedBy}}',
      image,
    ]).stdout
    expect(
      !history.includes('phase12-disposable-password'),
      `${image} history contains a test secret`,
    )
    expect(!history.includes(':latest'), `${image} history uses latest identity`)
  }

  const services = [
    'control-api',
    'content-worker',
    'postgres',
    'pgbouncer',
    'web-blue',
    'web-green',
    'openresty',
    'observability-agent',
  ]
  for (const service of services) {
    const container = compose(['ps', '--quiet', service]).stdout.trim()
    expect(container.length > 0, `${service} container is missing`)
    const inspection = JSON.parse(execute('docker', ['inspect', container]).stdout) as unknown
    const parsed = z
      .array(
        z.object({
          Config: z.object({ User: z.string() }),
          HostConfig: z.object({
            Binds: z.array(z.string()).nullable(),
            CapDrop: z.array(z.string()).nullable(),
            IpcMode: z.string(),
            PidMode: z.string(),
            Privileged: z.boolean(),
            ReadonlyRootfs: z.boolean(),
            SecurityOpt: z.array(z.string()).nullable(),
          }),
        }),
      )
      .parse(inspection)[0]
    expect(parsed !== undefined, `Unable to inspect ${service}`)
    expect(parsed.Config.User !== '' && !parsed.Config.User.startsWith('0:'), `${service} is root`)
    expect(parsed.HostConfig.ReadonlyRootfs, `${service} root filesystem is writable`)
    expect(!parsed.HostConfig.Privileged, `${service} is privileged`)
    expect(parsed.HostConfig.PidMode !== 'host', `${service} shares the host PID namespace`)
    expect(parsed.HostConfig.IpcMode !== 'host', `${service} shares the host IPC namespace`)
    expect(
      parsed.HostConfig.CapDrop?.includes('ALL') === true,
      `${service} does not drop ALL capabilities`,
    )
    expect(
      parsed.HostConfig.SecurityOpt?.includes('no-new-privileges:true') === true,
      `${service} lacks no-new-privileges`,
    )
    expect(
      parsed.HostConfig.Binds?.every((bind) => !bind.includes('/var/run/docker.sock')) !== false,
      `${service} unexpectedly mounts the Docker socket`,
    )
    expect(
      execute('docker', ['exec', container, 'touch', '/root-filesystem-write'], {
        allowFailure: true,
      }).status !== 0,
      `${service} can write its root filesystem`,
    )
  }
  const deployAgent = compose(['ps', '--quiet', 'deploy-agent']).stdout.trim()
  const deployAgentInspection = execute('docker', ['inspect', deployAgent]).stdout
  const deployAgentParsed = z
    .array(
      z.object({
        Config: z.object({ User: z.string() }),
        HostConfig: z.object({
          Binds: z.array(z.string()).nullable(),
          CapDrop: z.array(z.string()).nullable(),
          IpcMode: z.string(),
          PidMode: z.string(),
          Privileged: z.boolean(),
          ReadonlyRootfs: z.boolean(),
          SecurityOpt: z.array(z.string()).nullable(),
        }),
      }),
    )
    .parse(JSON.parse(deployAgentInspection) as unknown)[0]
  expect(deployAgentParsed !== undefined, 'Unable to inspect deploy-agent')
  expect(
    deployAgentParsed.HostConfig.Binds?.some((bind) =>
      bind.endsWith(':/run/deploy-capability/docker.sock:ro'),
    ) === true,
    'deploy-agent socket mount is not read-only',
  )
  expect(
    deployAgentParsed.Config.User !== '' && !deployAgentParsed.Config.User.startsWith('0:'),
    'deploy-agent is root',
  )
  expect(deployAgentParsed.HostConfig.ReadonlyRootfs, 'deploy-agent root filesystem is writable')
  expect(!deployAgentParsed.HostConfig.Privileged, 'deploy-agent is privileged')
  expect(deployAgentParsed.HostConfig.PidMode !== 'host', 'deploy-agent shares host PID namespace')
  expect(deployAgentParsed.HostConfig.IpcMode !== 'host', 'deploy-agent shares host IPC namespace')
  expect(
    deployAgentParsed.HostConfig.CapDrop?.includes('ALL') === true,
    'deploy-agent does not drop ALL capabilities',
  )
  expect(
    deployAgentParsed.HostConfig.SecurityOpt?.includes('no-new-privileges:true') === true,
    'deploy-agent lacks no-new-privileges',
  )
  expect(
    execute('docker', ['exec', deployAgent, 'touch', '/root-filesystem-write'], {
      allowFailure: true,
    }).status !== 0,
    'deploy-agent can write its root filesystem',
  )
}

function verifyDatabaseRoleBindings() {
  const postgres = compose(['ps', '--quiet', 'postgres']).stdout.trim()
  const bindings = [
    ['site_app_login', 'site_app'],
    ['site_content_worker_login', 'site_content_worker'],
    ['site_control_api_login', 'site_control_api'],
    ['site_migrator_login', 'site_migrator'],
  ] as const
  for (const [login, group] of bindings) {
    const result = execute('docker', [
      'exec',
      postgres,
      'psql',
      '--username',
      'tungchiahui',
      '--dbname',
      'tungchiahui',
      '--tuples-only',
      '--no-align',
      '--command',
      `SELECT rolsuper, rolcanlogin, pg_has_role('${login}', '${group}', 'MEMBER') FROM pg_roles WHERE rolname = '${login}'`,
    ]).stdout.trim()
    expect(result === 'f|t|t', `${login} is not a least-privilege member of ${group}`)
    const membershipCount = execute('docker', [
      'exec',
      postgres,
      'psql',
      '--username',
      'tungchiahui',
      '--dbname',
      'tungchiahui',
      '--tuples-only',
      '--no-align',
      '--command',
      `SELECT count(*) FROM pg_auth_members memberships JOIN pg_roles granted ON granted.oid = memberships.roleid JOIN pg_roles member ON member.oid = memberships.member WHERE member.rolname = '${login}' AND granted.rolname IN ('site_app', 'site_content_worker', 'site_control_api', 'site_migrator', 'site_backup', 'site_replication')`,
    ]).stdout.trim()
    expect(membershipCount === '1', `${login} has an unexpected group-role membership`)
  }
}

function curl(arguments_: readonly string[], expectedStatus: number) {
  const result = execute('curl', [
    '--insecure',
    '--noproxy',
    '*',
    '--silent',
    '--show-error',
    '--output',
    '/dev/null',
    '--write-out',
    '%{http_code}',
    ...arguments_,
  ])
  expect(
    Number(result.stdout) === expectedStatus,
    `Expected HTTP ${expectedStatus}, got ${result.stdout}`,
  )
}

async function waitForPublicReadiness() {
  const deadline = Date.now() + 60_000
  const url = `http://127.0.0.1:${String(input.PHASE12_ORIGIN_PORT)}/api/ready`
  while (Date.now() < deadline) {
    const result = execute(
      'curl',
      [
        '--insecure',
        '--noproxy',
        '*',
        '--silent',
        '--output',
        '/dev/null',
        '--write-out',
        '%{http_code}',
        url,
      ],
      { allowFailure: true },
    )
    if (result.stdout === '200') return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw new Error('Public readiness did not recover after the injected PostgreSQL outage')
}

async function restorePostgresDependentServices() {
  compose(['start', 'postgres'])
  compose(['up', '--detach', '--wait', 'postgres'])
  compose(['restart', 'pgbouncer', 'web-blue'])
  compose(['up', '--detach', '--wait', 'pgbouncer', 'web-blue'])
  await waitForPublicReadiness()
}

function percentile(values: readonly number[], fraction: number) {
  const sorted = [...values].toSorted((left, right) => left - right)
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))
  return sorted[index] ?? 0
}

function parallelRequests(path: string, count: number) {
  const url = `http://127.0.0.1:${String(input.PHASE12_ORIGIN_PORT)}${path}`
  const result = execute('curl', [
    '--insecure',
    '--noproxy',
    '*',
    '--silent',
    '--show-error',
    '--parallel',
    '--parallel-max',
    String(count),
    '--write-out',
    '%{http_code} %{time_total}\n',
    ...Array.from({ length: count }, () => ['--output', '/dev/null', url]).flat(),
  ])
  return result.stdout
    .trim()
    .split('\n')
    .map((line) => {
      const [status, seconds] = line.split(' ')
      return {
        durationMilliseconds: Number(seconds) * 1_000,
        status: Number(status),
      }
    })
}

let readinessMeasurements: Readonly<Record<string, number>> = Object.freeze({})

async function verifySecurityAndLoad() {
  const port = String(input.PHASE12_ORIGIN_PORT)
  const headers = execute('curl', [
    '--insecure',
    '--noproxy',
    '*',
    '--silent',
    '--dump-header',
    '-',
    '--output',
    '/dev/null',
    `http://127.0.0.1:${port}/`,
  ]).stdout.toLowerCase()
  for (const header of [
    'content-security-policy:',
    'permissions-policy:',
    'referrer-policy:',
    'strict-transport-security:',
    'x-content-type-options:',
    'x-frame-options:',
    'x-request-id:',
  ]) {
    expect(headers.includes(header), `Public response lacks ${header}`)
  }
  curl(['--request', 'TRACE', `http://127.0.0.1:${port}/`], 405)
  curl([`http://127.0.0.1:${port}/api/internal/revalidate`], 404)
  curl([`http://127.0.0.1:${port}/api/search?q=`], 400)

  const baseline = parallelRequests('/', 80)
  expect(
    baseline.every((sample) => sample.status === 200),
    `Representative public load returned errors: ${JSON.stringify(baseline)}`,
  )
  const abusive = parallelRequests('/', 220)
  expect(
    abusive.some((sample) => sample.status === 429),
    'Public origin rate limit did not engage',
  )
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_500))
  curl([`http://127.0.0.1:${port}/`], 200)

  const controlAbuse = parallelRequests('/api/ops/status', 100)
  expect(
    controlAbuse.some((sample) => sample.status === 429),
    'Control origin rate limit did not engage',
  )
  expect(
    controlAbuse.some((sample) => sample.status === 401),
    'Control auth boundary disappeared',
  )
  await new Promise((resolveDelay) => setTimeout(resolveDelay, 2_500))
  curl([`http://127.0.0.1:${port}/api/ops/status`], 401)

  const observability = compose(['ps', '--quiet', 'observability-agent']).stdout.trim()
  const poolResult = execute('docker', [
    'exec',
    observability,
    'node',
    '-e',
    "const started=Date.now();Promise.all(Array.from({length:80},()=>fetch('http://web-blue:3000/api/ready').then(r=>r.status))).then(statuses=>console.log(JSON.stringify({durationMs:Date.now()-started,failures:statuses.filter(s=>s!==200).length})))",
  ]).stdout.trim()
  const pool = z
    .object({ durationMs: z.number().nonnegative(), failures: z.literal(0) })
    .parse(JSON.parse(poolResult) as unknown)
  const observabilitySnapshot = z
    .object({
      activeAlerts: z.array(z.string()),
      controlStateIntegrity: z.literal('ok'),
      probes: z.object({
        asset: z.object({ ok: z.boolean() }),
        control: z.object({ ok: z.boolean() }),
        deployAgent: z.object({ ok: z.boolean() }),
        worker: z.object({ ok: z.boolean() }),
      }),
    })
    .passthrough()
    .parse(
      JSON.parse(
        execute('docker', [
          'exec',
          observability,
          'node',
          '-e',
          "fetch('http://127.0.0.1:8084/metrics').then(async r=>console.log(await r.text()))",
        ]).stdout,
      ) as unknown,
    )
  expect(observabilitySnapshot.probes.control.ok, 'Control observability probe failed')
  expect(observabilitySnapshot.probes.deployAgent.ok, 'Deploy-agent observability probe failed')
  expect(observabilitySnapshot.probes.worker.ok, 'Worker observability probe failed')
  expect(!observabilitySnapshot.probes.asset.ok, 'Injected S3 failure was not diagnosed')
  expect(
    observabilitySnapshot.activeAlerts.includes('AssetStorageUnavailable'),
    'Injected S3 failure did not produce the storage alert',
  )
  const postgres = compose(['ps', '--quiet', 'postgres']).stdout.trim()
  const slowQueryStartedAt = performance.now()
  execute('docker', [
    'exec',
    postgres,
    'psql',
    '--username',
    'tungchiahui',
    '--dbname',
    'tungchiahui',
    '--command',
    'SELECT pg_sleep(0.2)',
  ])
  const slowQueryDurationMs = performance.now() - slowQueryStartedAt
  expect(slowQueryDurationMs >= 180, 'Injected slow query did not exercise the latency path')
  curl([`http://127.0.0.1:${port}/api/ready`], 200)
  readinessMeasurements = Object.freeze({
    poolSaturation80DurationMs: pool.durationMs,
    publicLoadCount: baseline.length,
    publicLoadP50Ms: Number(
      percentile(
        baseline.map((sample) => sample.durationMilliseconds),
        0.5,
      ).toFixed(2),
    ),
    publicLoadP95Ms: Number(
      percentile(
        baseline.map((sample) => sample.durationMilliseconds),
        0.95,
      ).toFixed(2),
    ),
    publicRateLimitRejected: abusive.filter((sample) => sample.status === 429).length,
    slowQueryDurationMs: Number(slowQueryDurationMs.toFixed(2)),
  })
}

function verifyNoSecretLeakage(secretSentinels: readonly string[]) {
  const runtimeLogs = compose(['logs', '--no-color']).stdout
  const publicResponse = execute('curl', [
    '--insecure',
    '--noproxy',
    '*',
    '--silent',
    '--include',
    `http://127.0.0.1:${String(input.PHASE12_ORIGIN_PORT)}/`,
  ]).stdout
  const controlResponse = execute('curl', [
    '--insecure',
    '--noproxy',
    '*',
    '--silent',
    '--include',
    `http://127.0.0.1:${String(input.PHASE12_ORIGIN_PORT)}/api/ops/status`,
  ]).stdout
  for (const sentinel of secretSentinels) {
    expect(!runtimeLogs.includes(sentinel), 'Runtime logs contain a disposable secret sentinel')
    expect(
      !publicResponse.includes(sentinel),
      'Public response contains a disposable secret sentinel',
    )
    expect(
      !controlResponse.includes(sentinel),
      'Control response contains a disposable secret sentinel',
    )
  }
}

async function verifyRoutingAndIpFamilies() {
  const port = String(input.PHASE12_ORIGIN_PORT)
  curl(['--ipv4', `http://127.0.0.1:${port}/api/health`], 200)
  const ipv6Loopback = execute(
    'curl',
    ['--ipv6', '--noproxy', '*', '--silent', `http://[::1]:${port}/api/health`],
    { allowFailure: true },
  )
  expect(ipv6Loopback.status !== 0, 'V2 gateway must not bind the host IPv6 interface')
  curl([`http://127.0.0.1:${port}/api/ops/status`], 401)
  compose(['stop', 'web-blue', 'web-green'])
  curl([`http://127.0.0.1:${port}/api/ops/status`], 401)
  compose(['start', 'web-blue', 'web-green'])
  compose(['stop', 'postgres'])
  curl([`http://127.0.0.1:${port}/api/ops/status`], 401)
  const control = compose(['ps', '--quiet', 'control-api']).stdout.trim()
  const postgresDownHealth = z
    .object({
      applicationJobs: z.null(),
      infrastructure: z.object({ integrity: z.literal('ok') }),
      status: z.literal('ok'),
    })
    .passthrough()
    .parse(
      JSON.parse(
        execute('docker', [
          'exec',
          control,
          'node',
          '-e',
          "fetch('http://127.0.0.1:8080/health').then(async r=>console.log(await r.text()))",
        ]).stdout,
      ) as unknown,
    )
  expect(postgresDownHealth.applicationJobs === null, 'PostgreSQL failure was not distinguished')
  await restorePostgresDependentServices()
  const postgresRestoredHealth = z
    .object({
      applicationJobs: z.object({
        backlog_count: z.number().int().nonnegative(),
        budget_stop_count: z.number().int().nonnegative(),
      }),
      status: z.literal('ok'),
    })
    .passthrough()
    .parse(
      JSON.parse(
        execute('docker', [
          'exec',
          control,
          'node',
          '-e',
          "fetch('http://127.0.0.1:8080/health').then(async r=>console.log(await r.text()))",
        ]).stdout,
      ) as unknown,
    )
  expect(
    postgresRestoredHealth.applicationJobs !== null,
    'Application-job observability did not recover with PostgreSQL',
  )
  const config = readFileSync(join(configRoot, 'openresty.conf'), 'utf8')
  expect(config.includes('listen 8082;'), 'Internal OpenResty gateway port drifted')
  expect(config.includes('listen [::]:8082;'), 'Internal OpenResty IPv6 gateway port drifted')
  expect(
    config.includes('set $control_upstream control-api:8080;'),
    'Control API does not use service DNS',
  )
  const configuredIpv4Addresses = config.match(/\b(?:\d{1,3}\.){3}\d{1,3}\b/g) ?? []
  expect(
    configuredIpv4Addresses.every((address) =>
      ['127.0.0.1', '127.0.0.11', '172.16.0.0'].includes(address),
    ),
    `OpenResty contains an unapproved numeric IPv4: ${configuredIpv4Addresses.join(', ')}`,
  )
}

async function initializeDeploymentFixture(workerPassword: string) {
  const migrationContainer = compose([
    '--profile',
    'deployment',
    'ps',
    '--all',
    '--quiet',
    'database-migrate',
  ]).stdout.trim()
  expect(migrationContainer.length > 0, 'Prepared migration container is missing')
  compose(['--profile', 'deployment', 'start', 'database-migrate'])
  const exitCode = execute('docker', ['wait', migrationContainer]).stdout.trim()
  expect(exitCode === '0', `Initial migration runner exited with ${exitCode}`)

  const postgresContainer = compose(['ps', '--quiet', 'postgres']).stdout.trim()
  const databaseNetwork = `${projectName}_database`
  const postgresIp = execute('docker', [
    'inspect',
    '--format',
    `{{(index .NetworkSettings.Networks "${databaseNetwork}").IPAddress}}`,
    postgresContainer,
  ]).stdout.trim()
  const databaseUrl = `postgresql://site_content_worker_login:${workerPassword}@${postgresIp}:5432/tungchiahui`
  await seedDevelopmentDatabase(databaseUrl)
  const search = new SearchIndexRepository(databaseUrl)
  try {
    await search.reindexLocales(['zh-cn'])
  } finally {
    await search.close()
  }
}

const operationResponseSchema = z.object({
  operation: z
    .object({ errorSummary: z.string().nullable().optional(), id: z.uuid(), status: z.string() })
    .passthrough(),
})

async function waitForOperation(id: string) {
  const deadline = Date.now() + 240_000
  while (Date.now() < deadline) {
    const response = operationResponseSchema.parse(
      await controlRequest(`/api/ops/infrastructure-operations/${id}`, {
        purpose: `phase14-operation-${id}`,
      }),
    )
    if (response.operation.status === 'completed' || response.operation.status === 'failed') {
      return response.operation
    }
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw new Error(`Deployment operation ${id} timed out`)
}

function publicVersion() {
  const port = String(input.PHASE12_ORIGIN_PORT)
  return z
    .object({ gitSha: z.string(), slot: z.enum(['blue', 'green']) })
    .passthrough()
    .parse(
      JSON.parse(
        execute('curl', [
          '--insecure',
          '--noproxy',
          '*',
          '--silent',
          `http://127.0.0.1:${port}/api/version`,
        ]).stdout,
      ) as unknown,
    )
}

async function verifyBlueGreenDeployment() {
  const controlContainer = compose(['ps', '--quiet', 'control-api']).stdout.trim()
  const applicationNetwork = `${projectName}_application`
  const controlIp = execute('docker', [
    'inspect',
    '--format',
    `{{(index .NetworkSettings.Networks "${applicationNetwork}").IPAddress}}`,
    controlContainer,
  ]).stdout.trim()
  process.env.SITE_CONTROL_API_URL = `http://${controlIp}:8080`
  process.env.SITE_OPERATOR_KEY_ID = 'phase12-test-operator'
  process.env.SITE_OPERATOR_PRIVATE_KEY_PATH = join(workRoot, 'operator-private.json')

  const digest = z
    .string()
    .regex(/^sha256:[a-f0-9]{64}$/)
    .parse(registryDigest)
  execute('docker', ['image', 'rm', registryTag], { allowFailure: true })
  execute('docker', ['image', 'rm', `${registryRepository}@${digest}`], { allowFailure: true })
  const candidateSha = input.PHASE12_GIT_SHA
  const created = operationResponseSchema.parse(
    await controlRequest('/api/ops/deployments', {
      body: { gitSha: candidateSha, imageDigest: digest, reason: 'Phase 14 production-like gate' },
      idempotencyKey: 'phase14-production-like-deployment-001',
      method: 'POST',
      purpose: 'phase14-deployment-create',
    }),
  )
  const deployed = await waitForOperation(created.operation.id)
  expect(
    deployed.status === 'completed',
    `Production-like deployment did not complete: ${JSON.stringify(deployed)}`,
  )
  const deployedVersion = publicVersion()
  expect(
    deployedVersion.gitSha === candidateSha && deployedVersion.slot === 'green',
    'Public entry did not switch to the green candidate',
  )

  const rollback = operationResponseSchema.parse(
    await controlRequest('/api/ops/rollbacks', {
      body: { reason: 'Phase 14 no-rebuild rollback gate' },
      idempotencyKey: 'phase14-production-like-rollback-001',
      method: 'POST',
      purpose: 'phase14-rollback-create',
    }),
  )
  const rolledBack = await waitForOperation(rollback.operation.id)
  expect(
    rolledBack.status === 'completed',
    `Production-like rollback did not complete: ${JSON.stringify(rolledBack)}`,
  )
  const rollbackVersion = publicVersion()
  expect(
    rollbackVersion.gitSha === input.PHASE12_GIT_SHA && rollbackVersion.slot === 'blue',
    'Rollback did not switch to the retained blue image',
  )

  const failed = operationResponseSchema.parse(
    await controlRequest('/api/ops/deployments', {
      body: {
        gitSha: 'd'.repeat(40),
        imageDigest: `sha256:${'e'.repeat(64)}`,
        reason: 'Phase 14 missing immutable image failure gate',
      },
      idempotencyKey: 'phase14-production-like-deployment-failure-001',
      method: 'POST',
      purpose: 'phase14-deployment-failure-create',
    }),
  )
  const rejected = await waitForOperation(failed.operation.id)
  expect(rejected.status === 'failed', 'Missing immutable image was not rejected')
  const failureVersion = publicVersion()
  expect(
    failureVersion.gitSha === input.PHASE12_GIT_SHA && failureVersion.slot === 'blue',
    'Failed inactive deployment changed the active public release',
  )
  const retainedGreen = z
    .array(
      z.object({
        Config: z.object({ Env: z.array(z.string()).nullable() }),
        State: z.object({ Running: z.boolean() }),
      }),
    )
    .parse(
      JSON.parse(execute('docker', ['inspect', `${projectName}-web-green-1`]).stdout) as unknown,
    )[0]
  const retainedGreenEnvironment = new Map(
    retainedGreen?.Config.Env?.map((entry) => {
      const separatorIndex = entry.indexOf('=')
      return [entry.slice(0, separatorIndex), entry.slice(separatorIndex + 1)] as const
    }) ?? [],
  )
  expect(
    retainedGreenEnvironment.get('SITE_DEPLOYMENT_IMAGE_DIGEST') === digest &&
      retainedGreen?.State.Running === true,
    'Preflight failure removed or changed the retained rollback target',
  )

  compose(['stop', 'postgres'])
  try {
    const databaseUnavailable = operationResponseSchema.parse(
      await controlRequest('/api/ops/deployments', {
        body: {
          gitSha: input.PHASE12_GIT_SHA,
          imageDigest: digest,
          reason: 'Phase 14 PostgreSQL dependency failure gate',
        },
        idempotencyKey: 'phase14-postgres-down-deployment-001',
        method: 'POST',
        purpose: 'phase14-postgres-down-deployment-create',
      }),
    )
    const dependencyFailure = await waitForOperation(databaseUnavailable.operation.id)
    expect(
      dependencyFailure.status === 'failed',
      `PostgreSQL-down deployment did not fail explicitly: ${JSON.stringify(dependencyFailure)}`,
    )
    expect(
      dependencyFailure.errorSummary?.includes('Migration container failed') === true,
      `PostgreSQL dependency failure has no useful summary: ${JSON.stringify(dependencyFailure)}`,
    )
    const stillActive = publicVersion()
    expect(
      stillActive.gitSha === input.PHASE12_GIT_SHA && stillActive.slot === 'blue',
      'PostgreSQL dependency failure changed the active public release',
    )
  } finally {
    await restorePostgresDependentServices()
  }
}

function psql(container: string, sql: string) {
  return execute('docker', [
    'exec',
    container,
    'psql',
    '--username',
    'tungchiahui',
    '--dbname',
    'tungchiahui',
    '--tuples-only',
    '--no-align',
    '--command',
    sql,
  ]).stdout.trim()
}

async function waitFor(description: string, check: () => boolean, timeoutMilliseconds = 90_000) {
  const deadline = Date.now() + timeoutMilliseconds
  while (Date.now() < deadline) {
    if (check()) return
    await new Promise((resolveDelay) => setTimeout(resolveDelay, 500))
  }
  throw new Error(`Timed out waiting for ${description}`)
}

function inspectMigrationTargetHardening() {
  for (const service of [
    'control-api',
    'content-worker',
    'observability-agent',
    'openresty',
    'pgbouncer',
    'postgres',
    'web-blue',
    'web-green',
  ]) {
    const container = targetCompose(['ps', '--quiet', service]).stdout.trim()
    const inspection = z
      .array(
        z.object({
          Config: z.object({ User: z.string() }),
          HostConfig: z.object({
            CapDrop: z.array(z.string()).nullable(),
            Privileged: z.boolean(),
            ReadonlyRootfs: z.boolean(),
          }),
        }),
      )
      .parse(JSON.parse(execute('docker', ['inspect', container]).stdout) as unknown)[0]
    expect(inspection !== undefined, `Unable to inspect migration target ${service}`)
    expect(
      inspection.Config.User !== '' && !inspection.Config.User.startsWith('0:'),
      `${service} is root`,
    )
    expect(inspection.HostConfig.ReadonlyRootfs, `${service} target root is writable`)
    expect(!inspection.HostConfig.Privileged, `${service} target is privileged`)
    expect(
      inspection.HostConfig.CapDrop?.includes('ALL') === true,
      `${service} target does not drop all capabilities`,
    )
  }
}

async function verifyServerMigrationRehearsal(identityPath: string) {
  const sourcePostgres = `${projectName}-postgres-1`
  const targetPostgres = `${targetProjectName}-postgres-1`
  const sourceNetwork = `${projectName}_database`
  const replicationRole = `phase17_replication_${process.pid}`
  const replicationSlot = `phase17_slot_${process.pid}`
  const replicationPassword = `phase17-disposable-replication-${process.pid}`
  const targetMarker = join(targetRoot, '.tungchiahui-disposable-server-migration-target')
  const sourceControlPath = join(dataRoot, 'control-state', 'control.db')
  const targetControlPath = join(targetDataRoot, 'control-state', 'control.db')
  const snapshotPath = join(workRoot, 'phase17-control-state.snapshot')
  let sourceStoppedAt = 0
  let measuredDowntimeMilliseconds = 0

  const actor: ActorIdentity = {
    capabilities: ['infrastructure-operation:create', 'infrastructure-operation:read'],
    id: 'operator:phase17-disposable-rehearsal',
    kind: 'operator',
  }
  initializeControlState(sourceControlPath, 'production')
  const created = createInfrastructureOperation(
    sourceControlPath,
    {
      operationType: 'server-migration',
      reason: 'Phase 17 disposable same-major server migration rehearsal',
      target: {
        action: 'planned-migration',
        inventoryHost: 'phase17-nonproduction-target',
      },
    },
    actor,
    `phase17-disposable-rehearsal-${process.pid}`,
  ).operation
  const claimed = claimNextInfrastructureOperation(
    sourceControlPath,
    'deploy-agent:server-migration',
    3_600,
    new Date(),
    ['server-migration'],
  )
  expect(claimed?.id === created.id, 'Server migration operation was not claimed')
  if (!claimed) throw new Error('Server migration operation was not claimed')
  const lease = {
    fencingToken: claimed.fencingToken,
    leaseOwner: 'deploy-agent:server-migration',
  }
  const running = startInfrastructureOperation(sourceControlPath, claimed.id, lease)

  const platform: ServerMigrationPlatform = {
    abortBeforePromotion: async () => {
      targetCompose(['--profile', 'deployment', 'down', '--volumes', '--remove-orphans'], true)
      if (sourceStoppedAt > 0) compose(['start', 'postgres'], true)
    },
    cutoverOrigin: async (inventoryHost) => {
      expect(inventoryHost === 'phase17-nonproduction-target', 'Origin cutover target drifted')
      return { originHostname: 'ddns.tungchiahui.cn' }
    },
    deployCandidateAndSmoke: async () => {
      targetCompose(['up', '--detach', '--wait'])
      const targetPort = String(input.PHASE17_TARGET_ORIGIN_PORT)
      for (const path of [
        '/api/health',
        '/api/ready',
        '/',
        '/blog/phase-3-seed',
        '/zh-cn/search?q=ROS2_Control',
        '/docs/ros2/core/index.html',
      ]) {
        curl([`http://[::1]:${targetPort}${path}`], 200)
      }
      const version = z
        .object({ gitSha: z.string().regex(/^[a-f0-9]{40}$/) })
        .passthrough()
        .parse(
          JSON.parse(
            execute('curl', [
              '--insecure',
              '--noproxy',
              '*',
              '--silent',
              `http://[::1]:${targetPort}/api/version`,
            ]).stdout,
          ) as unknown,
        )
      return { candidateSha: version.gitSha, smokePassed: true }
    },
    openNonWritingRollbackWindow: async () => {
      const sourceState = z
        .array(z.object({ State: z.object({ Running: z.boolean() }) }))
        .parse(JSON.parse(execute('docker', ['inspect', sourcePostgres]).stdout) as unknown)[0]
      expect(sourceState?.State.Running === false, 'Old PostgreSQL source is still writing')
      psql(
        targetPostgres,
        "INSERT INTO app.phase17_migration_probe(note) VALUES ('promoted-write')",
      )
      expect(
        psql(
          targetPostgres,
          "SELECT count(*) FROM app.phase17_migration_probe WHERE note = 'promoted-write'",
        ) === '1',
        'Promoted target does not accept writes',
      )
      return { sourceWriting: false }
    },
    preparePhysicalReplication: async () => {
      execute('docker', [
        'exec',
        sourcePostgres,
        '/bin/sh',
        '-c',
        `printf '%s\\n' 'host replication ${replicationRole} all scram-sha-256' >> /var/lib/postgresql/18/docker/pg_hba.conf`,
      ])
      psql(sourcePostgres, 'SELECT pg_reload_conf()')
      psql(sourcePostgres, `DROP ROLE IF EXISTS ${replicationRole}`)
      psql(
        sourcePostgres,
        `CREATE ROLE ${replicationRole} LOGIN REPLICATION PASSWORD '${replicationPassword}'`,
      )
      psql(
        sourcePostgres,
        `CREATE TABLE IF NOT EXISTS app.phase17_migration_probe (
          id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
          note text NOT NULL UNIQUE
        ); TRUNCATE app.phase17_migration_probe RESTART IDENTITY;
        INSERT INTO app.phase17_migration_probe(note) VALUES ('base-backup-row');`,
      )
      writeFileSync(targetMarker, 'phase17-disposable-target\n')
      expect(
        readFileSync(targetMarker, 'utf8').trim() === 'phase17-disposable-target',
        'Migration target marker is missing',
      )
      targetCompose(['--profile', 'deployment', 'down', '--remove-orphans'])
      execute('docker', [
        'run',
        '--rm',
        '--user',
        '0:0',
        '--entrypoint',
        '/bin/sh',
        '--mount',
        `type=bind,source=${join(targetDataRoot, 'postgres')},target=/phase17-target`,
        postgresImage,
        '-c',
        'find /phase17-target -mindepth 1 -delete',
      ])
      execute('docker', [
        'run',
        '--rm',
        '--network',
        sourceNetwork,
        '--env',
        `PGPASSWORD=${replicationPassword}`,
        '--mount',
        `type=bind,source=${join(targetDataRoot, 'postgres')},target=/var/lib/postgresql`,
        postgresImage,
        'pg_basebackup',
        '--host',
        sourcePostgres,
        '--username',
        replicationRole,
        '--pgdata',
        '/var/lib/postgresql/18/docker',
        '--format=plain',
        '--wal-method=stream',
        '--write-recovery-conf',
        '--create-slot',
        `--slot=${replicationSlot}`,
        '--checkpoint=fast',
      ])
      targetCompose(['create', 'postgres'])
      execute('docker', ['network', 'connect', sourceNetwork, targetPostgres])
      execute('docker', ['start', targetPostgres])
      await waitFor('target PostgreSQL streaming recovery', () => {
        const result = execute(
          'docker',
          [
            'exec',
            targetPostgres,
            'psql',
            '--username',
            'tungchiahui',
            '--dbname',
            'tungchiahui',
            '--tuples-only',
            '--no-align',
            '--command',
            'SELECT pg_is_in_recovery()',
          ],
          { allowFailure: true },
        )
        return result.status === 0 && result.stdout.trim() === 't'
      })
      psql(sourcePostgres, "INSERT INTO app.phase17_migration_probe(note) VALUES ('streamed-row')")
      psql(sourcePostgres, 'SELECT pg_switch_wal()')
      await waitFor(
        'streamed migration row',
        () =>
          psql(
            targetPostgres,
            "SELECT count(*) FROM app.phase17_migration_probe WHERE note = 'streamed-row'",
          ) === '1',
      )
      return { postgresMajor: 18, replicationMode: 'physical-streaming' }
    },
    promoteTarget: async () => {
      execute('docker', [
        'exec',
        targetPostgres,
        'pg_ctl',
        'promote',
        '--pgdata=/var/lib/postgresql/18/docker',
        '--wait',
      ])
      expect(psql(targetPostgres, 'SELECT pg_is_in_recovery()') === 'f', 'Target was not promoted')
      const timeline = z.coerce
        .number()
        .int()
        .positive()
        .parse(psql(targetPostgres, 'SELECT timeline_id FROM pg_control_checkpoint()'))
      return { promoted: true, timeline }
    },
    provisionTarget: async (inventoryHost) => {
      expect(
        inventoryHost === 'phase17-nonproduction-target',
        'Numeric bootstrap address persisted',
      )
      runMigrationTargetProvision(identityPath)
      inspectMigrationTargetHardening()
      return { idempotent: true, stableIdentity: inventoryHost }
    },
    quiesceWritesAndAwaitFinalWal: async () => {
      psql(sourcePostgres, "INSERT INTO app.phase17_migration_probe(note) VALUES ('final-wal-row')")
      psql(sourcePostgres, 'SELECT pg_switch_wal()')
      const finalWalLsn = psql(sourcePostgres, 'SELECT pg_current_wal_lsn()')
      await waitFor('final WAL replay', () => {
        const caughtUp = psql(
          targetPostgres,
          `SELECT pg_last_wal_replay_lsn() >= '${finalWalLsn}'::pg_lsn`,
        )
        return caughtUp === 't'
      })
      sourceStoppedAt = performance.now()
      compose(['stop', 'postgres'])
      return { finalWalLsn, lagBytes: 0, sourceWriting: false }
    },
    reconnectApplication: async () => {
      curl([`http://[::1]:${String(input.PHASE17_TARGET_ORIGIN_PORT)}/api/ready`], 200)
      measuredDowntimeMilliseconds = performance.now() - sourceStoppedAt
      targetCompose(['start', 'control-api', 'deploy-agent'])
      return { ready: true }
    },
    transferControlState: async () => {
      targetCompose(['stop', 'deploy-agent', 'control-api'])
      const sourceEvidence = createConsistentControlStateSnapshot(sourceControlPath, snapshotPath)
      const restored = restoreControlStateSnapshot(snapshotPath, targetControlPath, 'production')
      execute('chown', ['10002:10050', targetControlPath])
      execute('chmod', ['0660', targetControlPath])
      expect(
        restored.auditDigest === sourceEvidence.auditDigest,
        'Control-state audit digest drifted',
      )
      expect(
        JSON.stringify(readDeploymentState(targetControlPath)) ===
          JSON.stringify(readDeploymentState(sourceControlPath)),
        'Active/previous release state drifted during transfer',
      )
      const transferred = getInfrastructureOperation(targetControlPath, running.id)
      expect(
        transferred?.phase === 'final-wal-confirmed' && transferred.leaseOwner === lease.leaseOwner,
        'Migration operation phase or lease did not survive transfer',
      )
      return {
        auditDigest: restored.auditDigest,
        operationPhase: transferred.phase,
        schemaVersion: restored.schemaVersion,
      }
    },
    verifyPostSwitch: async () => {
      const port = String(input.PHASE17_TARGET_ORIGIN_PORT)
      const stableUrl = `http://ddns.tungchiahui.cn:${port}`
      for (const path of ['/api/health', '/api/ready', '/', '/blog/phase-3-seed']) {
        const result = execute('curl', [
          '--ipv6',
          '--noproxy',
          '*',
          '--resolve',
          `ddns.tungchiahui.cn:${port}:[::1]`,
          '--silent',
          '--show-error',
          '--output',
          '/dev/null',
          '--write-out',
          '%{http_code}',
          `${stableUrl}${path}`,
        ])
        expect(result.stdout === '200', `AAAA-only post-switch probe failed for ${path}`)
      }
      expect(
        psql(targetPostgres, 'SELECT count(*) FROM app.phase17_migration_probe') === '3',
        'Promoted target lost a migration probe row',
      )
      return {
        downtimeMilliseconds: Number(measuredDowntimeMilliseconds.toFixed(2)),
        ipv6Only: true,
        noDataLoss: true,
        publicLikeSmokePassed: true,
      }
    },
    verifyReadinessAndAbortCriteria: async () => {
      execute('docker', [
        'exec',
        sourcePostgres,
        'pgbackrest',
        '--config=/etc/pgbackrest/pgbackrest.conf',
        '--stanza=tungchiahui',
        'check',
      ])
      const lagBytes = z.coerce
        .number()
        .nonnegative()
        .parse(
          psql(
            sourcePostgres,
            `SELECT COALESCE(pg_wal_lsn_diff(pg_current_wal_lsn(), replay_lsn), 0)
             FROM pg_stat_replication WHERE application_name = 'walreceiver'`,
          ) || '0',
        )
      expect(psql(targetPostgres, 'SELECT pg_is_in_recovery()') === 't', 'Target is not a standby')
      return {
        backupFresh: true,
        lagBytes,
        replicationHealthy: true,
        storageReady: true,
        targetReady: true,
      }
    },
  }

  try {
    await executeServerMigrationOperation(running, lease, platform, {
      controlStatePath: sourceControlPath,
    })
    const finished = finishInfrastructureOperation(sourceControlPath, running.id, lease, {
      phase: 'migration-verified',
      status: 'completed',
    })
    expect(finished.status === 'completed', 'Server migration operation did not complete')

    targetCompose(['stop', 'deploy-agent', 'control-api'])
    createConsistentControlStateSnapshot(sourceControlPath, snapshotPath)
    restoreControlStateSnapshot(snapshotPath, targetControlPath, 'production')
    execute('chown', ['10002:10050', targetControlPath])
    execute('chmod', ['0660', targetControlPath])
    targetCompose(['start', 'control-api', 'deploy-agent'])
    expect(
      getInfrastructureOperation(targetControlPath, running.id)?.status === 'completed',
      'Completed migration operation did not survive final control-state reconciliation',
    )
    expect(
      inspectControlStateSnapshot(targetControlPath).integrity === 'ok',
      'Target state is corrupt',
    )
    const auditEvents = listControlAuditEvents(targetControlPath, running.id)
    expect(
      auditEvents.some((event) => event.eventType === 'infrastructure_operation_finished'),
      'Migration completion audit did not survive transfer',
    )
    return Object.freeze({
      auditContinuity: 'pass',
      controlStateTransfer: 'pass',
      measuredDowntimeMilliseconds: Number(measuredDowntimeMilliseconds.toFixed(2)),
      noDataLoss: 'pass',
      physicalStreamingReplication: 'pass',
      promotion: 'pass',
      rollbackWindow: 'old-host-non-writing',
      targetProvisionIdempotency: 'pass',
      targetStableIdentity: 'phase17-nonproduction-target',
      targetIpv6OnlyPublicLikeProbe: 'pass',
    })
  } catch (error: unknown) {
    try {
      finishInfrastructureOperation(sourceControlPath, running.id, lease, {
        errorSummary:
          error instanceof Error ? error.message : 'unknown migration rehearsal failure',
        phase: 'migration-failed',
        status: 'failed',
      })
    } catch (auditError: unknown) {
      console.error(
        `Unable to persist migration rehearsal failure: ${auditError instanceof Error ? auditError.message : 'unknown control-state failure'}`,
      )
    }
    throw error
  }
}

async function main() {
  const encrypted = createEncryptedSecret()
  try {
    startRegistry()
    buildImages()
    verifyImageSecurity()
    runProvision(encrypted.identityPath)
    inspectHardening()
    verifyDatabaseRoleBindings()
    await initializeDeploymentFixture(encrypted.workerPassword)
    await verifyBlueGreenDeployment()
    await verifyRoutingAndIpFamilies()
    await verifySecurityAndLoad()
    const migrationReadiness = await verifyServerMigrationRehearsal(encrypted.identityPath)
    verifyNoSecretLeakage(encrypted.secretSentinels)
    console.log(
      JSON.stringify({
        ansibleIdempotency: 'pass',
        blueGreenDeployment: 'pass',
        containerHardening: 'pass',
        databaseRoleSeparation: 'pass',
        immutableImageFailureIsolation: 'pass',
        ipv4AndIpv6Origin: 'pass',
        nextDownControlRoute: 'pass',
        noRebuildRollback: 'pass',
        registryDigestPull: 'pass',
        openRestyValidationAndReload: 'pass',
        ...migrationReadiness,
        postgresDownDeploymentDependency: 'pass',
        postgresDownControlRoute: 'pass',
        productionTraffic: false,
        secretInjection: 'sops-age-runtime-only',
        secretLogAndResponseLeakage: 'pass',
        sbomAndCriticalVulnerabilityScan: 'pass',
        securityHeadersAndAbuseControls: 'pass',
        ...readinessMeasurements,
        status: 'pass',
      }),
    )
  } catch (error) {
    const diagnostics = compose(['logs', '--no-color'], true)
    console.error(diagnostics.stdout)
    console.error(diagnostics.stderr)
    throw error
  } finally {
    targetCompose(['--profile', 'deployment', 'down', '--volumes', '--remove-orphans'], true)
    compose(['--profile', 'deployment', 'down', '--volumes', '--remove-orphans'], true)
    execute('docker', ['rm', '--force', registryContainer], { allowFailure: true })
    execute(
      'chown',
      [
        '--recursive',
        `${String(input.PHASE12_HOST_UID)}:${String(input.PHASE12_HOST_GID)}`,
        input.PHASE12_HOST_ROOT,
      ],
      { allowFailure: true },
    )
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : 'Unknown Phase 14 infrastructure failure')
  process.exitCode = 1
})
