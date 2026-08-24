import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { z } from 'zod'

import { assertDockerPrerequisites, ComposeProject } from './compose'
import { documentedLocalCredentials, parseLocalInfrastructureConfig } from './config'
import { runInfrastructureHooks, verifyPostgresAndPgBouncer } from './hooks'
import { fetchServiceHealth, waitForHttp } from './http'
import { ensureBucket, runS3Smoke, waitForS3 } from './s3'

const controlStatusSchema = z.object({
  controlState: z.object({
    environment: z.literal('test'),
    initializedAt: z.string(),
    journalMode: z.literal('wal'),
    schemaVersion: z.literal(1),
    synchronous: z.literal(2),
  }),
  deployAgent: z.literal('fake'),
  mode: z.literal('test'),
  productionOperations: z.literal(false),
})

function requireHardenedLocalService(compose: ComposeProject, service: string) {
  const inspection = compose.inspectService(service)
  const binds = inspection.HostConfig.Binds ?? []

  if (inspection.HostConfig.Privileged) {
    throw new Error(`${service} must not be privileged`)
  }

  if (binds.some((bind) => bind.includes('/var/run/docker.sock'))) {
    throw new Error(`${service} must not mount the Docker socket`)
  }

  if (!inspection.HostConfig.ReadonlyRootfs) {
    throw new Error(`${service} must use a read-only root filesystem locally`)
  }

  if (!(inspection.HostConfig.SecurityOpt ?? []).includes('no-new-privileges:true')) {
    throw new Error(`${service} must set no-new-privileges`)
  }
}

async function verifyControlStatePersistence(compose: ComposeProject, controlApiUrl: URL) {
  const statusUrl = new URL('/api/ops/status', controlApiUrl)
  const firstResponse = await fetch(statusUrl, { signal: AbortSignal.timeout(5000) })

  if (firstResponse.headers.get('cache-control') !== 'no-store') {
    throw new Error('Local control API status must use Cache-Control: no-store')
  }

  const first = controlStatusSchema.parse((await firstResponse.json()) as unknown)
  compose.restart('control-api')
  const restartedControlApiUrl = new URL(controlApiUrl)
  restartedControlApiUrl.port = String(compose.port('control-api', 8080))
  await waitForHttp(new URL('/health', restartedControlApiUrl), 'control-api')
  const secondResponse = await fetch(new URL('/api/ops/status', restartedControlApiUrl), {
    signal: AbortSignal.timeout(5000),
  })
  const second = controlStatusSchema.parse((await secondResponse.json()) as unknown)

  if (second.controlState.initializedAt !== first.controlState.initializedAt) {
    throw new Error('Control-state SQLite metadata did not persist across control-api restart')
  }
}

async function run() {
  assertDockerPrerequisites()
  const repositoryRoot = process.cwd()
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tungchiahui-phase2-'))
  const suffix = basename(temporaryRoot)
    .replaceAll(/[^a-z0-9]/g, '')
    .slice(-12)
  const projectName = `tungchiahui_test_${suffix}`
  const controlStateDirectory = resolve(temporaryRoot, 'control-state')
  const bucket = `tungchiahui-test-${suffix}`
  mkdirSync(controlStateDirectory, { recursive: true, mode: 0o700 })
  const compose = new ComposeProject(repositoryRoot, projectName, 'test', {
    controlStateDirectory,
    mode: 'test',
    s3Bucket: bucket,
    s3RetainFiles: false,
    webPort: 3000,
  })
  let stackStarted = false

  try {
    compose.validateModel()
    compose.up()
    stackStarted = true

    if (process.env.SITE_TEST_INJECT_FAILURE === 'after-start') {
      throw new Error('Injected Phase 2 failure after disposable stack start')
    }

    const configuration = parseLocalInfrastructureConfig(
      {
        controlApiUrl: `http://127.0.0.1:${compose.port('control-api', 8080)}`,
        controlStatePath: resolve(controlStateDirectory, 'control.db'),
        databaseUrl: `postgresql://${documentedLocalCredentials.databaseUser}:${documentedLocalCredentials.databasePassword}@127.0.0.1:${compose.port('pgbouncer', 6432)}/tungchiahui`,
        fakeDeployAgentUrl: `http://127.0.0.1:${compose.port('fake-deploy-agent', 8081)}`,
        mode: 'test',
        s3AccessKeyId: documentedLocalCredentials.s3AccessKeyId,
        s3Bucket: bucket,
        s3Endpoint: `http://127.0.0.1:${compose.port('s3mock', 9090)}`,
        s3SecretAccessKey: documentedLocalCredentials.s3SecretAccessKey,
        siteBaseUrl: `http://127.0.0.1:${compose.port('web', 3000)}`,
        translationProvider: 'fake',
      },
      controlStateDirectory,
    )

    await waitForS3(configuration)
    await ensureBucket(configuration)
    runInfrastructureHooks(repositoryRoot, compose)
    verifyPostgresAndPgBouncer(compose)
    await runS3Smoke(configuration)
    await fetchServiceHealth(new URL('/health', configuration.controlApiUrl), 'control-api')
    await fetchServiceHealth(
      new URL('/health', configuration.fakeDeployAgentUrl),
      'fake-deploy-agent',
    )
    const webResponse = await fetch(configuration.siteBaseUrl, {
      signal: AbortSignal.timeout(5000),
    })

    if (!webResponse.ok) {
      throw new Error(`Disposable Next.js returned HTTP ${webResponse.status}`)
    }

    requireHardenedLocalService(compose, 'control-api')
    requireHardenedLocalService(compose, 'fake-deploy-agent')
    await verifyControlStatePersistence(compose, configuration.controlApiUrl)
    console.log(`Disposable infrastructure: PASS (${projectName})`)
  } finally {
    if (stackStarted) {
      compose.down(true)
      compose.assertRemoved()
    }

    rmSync(temporaryRoot, { force: true, recursive: true })
  }
}

run().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Unknown disposable infrastructure failure',
  )
  process.exitCode = 1
})
