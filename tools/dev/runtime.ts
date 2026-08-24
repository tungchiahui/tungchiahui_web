import { mkdirSync, rmSync } from 'node:fs'
import { resolve } from 'node:path'

import { z } from 'zod'

import { assertDockerPrerequisites, ComposeProject } from './compose'
import {
  documentedLocalCredentials,
  type LocalInfrastructureConfig,
  parseLocalInfrastructureConfig,
} from './config'
import { runInfrastructureHooks } from './hooks'
import { waitForHttp } from './http'
import { ensureBucket, waitForS3 } from './s3'

const portEnvironmentSchema = z.object({
  SITE_CONTROL_API_PORT: z.coerce.number().int().min(1024).max(65_535).default(18_080),
  SITE_FAKE_DEPLOY_AGENT_PORT: z.coerce.number().int().min(1024).max(65_535).default(18_081),
  SITE_OPENRESTY_PORT: z.coerce.number().int().min(1024).max(65_535).default(18_443),
  SITE_PGBOUNCER_PORT: z.coerce.number().int().min(1024).max(65_535).default(16_432),
  SITE_POSTGRES_PORT: z.coerce.number().int().min(1024).max(65_535).default(15_432),
  SITE_S3_PORT: z.coerce.number().int().min(1024).max(65_535).default(19_090),
  SITE_WEB_PORT: z.coerce.number().int().min(1024).max(65_535).default(3000),
})

type DevContext = Readonly<{
  compose: ComposeProject
  configuration: LocalInfrastructureConfig
  controlStateDirectory: string
  repositoryRoot: string
}>

function createDevContext(repositoryRoot: string): DevContext {
  const ports = portEnvironmentSchema.parse(process.env)
  const controlStateDirectory = resolve(repositoryRoot, '.local/control-state')
  const configuration = parseLocalInfrastructureConfig(
    {
      controlApiUrl: `http://127.0.0.1:${ports.SITE_CONTROL_API_PORT}`,
      controlStatePath: resolve(controlStateDirectory, 'control.db'),
      databaseUrl: `postgresql://${documentedLocalCredentials.databaseUser}:${documentedLocalCredentials.databasePassword}@127.0.0.1:${ports.SITE_PGBOUNCER_PORT}/tungchiahui`,
      fakeDeployAgentUrl: `http://127.0.0.1:${ports.SITE_FAKE_DEPLOY_AGENT_PORT}`,
      mode: 'local',
      openRestyUrl: `http://127.0.0.1:${ports.SITE_OPENRESTY_PORT}`,
      s3AccessKeyId: documentedLocalCredentials.s3AccessKeyId,
      s3Bucket: 'tungchiahui-local-assets',
      s3Endpoint: `http://127.0.0.1:${ports.SITE_S3_PORT}`,
      s3SecretAccessKey: documentedLocalCredentials.s3SecretAccessKey,
      siteBaseUrl: `http://127.0.0.1:${ports.SITE_WEB_PORT}`,
      translationProvider: 'fake',
    },
    controlStateDirectory,
  )
  const compose = new ComposeProject(repositoryRoot, 'tungchiahui_dev', 'dev', {
    controlStateDirectory,
    mode: 'local',
    openRestyPort: ports.SITE_OPENRESTY_PORT,
    s3Bucket: configuration.s3Bucket,
    s3RetainFiles: true,
    webPort: ports.SITE_WEB_PORT,
  })

  return Object.freeze({ compose, configuration, controlStateDirectory, repositoryRoot })
}

function ensureControlStateDirectory(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
}

export async function startDevelopmentStack(repositoryRoot = process.cwd()) {
  assertDockerPrerequisites()
  const context = createDevContext(repositoryRoot)
  ensureControlStateDirectory(context.controlStateDirectory)
  context.compose.validateModel()

  try {
    context.compose.up()
    await waitForS3(context.configuration)
    await ensureBucket(context.configuration)
    await runInfrastructureHooks(context.repositoryRoot, context.compose)
    await waitForHttp(new URL('/health', context.configuration.controlApiUrl), 'control-api')
    await waitForHttp(
      new URL('/health', context.configuration.fakeDeployAgentUrl),
      'fake-deploy-agent',
    )
  } catch (error: unknown) {
    context.compose.down(false)
    throw error
  }

  console.log('Local stack: healthy')
  console.log(`Website:          ${context.configuration.siteBaseUrl}`)
  console.log(`Control API:      ${context.configuration.controlApiUrl}`)
  console.log(`Fake deploy agent:${context.configuration.fakeDeployAgentUrl}`)
  console.log(`OpenResty:        ${context.configuration.openRestyUrl}`)
  console.log(
    `PgBouncer:        ${context.configuration.databaseUrl.hostname}:${context.configuration.databaseUrl.port}`,
  )
  console.log(`S3Mock:           ${context.configuration.s3Endpoint}`)
  console.log(`S3 bucket:        ${context.configuration.s3Bucket}`)
  console.log(`Control state:    ${context.configuration.controlStatePath}`)
  console.log('Translation:      fake/no-cost')
}

export function stopDevelopmentStack(repositoryRoot = process.cwd()) {
  assertDockerPrerequisites()
  const context = createDevContext(repositoryRoot)
  ensureControlStateDirectory(context.controlStateDirectory)
  context.compose.validateModel()
  context.compose.down(false)
  console.log('Local stack stopped; PostgreSQL, S3Mock, and control-state data were preserved.')
}

export function resetDevelopmentStack(repositoryRoot = process.cwd()) {
  assertDockerPrerequisites()
  const context = createDevContext(repositoryRoot)
  const expectedDirectory = resolve(repositoryRoot, '.local/control-state')

  if (context.controlStateDirectory !== expectedDirectory) {
    throw new Error(
      'Refusing reset because the control-state directory is not the exact local target',
    )
  }

  ensureControlStateDirectory(context.controlStateDirectory)
  context.compose.validateModel()
  console.log('Reset environment: local')
  console.log(`Compose project:   ${context.compose.projectName}`)
  console.log('Compose volumes:   tungchiahui_dev PostgreSQL/S3Mock/Next cache volumes')
  console.log(`Control state:     ${context.controlStateDirectory}`)
  context.compose.down(true)
  rmSync(context.controlStateDirectory, { force: true, recursive: true })
  console.log('Local development data reset complete. Run ./site dev to create a clean stack.')
}
