import { spawnSync } from 'node:child_process'
import { generateKeyPairSync } from 'node:crypto'
import { chmodSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'

import { stringify } from 'yaml'
import { z } from 'zod'

const input = z
  .object({
    PHASE12_GIT_SHA: z.string().regex(/^[a-f0-9]{40}$/),
    PHASE12_HOST_GID: z.coerce.number().int().nonnegative(),
    PHASE12_HOST_ROOT: z.string().startsWith('/'),
    PHASE12_HOST_UID: z.coerce.number().int().nonnegative(),
    PHASE12_ORIGIN_PORT: z.coerce.number().int().min(1024).max(65_535),
  })
  .parse(process.env)

const projectName = `tungchiahui-phase12-${process.pid}`
const webImage = `tungchiahui-web:${input.PHASE12_GIT_SHA}`
const serviceImage = `tungchiahui-services:${input.PHASE12_GIT_SHA}`
const recoveryImage = `tungchiahui-recovery:${input.PHASE12_GIT_SHA}`
const postgresImage = `tungchiahui-postgres:${input.PHASE12_GIT_SHA}`
const configRoot = join(input.PHASE12_HOST_ROOT, 'etc')
const dataRoot = join(input.PHASE12_HOST_ROOT, 'var')
const secretRoot = join(input.PHASE12_HOST_ROOT, 'run', 'secrets')
const workRoot = join(input.PHASE12_HOST_ROOT, 'work')
const identityPath = join(workRoot, 'age-identity.txt')
const plainSecretPath = join(workRoot, 'production.plain.yaml')
const encryptedSecretPath = join(workRoot, 'production.sops.yaml')
const certificatePath = join(workRoot, 'origin.crt')
const privateKeyPath = join(workRoot, 'origin.key')
const inventoryPath = join(workRoot, 'inventory.yml')
const variablesPath = join(workRoot, 'variables.json')

for (const directory of [configRoot, dataRoot, secretRoot, workRoot]) {
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
    TUNGCHIAHUI_CONFIG_ROOT: configRoot,
    TUNGCHIAHUI_CONTENT_POLLING_ENABLED: 'false',
    TUNGCHIAHUI_DATA_ROOT: dataRoot,
    TUNGCHIAHUI_DEPLOYMENT_SHA: input.PHASE12_GIT_SHA,
    TUNGCHIAHUI_DOCKER_SOCKET_GID: socket,
    TUNGCHIAHUI_ORIGIN_PORT: String(input.PHASE12_ORIGIN_PORT),
    TUNGCHIAHUI_POSTGRES_CONTAINER_NAME: `${projectName}-postgres-1`,
    TUNGCHIAHUI_POSTGRES_IMAGE: postgresImage,
    TUNGCHIAHUI_RECOVERY_IMAGE: recoveryImage,
    TUNGCHIAHUI_SEARCH_POLLING_ENABLED: 'false',
    TUNGCHIAHUI_SECRET_DIRECTORY: secretRoot,
    TUNGCHIAHUI_SERVICE_IMAGE: serviceImage,
    TUNGCHIAHUI_WEB_IMAGE: webImage,
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

function expect(condition: boolean, message: string): asserts condition {
  if (!condition) throw new Error(message)
}

function createEncryptedSecret() {
  execute('age-keygen', ['--output', identityPath])
  chmodSync(identityPath, 0o600)
  const recipient = execute('age-keygen', ['--y', identityPath]).stdout.trim()
  execute('openssl', [
    'req',
    '-x509',
    '-newkey',
    'rsa:2048',
    '-nodes',
    '-keyout',
    privateKeyPath,
    '-out',
    certificatePath,
    '-days',
    '1',
    '-subj',
    '/CN=ddns.tungchiahui.cn',
    '-addext',
    'subjectAltName=DNS:ddns.tungchiahui.cn,DNS:www.tungchiahui.cn,IP:127.0.0.1,IP:::1',
  ])
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
  const githubPolicy = JSON.stringify({
    audience: 'tungchiahui-control-api',
    capabilities: ['translation:read'],
    environment: 'production',
    issuer: 'https://token.actions.githubusercontent.com',
    jwksUrl: 'https://token.actions.githubusercontent.com/.well-known/jwks',
    ref: 'refs/heads/main',
    repository: 'tungchiahui/tungchiahui_web',
    workflowRef: 'tungchiahui/tungchiahui_web/.github/workflows/translation.yml@refs/heads/main',
  })
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
      'BACKUP_S3_ENDPOINT=https://primary-backup.example.invalid',
      'BACKUP_S3_REGION=us-east-1',
      'BACKUP_S3_BUCKET=phase13-primary-backup',
      'BACKUP_S3_ACCESS_KEY_ID=phase13-primary-only-access',
      'BACKUP_S3_SECRET_ACCESS_KEY=phase13-primary-only-secret',
      'BACKUP_S3_FORCE_PATH_STYLE=true',
      'BACKUP_R2_ENDPOINT=https://phase13.r2.cloudflarestorage.com',
      'BACKUP_R2_REGION=auto',
      'BACKUP_R2_BUCKET=phase13-r2-offsite',
      'BACKUP_R2_ACCESS_KEY_ID=phase13-r2-only-access',
      'BACKUP_R2_SECRET_ACCESS_KEY=phase13-r2-only-secret',
      'BACKUP_R2_FORCE_PATH_STYLE=false',
    ].join('\n'),
    content_worker_env: [
      `DATABASE_URL=postgresql://site_content_worker_login:${workerPassword}@pgbouncer:6432/tungchiahui`,
      'GITHUB_CONTENT_REPOSITORY=tungchiahui/content',
      `SITE_REVALIDATION_SECRET=${testSecret}`,
    ].join('\n'),
    control_api_env: [
      `DATABASE_URL=postgresql://site_control_api_login:${controlPassword}@pgbouncer:6432/tungchiahui`,
      `CONTROL_OPERATOR_KEYS_JSON=${operatorKeys}`,
      `CONTROL_GITHUB_OIDC_POLICY_JSON=${githubPolicy}`,
    ].join('\n'),
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
    origin_certificate: readFileSync(certificatePath, 'utf8'),
    origin_private_key: readFileSync(privateKeyPath, 'utf8'),
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
  return { identityPath }
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
      tungchiahui_data_root: dataRoot,
      tungchiahui_deployment_sha: input.PHASE12_GIT_SHA,
      tungchiahui_install_packages: false,
      tungchiahui_manage_stack: true,
      tungchiahui_origin_port: String(input.PHASE12_ORIGIN_PORT),
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

function verifyRoutingAndIpFamilies() {
  const port = String(input.PHASE12_ORIGIN_PORT)
  curl(['--ipv4', `https://127.0.0.1:${port}/api/health`], 200)
  curl(['--ipv6', `https://[::1]:${port}/api/health`], 200)
  curl([`https://127.0.0.1:${port}/api/ops/status`], 401)
  compose(['stop', 'web-blue', 'web-green'])
  curl([`https://127.0.0.1:${port}/api/ops/status`], 401)
  compose(['start', 'web-blue', 'web-green'])
  compose(['stop', 'postgres'])
  curl([`https://127.0.0.1:${port}/api/ops/status`], 401)
  const config = readFileSync(join(configRoot, 'openresty.conf'), 'utf8')
  expect(config.includes('listen [::]:8443 ssl ipv6only=off;'), 'OpenResty is not dual-stack')
  expect(
    config.includes('set $control_upstream control-api:8080;'),
    'Control API does not use service DNS',
  )
  const configWithoutDockerDns = config.replaceAll('127.0.0.11', '')
  expect(
    !/\b(?:\d{1,3}\.){3}\d{1,3}\b/.test(configWithoutDockerDns),
    'OpenResty contains a numeric public IPv4',
  )
}

const encrypted = createEncryptedSecret()
buildImages()

try {
  runProvision(encrypted.identityPath)
  inspectHardening()
  verifyDatabaseRoleBindings()
  verifyRoutingAndIpFamilies()
  console.log(
    JSON.stringify({
      ansibleIdempotency: 'pass',
      containerHardening: 'pass',
      databaseRoleSeparation: 'pass',
      ipv4AndIpv6Origin: 'pass',
      nextDownControlRoute: 'pass',
      openRestyValidationAndReload: 'pass',
      postgresDownControlRoute: 'pass',
      productionTraffic: false,
      secretInjection: 'sops-age-runtime-only',
      status: 'pass',
    }),
  )
} catch (error) {
  const diagnostics = compose(['logs', '--no-color'], true)
  console.error(diagnostics.stdout)
  console.error(diagnostics.stderr)
  throw error
} finally {
  compose(['down', '--volumes', '--remove-orphans'], true)
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
