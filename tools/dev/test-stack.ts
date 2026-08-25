import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'

import { z } from 'zod'
import { S3ObjectStorageAdapter } from '../../src/storage/s3-adapter'
import { verifyPhase5Ingestion } from '../content/test-ingestion'
import { verifyPhase10CacheInvalidation, verifyPhase10Search } from '../search/test-search'
import { runStorageContract } from '../storage/contract'
import { verifyPhase9Translation } from '../translation/test-execution'
import { verifyPhase6Revalidation } from '../web/test-revalidation'
import { assertDockerPrerequisites, ComposeProject } from './compose'
import { documentedLocalCredentials, parseLocalInfrastructureConfig } from './config'
import { createLocalOperatorHeaders } from './control-auth-fixture'
import { runInfrastructureHooks, verifyPostgresAndPgBouncer } from './hooks'
import { fetchServiceHealth, waitForHttp } from './http'
import { runCommand } from './process'
import { ensureBucket, runS3Smoke, waitForS3 } from './s3'

const controlStatusSchema = z.object({
  applicationJobs: z.discriminatedUnion('available', [
    z.object({ available: z.literal(true) }),
    z.object({ available: z.literal(false), error: z.string() }),
  ]),
  controlState: z.object({
    checkpointPolicy: z.literal('wal_autocheckpoint=1000'),
    environment: z.literal('test'),
    incompleteOperations: z.number().int().nonnegative(),
    initializedAt: z.string(),
    journalMode: z.literal('wal'),
    schemaVersion: z.literal(4),
    synchronous: z.literal(2),
  }),
  deployAgent: z.literal('fake'),
  mode: z.literal('test'),
  productionOperations: z.literal(false),
})

const applicationJobResponseSchema = z.object({
  created: z.boolean(),
  job: z.object({ id: z.uuid(), jobType: z.literal('content_sync') }),
})

const translationJobResponseSchema = z.object({
  created: z.boolean(),
  job: z.object({ id: z.uuid() }),
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
  if (!(inspection.HostConfig.CapDrop ?? []).includes('ALL')) {
    throw new Error(`${service} must drop all ambient Linux capabilities locally`)
  }
  if (!(inspection.HostConfig.SecurityOpt ?? []).includes('no-new-privileges:true')) {
    throw new Error(`${service} must set no-new-privileges`)
  }
}

async function signedFetch(
  base: URL,
  path: string,
  options: { body?: unknown; idempotencyKey?: string; method?: string; nonce?: string } = {},
) {
  const method = options.method ?? 'GET'
  const bodyText = options.body === undefined ? '' : JSON.stringify(options.body)
  const body = Buffer.from(bodyText)
  const headers = new Headers(
    createLocalOperatorHeaders(
      method,
      path,
      body,
      options.nonce === undefined ? {} : { nonce: options.nonce },
    ),
  )
  if (options.body !== undefined) headers.set('content-type', 'application/json')
  if (options.idempotencyKey) headers.set('idempotency-key', options.idempotencyKey)
  const request: RequestInit = { headers, method, signal: AbortSignal.timeout(5_000) }
  if (body.length > 0) request.body = body
  const url = new URL(path, base)
  try {
    return await fetch(url, request)
  } catch (error: unknown) {
    throw new Error(
      `Control request ${method} ${url.toString()} failed: ${error instanceof Error ? `${error.message}: ${String(error.cause)}` : String(error)}`,
    )
  }
}

async function readStatus(base: URL, nonce: string) {
  const response = await signedFetch(base, '/api/ops/status', { nonce })
  const cacheControl = response.headers.get('cache-control')
  const responseBody = await response.text()
  if (cacheControl !== 'no-store') {
    throw new Error(
      `Control API status must use Cache-Control: no-store (received ${String(cacheControl)}; HTTP ${response.status}; headers ${JSON.stringify(Object.fromEntries(response.headers))}; body ${responseBody})`,
    )
  }
  if (!response.ok) {
    throw new Error(`Control API status returned HTTP ${response.status}: ${responseBody}`)
  }
  return controlStatusSchema.parse(JSON.parse(responseBody) as unknown)
}

async function fetchAfterServiceRestart(url: URL) {
  let lastError = 'unknown error'
  for (let attempt = 1; attempt <= 5; attempt += 1) {
    try {
      return await fetch(url, {
        headers: { connection: 'close' },
        signal: AbortSignal.timeout(5_000),
      })
    } catch (error: unknown) {
      lastError =
        error instanceof Error ? `${error.message}: ${String(error.cause)}` : String(error)
      if (attempt < 5) {
        await new Promise<void>((resolveWait) => setTimeout(resolveWait, 250))
      }
    }
  }
  throw new Error(`Unable to reach restarted service at ${url.toString()}: ${lastError}`)
}

async function verifyControlStatePersistence(compose: ComposeProject, controlApiUrl: URL) {
  const first = await readStatus(controlApiUrl, 'integration-status-before-restart')
  compose.restart('control-api')
  const restartedControlApiUrl = new URL(controlApiUrl)
  restartedControlApiUrl.port = String(compose.port('control-api', 8080))
  await waitForHttp(new URL('/health', restartedControlApiUrl), 'control-api')
  const second = await readStatus(restartedControlApiUrl, 'integration-status-after-restart')
  if (second.controlState.initializedAt !== first.controlState.initializedAt) {
    throw new Error('Control-state SQLite metadata did not persist across control-api restart')
  }
  return restartedControlApiUrl
}

async function verifyApplicationJobBoundary(controlApiUrl: URL) {
  const body = { jobType: 'content_sync', payload: { sourceCommit: 'a'.repeat(40) } }
  const createdResponse = await signedFetch(controlApiUrl, '/api/ops/application-jobs', {
    body,
    idempotencyKey: 'integration:content-sync:001',
    method: 'POST',
    nonce: 'integration-app-job-create-001',
  })
  if (createdResponse.status !== 202) {
    throw new Error(`Application Job creation returned HTTP ${createdResponse.status}`)
  }
  const created = applicationJobResponseSchema.parse((await createdResponse.json()) as unknown)
  const duplicateResponse = await signedFetch(controlApiUrl, '/api/ops/application-jobs', {
    body,
    idempotencyKey: 'integration:content-sync:001',
    method: 'POST',
    nonce: 'integration-app-job-create-002',
  })
  const duplicate = applicationJobResponseSchema.parse((await duplicateResponse.json()) as unknown)
  if (
    duplicateResponse.status !== 200 ||
    duplicate.created ||
    duplicate.job.id !== created.job.id
  ) {
    throw new Error('Application Job idempotency did not return the original durable job')
  }
  const queried = await signedFetch(controlApiUrl, `/api/ops/application-jobs/${created.job.id}`, {
    nonce: 'integration-app-job-query-001',
  })
  if (!queried.ok) {
    throw new Error(`Application Job query returned HTTP ${queried.status}`)
  }

  const datasetBody = {
    expectedRevision: 0,
    payload: {
      records: {
        'y1a/cpp-linux/cpp': {
          note: 'Phase 4 validated record',
          progress: 50,
          status: 'doing',
          updatedAt: '2026-08-24T12:00:00.000Z',
        },
      },
      version: 2,
    },
  }
  const dataset = await signedFetch(controlApiUrl, '/api/ops/datasets/tech_footprint', {
    body: datasetBody,
    method: 'PUT',
    nonce: 'integration-dataset-update-001',
  })
  if (!dataset.ok) {
    throw new Error(`Owner dataset update returned HTTP ${dataset.status}`)
  }
  const conflict = await signedFetch(controlApiUrl, '/api/ops/datasets/tech_footprint', {
    body: datasetBody,
    method: 'PUT',
    nonce: 'integration-dataset-update-002',
  })
  if (conflict.status !== 409) {
    throw new Error(`Owner dataset revision conflict returned HTTP ${conflict.status}`)
  }
  return created.job.id
}

async function verifyTranslationJobBoundary(controlApiUrl: URL) {
  const body = { force: false, mode: 'dry-run', scope: 'pending' }
  const createResponse = await signedFetch(controlApiUrl, '/api/ops/translations', {
    body,
    idempotencyKey: 'integration:translation:dry-run:001',
    method: 'POST',
    nonce: 'integration-translation-create-001',
  })
  if (createResponse.status !== 202) {
    throw new Error(`Translation Job creation returned HTTP ${createResponse.status}`)
  }
  const created = translationJobResponseSchema.parse((await createResponse.json()) as unknown)
  const duplicateResponse = await signedFetch(controlApiUrl, '/api/ops/translations', {
    body,
    idempotencyKey: 'integration:translation:dry-run:001',
    method: 'POST',
    nonce: 'integration-translation-create-002',
  })
  const duplicate = translationJobResponseSchema.parse((await duplicateResponse.json()) as unknown)
  if (
    duplicateResponse.status !== 200 ||
    duplicate.created ||
    duplicate.job.id !== created.job.id
  ) {
    throw new Error('Translation Job idempotency did not return the original durable job')
  }
  const queried = await signedFetch(controlApiUrl, `/api/ops/translations/${created.job.id}`, {
    nonce: 'integration-translation-query-001',
  })
  if (!queried.ok) {
    throw new Error(`Translation Job query returned HTTP ${queried.status}`)
  }
  const listed = await signedFetch(controlApiUrl, '/api/ops/translations/status', {
    nonce: 'integration-translation-list-001',
  })
  if (!listed.ok) {
    throw new Error(`Translation Job list returned HTTP ${listed.status}`)
  }
  return created.job.id
}

async function verifyOpenRestyAndFailureBoundaries(
  compose: ComposeProject,
  controlApiUrl: URL,
  openRestyUrl: URL,
  siteBaseUrl: URL,
) {
  const ordinary = await fetch(openRestyUrl, {
    headers: { connection: 'close' },
    signal: AbortSignal.timeout(5_000),
  })
  if (!ordinary.ok) {
    throw new Error(`OpenResty ordinary route returned HTTP ${ordinary.status}`)
  }
  const routedStatus = await readStatus(openRestyUrl, 'integration-openresty-status-001')
  if (!routedStatus.applicationJobs.available) {
    throw new Error('OpenResty did not route the application-job-capable control path')
  }

  compose.stop('web')
  const unavailableWeb = await fetch(openRestyUrl, {
    headers: { connection: 'close' },
    signal: AbortSignal.timeout(5_000),
  })
  if (unavailableWeb.status < 500) {
    throw new Error('Ordinary OpenResty path stayed healthy after the Next.js slot stopped')
  }
  await readStatus(openRestyUrl, 'integration-next-down-status-001')
  compose.start('web')
  const restartedSiteBaseUrl = new URL(siteBaseUrl)
  restartedSiteBaseUrl.port = String(compose.port('web', 3000))
  const restartedWeb = await fetchAfterServiceRestart(restartedSiteBaseUrl)
  if (!restartedWeb.ok) {
    throw new Error(`Restarted Next.js returned HTTP ${restartedWeb.status}`)
  }

  compose.stop('pgbouncer')
  const postgresqlDown = await readStatus(openRestyUrl, 'integration-postgres-down-status-001')
  if (postgresqlDown.applicationJobs.available) {
    throw new Error('Application jobs remained available after PostgreSQL access stopped')
  }
  const operationBody = {
    operationType: 'restore',
    reason: 'Disposable PostgreSQL-down integration test',
    target: { backupId: 'integration-backup', environment: 'test' },
  }
  const infrastructure = await signedFetch(openRestyUrl, '/api/ops/infrastructure-operations', {
    body: operationBody,
    idempotencyKey: 'integration:restore:pg-down',
    method: 'POST',
    nonce: 'integration-pg-down-infra-001',
  })
  if (infrastructure.status !== 202) {
    throw new Error(`SQLite operation creation returned HTTP ${infrastructure.status}`)
  }
  const infrastructureBody = z
    .object({ operation: z.object({ id: z.uuid() }) })
    .parse((await infrastructure.json()) as unknown)
  const queriedInfrastructure = await signedFetch(
    openRestyUrl,
    `/api/ops/infrastructure-operations/${infrastructureBody.operation.id}`,
    { nonce: 'integration-pg-down-infra-query-001' },
  )
  if (!queriedInfrastructure.ok) {
    throw new Error(
      `SQLite operation query with PostgreSQL down returned HTTP ${queriedInfrastructure.status}`,
    )
  }
  const application = await signedFetch(controlApiUrl, '/api/ops/application-jobs', {
    body: { jobType: 'content_sync', payload: { sourceCommit: 'b'.repeat(40) } },
    idempotencyKey: 'integration:content-sync:pg-down',
    method: 'POST',
    nonce: 'integration-pg-down-app-001',
  })
  if (application.status !== 503) {
    throw new Error(`PostgreSQL-down Application Job returned HTTP ${application.status}`)
  }
  const health = await fetch(new URL('/api/health', restartedSiteBaseUrl), {
    signal: AbortSignal.timeout(5_000),
  })
  const ready = await fetch(new URL('/api/ready', restartedSiteBaseUrl), {
    signal: AbortSignal.timeout(5_000),
  })
  const version = await fetch(new URL('/api/version', restartedSiteBaseUrl), {
    signal: AbortSignal.timeout(5_000),
  })
  if (!health.ok || ready.status !== 503 || !version.ok) {
    throw new Error(
      'Web health/ready/version did not distinguish liveness from PostgreSQL readiness',
    )
  }
}

function runPlaywright(siteBaseUrl: URL) {
  runCommand('pnpm', ['exec', 'playwright', 'test'], {
    environment: {
      ...process.env,
      PLAYWRIGHT_BASE_URL: siteBaseUrl.toString(),
    },
    inheritOutput: true,
  })
}

async function run() {
  assertDockerPrerequisites()
  const repositoryRoot = process.cwd()
  const temporaryRoot = mkdtempSync(join(tmpdir(), 'tungchiahui-phase10-'))
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
    openRestyPort: 18_443,
    s3Bucket: bucket,
    s3RetainFiles: false,
    webPort: 3000,
  })
  let stackStarted = false

  try {
    compose.validateModel()
    stackStarted = true
    compose.up()
    if (process.env.SITE_TEST_INJECT_FAILURE === 'after-start') {
      throw new Error('Injected Phase 5 failure after disposable stack start')
    }

    const configuration = parseLocalInfrastructureConfig(
      {
        controlApiUrl: `http://127.0.0.1:${compose.port('control-api', 8080)}`,
        controlStatePath: resolve(controlStateDirectory, 'control.db'),
        databaseUrl: `postgresql://${documentedLocalCredentials.databaseUser}:${documentedLocalCredentials.databasePassword}@127.0.0.1:${compose.port('pgbouncer', 6432)}/tungchiahui`,
        fakeDeployAgentUrl: `http://127.0.0.1:${compose.port('fake-deploy-agent', 8081)}`,
        mode: 'test',
        openRestyUrl: `http://127.0.0.1:${compose.port('openresty', 8082)}`,
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
    await runInfrastructureHooks(repositoryRoot, compose)
    verifyPostgresAndPgBouncer(compose)
    await runS3Smoke(configuration)
    const contractStorage = new S3ObjectStorageAdapter({
      accessKeyId: configuration.s3AccessKeyId,
      bucket: configuration.s3Bucket,
      endpoint: configuration.s3Endpoint,
      forcePathStyle: true,
      region: 'us-east-1',
      secretAccessKey: configuration.s3SecretAccessKey,
    })
    try {
      const storageReport = await runStorageContract(contractStorage)
      console.log(
        `S3Mock storage contract: PASS (${storageReport.cases.length} cases; cleanup ${storageReport.cleanup})`,
      )
    } finally {
      contractStorage.destroy()
    }
    await fetchServiceHealth(new URL('/health', configuration.controlApiUrl), 'control-api')
    await fetchServiceHealth(
      new URL('/health', configuration.fakeDeployAgentUrl),
      'fake-deploy-agent',
    )
    const openRestyHealth = await fetch(new URL('/openresty-health', configuration.openRestyUrl), {
      signal: AbortSignal.timeout(5_000),
    })
    if (!openRestyHealth.ok) {
      throw new Error(`OpenResty health returned HTTP ${openRestyHealth.status}`)
    }
    const webHealth = await fetch(configuration.siteBaseUrl, {
      headers: { connection: 'close' },
      signal: AbortSignal.timeout(5_000),
    })
    if (!webHealth.ok) {
      throw new Error(`Disposable Next.js returned HTTP ${webHealth.status}`)
    }

    requireHardenedLocalService(compose, 'control-api')
    requireHardenedLocalService(compose, 'content-worker')
    requireHardenedLocalService(compose, 'fake-deploy-agent')
    const firstContentJobId = await verifyApplicationJobBoundary(configuration.controlApiUrl)
    await verifyPhase5Ingestion(configuration.databaseUrl.toString(), firstContentJobId)
    await verifyPhase10Search(configuration.databaseUrl.toString(), configuration.siteBaseUrl)
    await verifyPhase6Revalidation(configuration.databaseUrl.toString(), configuration.siteBaseUrl)
    await verifyPhase10CacheInvalidation(configuration.siteBaseUrl)
    const firstTranslationJobId = await verifyTranslationJobBoundary(configuration.controlApiUrl)
    runPlaywright(configuration.siteBaseUrl)
    await verifyPhase9Translation(configuration.databaseUrl.toString(), firstTranslationJobId)
    const restartedControlApiUrl = await verifyControlStatePersistence(
      compose,
      configuration.controlApiUrl,
    )
    await verifyOpenRestyAndFailureBoundaries(
      compose,
      restartedControlApiUrl,
      configuration.openRestyUrl,
      configuration.siteBaseUrl,
    )
    console.log(`Disposable infrastructure and public E2E: PASS (${projectName})`)
  } catch (error: unknown) {
    if (stackStarted) compose.logs('web')
    throw error
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
