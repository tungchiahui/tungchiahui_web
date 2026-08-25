import { createServer, type ServerResponse } from 'node:http'
import { hostname } from 'node:os'

import { z } from 'zod'

import { GitHubContentSource } from '../../src/content/github-source'
import { CompositeContentHooks } from '../../src/content/hooks'
import { ContentIngestionRepository } from '../../src/content/ingestion'
import { ContentJobRepository } from '../../src/content/jobs'
import { PublicContentHooks } from '../../src/content/revalidation'
import { ContentWorker } from '../../src/content/worker'
import { serviceIdentityContracts } from '../../src/control-plane/contracts'
import { SearchRefreshContentHook } from '../../src/search/hooks'
import { SearchJobRepository, SearchWorker } from '../../src/search/jobs'
import { SearchIndexRepository } from '../../src/search/repository'
import { TranslationJobRepository, TranslationWorker } from '../../src/translation/jobs'
import { createFakeTranslationProvider } from '../../src/translation/provider'

const configuration = z
  .object({
    CONTENT_WORKER_HOST: z.enum(['0.0.0.0', '127.0.0.1']),
    CONTENT_WORKER_ID: z.string().min(1).optional(),
    CONTENT_WORKER_POLLING_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    CONTENT_WORKER_POLL_INTERVAL_MS: z.coerce.number().int().min(100).max(60_000).default(1_000),
    CONTENT_WORKER_PORT: z.coerce.number().int().min(1024).max(65_535),
    DATABASE_URL: z.url(),
    GITHUB_API_BASE_URL: z.url().default('https://api.github.com'),
    GITHUB_CONTENT_READ_TOKEN: z.preprocess(
      (value) => (value === '' ? undefined : value),
      z.string().min(1).optional(),
    ),
    GITHUB_CONTENT_REPOSITORY: z.string().min(3).optional(),
    SITE_REVALIDATION_ENDPOINT: z.url().optional(),
    SITE_REVALIDATION_SECRET: z.string().min(32).optional(),
    SITE_RUNTIME_MODE: z.enum(['local', 'test']),
    SEARCH_WORKER_POLLING_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
    TRANSLATION_PROVIDER: z.literal('fake').default('fake'),
    TRANSLATION_WORKER_POLLING_ENABLED: z
      .enum(['true', 'false'])
      .default('false')
      .transform((value) => value === 'true'),
  })
  .superRefine((value, context) => {
    if (value.CONTENT_WORKER_POLLING_ENABLED && value.GITHUB_CONTENT_REPOSITORY === undefined) {
      context.addIssue({
        code: 'custom',
        message: 'GITHUB_CONTENT_REPOSITORY is required when content-worker polling is enabled',
        path: ['GITHUB_CONTENT_REPOSITORY'],
      })
    }
    if (
      (value.CONTENT_WORKER_POLLING_ENABLED ||
        value.SEARCH_WORKER_POLLING_ENABLED ||
        value.TRANSLATION_WORKER_POLLING_ENABLED) &&
      (value.SITE_REVALIDATION_ENDPOINT === undefined ||
        value.SITE_REVALIDATION_SECRET === undefined)
    ) {
      context.addIssue({
        code: 'custom',
        message:
          'SITE_REVALIDATION_ENDPOINT and SITE_REVALIDATION_SECRET are required when polling is enabled',
        path: ['SITE_REVALIDATION_ENDPOINT'],
      })
    }
  })
  .parse(process.env)

function sendJson(response: ServerResponse, statusCode: number, payload: unknown) {
  response.statusCode = statusCode
  response.setHeader('cache-control', 'no-store')
  response.setHeader('content-type', 'application/json; charset=utf-8')
  response.end(JSON.stringify(payload))
}

const server = createServer((request, response) => {
  if (request.method !== 'GET') {
    sendJson(response, 405, { error: 'method_not_allowed' })
    return
  }
  if (request.url === '/health' || request.url === '/capabilities') {
    sendJson(response, 200, {
      contract: serviceIdentityContracts['content-worker'],
      githubDirection: 'read-only',
      jobExecution: configuration.CONTENT_WORKER_POLLING_ENABLED ? 'enabled' : 'idle',
      mode: configuration.SITE_RUNTIME_MODE,
      productionOperations: false,
      service: 'content-worker',
      status: 'ok',
      translationExecution: configuration.TRANSLATION_WORKER_POLLING_ENABLED ? 'enabled' : 'idle',
      searchReindexExecution: configuration.SEARCH_WORKER_POLLING_ENABLED ? 'enabled' : 'idle',
    })
    return
  }
  sendJson(response, 404, { error: 'not_found' })
})

let stopping = false
let jobs: ContentJobRepository | undefined
let ingestion: ContentIngestionRepository | undefined
let translationJobs: TranslationJobRepository | undefined
let searchJobs: SearchJobRepository | undefined
let searchIndex: SearchIndexRepository | undefined
const searchHooks: SearchRefreshContentHook[] = []

async function poll(worker: ContentWorker) {
  while (!stopping) {
    try {
      const result = await worker.runOnce()
      if (result.claimed) {
        console.log(
          JSON.stringify({
            completed: result.completed,
            event: 'content_job_processed',
            jobId: result.jobId,
          }),
        )
      }
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          event: 'content_worker_poll_failed',
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      )
    }
    await new Promise<void>((resolveWait) =>
      setTimeout(resolveWait, configuration.CONTENT_WORKER_POLL_INTERVAL_MS),
    )
  }
}

async function pollTranslations(worker: TranslationWorker) {
  while (!stopping) {
    try {
      const result = await worker.runOnce()
      if (result.claimed) {
        console.log(
          JSON.stringify({
            event: 'translation_job_processed',
            jobId: result.jobId,
            status: result.status,
          }),
        )
      }
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          event: 'translation_worker_poll_failed',
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      )
    }
    await new Promise<void>((resolveWait) =>
      setTimeout(resolveWait, configuration.CONTENT_WORKER_POLL_INTERVAL_MS),
    )
  }
}

async function pollSearch(worker: SearchWorker) {
  while (!stopping) {
    try {
      const result = await worker.runOnce()
      if (result.claimed) {
        console.log(JSON.stringify({ event: 'search_job_processed', jobId: result.jobId }))
      }
    } catch (error: unknown) {
      console.error(
        JSON.stringify({
          event: 'search_worker_poll_failed',
          message: error instanceof Error ? error.message : 'unknown error',
        }),
      )
    }
    await new Promise<void>((resolveWait) =>
      setTimeout(resolveWait, configuration.CONTENT_WORKER_POLL_INTERVAL_MS),
    )
  }
}

if (configuration.CONTENT_WORKER_POLLING_ENABLED) {
  const repository = configuration.GITHUB_CONTENT_REPOSITORY
  if (repository === undefined) throw new Error('Validated GitHub repository is missing')
  jobs = new ContentJobRepository(configuration.DATABASE_URL)
  const searchHook = new SearchRefreshContentHook(configuration.DATABASE_URL)
  searchHooks.push(searchHook)
  ingestion = new ContentIngestionRepository(
    configuration.DATABASE_URL,
    new CompositeContentHooks([
      searchHook,
      new PublicContentHooks(
        configuration.SITE_REVALIDATION_ENDPOINT ?? '',
        configuration.SITE_REVALIDATION_SECRET ?? '',
      ),
    ]),
  )
  const sourceOptions = {
    apiBaseUrl: configuration.GITHUB_API_BASE_URL,
    repository,
    ...(configuration.GITHUB_CONTENT_READ_TOKEN === undefined
      ? {}
      : { token: configuration.GITHUB_CONTENT_READ_TOKEN }),
  }
  const worker = new ContentWorker({
    contentSource: new GitHubContentSource(sourceOptions),
    ingestion,
    jobs,
    retryDelayMilliseconds: 5_000,
    workerId: configuration.CONTENT_WORKER_ID ?? `${hostname()}:${process.pid}`,
  })
  void poll(worker)
}

if (configuration.TRANSLATION_WORKER_POLLING_ENABLED) {
  if (
    configuration.SITE_REVALIDATION_ENDPOINT === undefined ||
    configuration.SITE_REVALIDATION_SECRET === undefined
  ) {
    throw new Error('Translation execution requires the validated revalidation endpoint and secret')
  }
  translationJobs = new TranslationJobRepository(configuration.DATABASE_URL)
  const searchHook = new SearchRefreshContentHook(configuration.DATABASE_URL)
  searchHooks.push(searchHook)
  const worker = new TranslationWorker({
    hooks: new CompositeContentHooks([
      searchHook,
      new PublicContentHooks(
        configuration.SITE_REVALIDATION_ENDPOINT,
        configuration.SITE_REVALIDATION_SECRET,
      ),
    ]),
    jobs: translationJobs,
    provider: createFakeTranslationProvider(),
    workerId: configuration.CONTENT_WORKER_ID ?? `${hostname()}:${process.pid}:translation`,
  })
  void pollTranslations(worker)
}

if (configuration.SEARCH_WORKER_POLLING_ENABLED) {
  if (
    configuration.SITE_REVALIDATION_ENDPOINT === undefined ||
    configuration.SITE_REVALIDATION_SECRET === undefined
  ) {
    throw new Error(
      'Search reindex execution requires the validated revalidation endpoint and secret',
    )
  }
  searchJobs = new SearchJobRepository(configuration.DATABASE_URL)
  searchIndex = new SearchIndexRepository(configuration.DATABASE_URL)
  const worker = new SearchWorker({
    hooks: new PublicContentHooks(
      configuration.SITE_REVALIDATION_ENDPOINT,
      configuration.SITE_REVALIDATION_SECRET,
    ),
    indexer: searchIndex,
    jobs: searchJobs,
    workerId: configuration.CONTENT_WORKER_ID ?? `${hostname()}:${process.pid}:search`,
  })
  void pollSearch(worker)
}

server.listen(configuration.CONTENT_WORKER_PORT, configuration.CONTENT_WORKER_HOST, () => {
  console.log(
    JSON.stringify({
      event: 'content_worker_started',
      mode: configuration.SITE_RUNTIME_MODE,
      pollingEnabled: configuration.CONTENT_WORKER_POLLING_ENABLED,
      port: configuration.CONTENT_WORKER_PORT,
      searchPollingEnabled: configuration.SEARCH_WORKER_POLLING_ENABLED,
      translationPollingEnabled: configuration.TRANSLATION_WORKER_POLLING_ENABLED,
    }),
  )
})

function shutdown() {
  stopping = true
  server.close(async (error) => {
    await Promise.all([
      jobs?.close(),
      ingestion?.close(),
      translationJobs?.close(),
      searchJobs?.close(),
      searchIndex?.close(),
      ...searchHooks.map((hook) => hook.close()),
    ])
    if (error) {
      console.error(
        JSON.stringify({ event: 'content_worker_shutdown_failed', message: error.message }),
      )
      process.exitCode = 1
      return
    }
    process.exitCode = 0
  })
}

process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
