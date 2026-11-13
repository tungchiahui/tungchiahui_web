import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  claimNextInfrastructureOperation,
  createInfrastructureOperation,
  finishInfrastructureOperation,
  initializeControlState,
  initializeDeploymentRuntime,
  listInfrastructureOperations,
  reconcileInfrastructureOperations,
  requeueDeploymentOperationForReconciliation,
  startInfrastructureOperation,
} from '../../src/control-plane/control-state'
import { hostSettingsSchema } from '../../src/host-release/contracts'
import { hostControlPath } from '../../src/host-release/coordinator'
import * as provision from '../../src/host-release/provision'
import {
  publicReleaseStatus,
  readReleasePull,
  setReleasePullEnabled,
} from '../../src/host-release/publication-state'
import { configureReleasePull, pollPublishedRelease } from '../../src/host-release/release-pull'
import {
  acquireHostExecutor,
  commitHostGeneration,
  initializeHostReleaseState,
  stageHostGeneration,
} from '../../src/host-release/state'
import { githubReleaseRequest } from '../../tools/ci/github-publications'
import { publishRelease } from '../../tools/ci/publish-release'
import { parseReleasePullCommand } from '../../tools/ci/release-pull-command'

const directories: string[] = []
afterEach(() => {
  vi.restoreAllMocks()
  for (const path of directories.splice(0)) rmSync(path, { recursive: true, force: true })
})
const publication = {
  version: 1 as const,
  gitSha: 'a'.repeat(40),
  imageDigest: `sha256:${'b'.repeat(64)}`,
  serviceSha: 'c'.repeat(40),
  recoverySha: 'd'.repeat(40),
  runId: 123,
  automatic: true,
}
const deployment = {
  id: 42,
  sha: publication.gitSha,
  environment: 'production',
  creator: { login: 'github-actions[bot]' },
  payload: publication,
}
const actor = {
  id: 'operator:test',
  kind: 'operator' as const,
  capabilities: ['infrastructure-operation:create' as const],
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'release-pull-'))
  directories.push(root)
  const settings = hostSettingsSchema.parse({
    configRoot: join(root, 'config'),
    dataRoot: root,
    manageSystemd: false,
  })
  const path = hostControlPath(settings)
  initializeControlState(path, 'test')
  initializeHostReleaseState(path)
  vi.spyOn(provision, 'readHostEnvironment').mockReturnValue({
    DEPLOYMENT_REGISTRY_TOKEN: 'test-read-token',
  })
  return { settings, path }
}
function github(
  options: {
    head?: string
    published?: unknown[]
    run?: Record<string, unknown>
    files?: unknown[]
  } = {},
) {
  return vi.fn<typeof fetch>(async (input) => {
    const path = String(input)
    if (path.endsWith('git/ref/heads/main'))
      return Response.json({ object: { type: 'commit', sha: options.head ?? publication.gitSha } })
    if (path.includes('/deployments?')) return Response.json(options.published ?? [deployment])
    if (path.includes('/compare/'))
      return Response.json({
        status: 'ahead',
        total_commits: 1,
        files: options.files ?? [{ filename: 'docs/test.md' }],
      })
    if (path.endsWith('/actions/runs/123'))
      return Response.json({
        head_sha: publication.gitSha,
        head_branch: 'main',
        event: 'push',
        path: '.github/workflows/release.yml',
        status: 'completed',
        conclusion: 'success',
        ...options.run,
      })
    throw new Error('Unexpected fixture request')
  })
}
describe('audited server publication pull', () => {
  it('defaults disabled and waits for an operator configuration operation', async () => {
    const { settings, path } = fixture()
    const request = github()
    await pollPublishedRelease(settings, request)
    expect(request).not.toHaveBeenCalled()
    createInfrastructureOperation(
      path,
      {
        operationType: 'server-migration',
        reason: 'Enable verified releases',
        target: {
          action: 'configure-release-pull',
          enabled: true,
          confirmation: 'RELEASE-PULL-PRODUCTION',
        },
      },
      actor,
      'enable-pull',
    )
    acquireHostExecutor(path, 'host:test')
    expect(await configureReleasePull(settings, 'host:test')).toBe(true)
    expect(readReleasePull(path).enabled).toBe(true)
    expect(listInfrastructureOperations(path)[0]).toMatchObject({
      status: 'completed',
      phase: 'release-pull-configured',
    })
  })
  it('creates one fenced-engine deployment and keeps the same operation on repeated polling', async () => {
    const { settings, path } = fixture()
    setReleasePullEnabled(path, true)
    await pollPublishedRelease(settings, github())
    expect(listInfrastructureOperations(path)).toHaveLength(1)
    const operation = listInfrastructureOperations(path)[0]
    expect(operation).toMatchObject({
      operationType: 'deploy',
      actorId: 'service:release-pull',
      target: { gitSha: publication.gitSha, imageDigest: publication.imageDigest },
    })
    const claimed = claimNextInfrastructureOperation(path, 'host:test', 300)
    if (!claimed) throw new Error('Missing deploy operation')
    const lease = { leaseOwner: 'host:test', fencingToken: claimed.fencingToken }
    startInfrastructureOperation(path, claimed.id, lease)
    finishInfrastructureOperation(path, claimed.id, lease, {
      status: 'failed',
      phase: 'fixture-rejection',
      errorSummary: 'Fixture',
    })
    await pollPublishedRelease(settings, github(), new Date(Date.now() + 120000))
    expect(listInfrastructureOperations(path)).toHaveLength(1)
    expect(readReleasePull(path).status.operationId).toBe(claimed.id)
    expect(readReleasePull(path).status.phase).toBe('failed')
  })
  it.each([
    { run: { conclusion: 'failure' } },
    { run: { status: 'in_progress', conclusion: null } },
    { run: { head_branch: 'other' } },
    { run: { event: 'pull_request' } },
    { run: { path: '.github/workflows/other.yml' } },
    { published: [{ ...deployment, creator: { login: 'untrusted' } }] },
    { published: [{ ...deployment, sha: 'e'.repeat(40) }] },
    { published: [{ ...deployment, payload: { ...publication, automatic: false } }] },
  ])('rejects an unverified publication %#', async (options) => {
    const { settings, path } = fixture()
    setReleasePullEnabled(path, true)
    await pollPublishedRelease(settings, github(options))
    expect(listInfrastructureOperations(path)).toHaveLength(0)
  })
  it('accepts an intervening documentation commit and rejects runtime changes or renames', async () => {
    const { settings, path } = fixture()
    setReleasePullEnabled(path, true)
    const head = 'e'.repeat(40)
    for (const files of [
      [{ filename: 'src/runtime.ts' }],
      [{ filename: 'docs/moved.md', previous_filename: 'src/runtime.ts' }],
    ]) {
      await pollPublishedRelease(settings, github({ head, files }), new Date(Date.now() + 120000))
      expect(listInfrastructureOperations(path)).toHaveLength(0)
      setReleasePullEnabled(path, true)
    }
    await pollPublishedRelease(settings, github({ head }))
    expect(listInfrastructureOperations(path)[0]?.target).toMatchObject({
      gitSha: publication.gitSha,
    })
  })
  it('defers to an existing recovery operation and records bounded read failures', async () => {
    const { settings, path } = fixture()
    setReleasePullEnabled(path, true)
    const request = vi.fn<typeof fetch>(async () => {
      throw new TypeError('Fixture unavailable')
    })
    await pollPublishedRelease(settings, request)
    expect(readReleasePull(path).status.phase).toBe('publication-unavailable')
    expect(listInfrastructureOperations(path)).toHaveLength(0)
    createInfrastructureOperation(
      path,
      {
        operationType: 'deploy',
        reason: 'Existing operation',
        target: { gitSha: publication.gitSha, imageDigest: publication.imageDigest },
      },
      actor,
      'existing',
    )
    request.mockClear()
    await pollPublishedRelease(settings, request, new Date(Date.now() + 120000))
    expect(request).not.toHaveBeenCalled()
  })
  it('resumes the same configuration after an expired lease and supervisor fencing', async () => {
    const { settings, path } = fixture()
    const operation = createInfrastructureOperation(
      path,
      {
        operationType: 'server-migration',
        reason: 'Durable configuration',
        target: {
          action: 'configure-release-pull',
          enabled: true,
          confirmation: 'RELEASE-PULL-PRODUCTION',
        },
      },
      actor,
      'durable-enable',
    )
    const before = new Date(Date.now() - 60000)
    acquireHostExecutor(path, 'old-host', before)
    const claimed = claimNextInfrastructureOperation(path, 'old-host', 3600, before)
    if (!claimed) throw new Error('Missing configuration')
    startInfrastructureOperation(
      path,
      claimed.id,
      { leaseOwner: 'old-host', fencingToken: claimed.fencingToken },
      before,
    )
    setReleasePullEnabled(path, true)
    expect(acquireHostExecutor(path, 'new-host')).toBe(true)
    reconcileInfrastructureOperations(path)
    requeueDeploymentOperationForReconciliation(path, operation.operation.id)
    expect(await configureReleasePull(settings, 'new-host')).toBe(true)
    expect(listInfrastructureOperations(path)).toHaveLength(1)
    expect(listInfrastructureOperations(path)[0]).toMatchObject({
      status: 'completed',
      fencingToken: 3,
    })
    expect(readReleasePull(path).enabled).toBe(true)
    expect(() =>
      setReleasePullEnabled(path, false, new Date(), {
        operationId: claimed.id,
        leaseOwner: 'old-host',
        fencingToken: claimed.fencingToken,
      }),
    ).toThrow(/stale/)
    expect(readReleasePull(path).enabled).toBe(true)
  })
  it('keeps an interrupted deployment pending while the supervisor reconciles its lease', () => {
    const { path } = fixture()
    createInfrastructureOperation(
      path,
      {
        operationType: 'deploy',
        reason: 'Interrupted release',
        target: { gitSha: publication.gitSha, imageDigest: publication.imageDigest },
      },
      actor,
      'interrupted-release',
    )
    const before = new Date(Date.now() - 10000)
    const claimed = claimNextInfrastructureOperation(path, 'old-host', 1, before)
    if (!claimed) throw new Error('Missing deployment')
    startInfrastructureOperation(
      path,
      claimed.id,
      { leaseOwner: 'old-host', fencingToken: claimed.fencingToken },
      before,
    )
    reconcileInfrastructureOperations(path)
    expect(publicReleaseStatus(path, publication.gitSha, publication.imageDigest).state).toBe(
      'pending',
    )
  })
  it('restricts enable and disable to an operator and validates explicit confirmation', () => {
    const { path } = fixture()
    expect(() =>
      createInfrastructureOperation(
        path,
        {
          operationType: 'server-migration',
          reason: 'Invalid actor',
          target: {
            action: 'configure-release-pull',
            enabled: true,
            confirmation: 'RELEASE-PULL-PRODUCTION',
          },
        },
        { ...actor, kind: 'github-actions' },
        'denied',
      ),
    ).toThrow(/operator/i)
    expect(
      parseReleasePullCommand([
        'enable',
        '--confirm',
        'RELEASE-PULL-PRODUCTION',
        '--reason',
        'Install release pull',
      ]).enabled,
    ).toBe(true)
    expect(() => parseReleasePullCommand(['enable', '--reason', 'Missing confirmation'])).toThrow()
  })
  it('projects a converged healthy exact release without exposing operation or host details', async () => {
    const { path, settings } = fixture()
    initializeDeploymentRuntime(path, {
      sha: publication.gitSha,
      digest: publication.imageDigest,
      slot: 'blue',
    })
    const release = {
      sha: publication.gitSha,
      webDigest: publication.imageDigest,
      serviceSha: publication.serviceSha,
      recoverySha: publication.recoverySha,
      serviceDigest: `sha256:${'1'.repeat(64)}`,
      recoveryDigest: `sha256:${'2'.repeat(64)}`,
    }
    stageHostGeneration(path, release)
    commitHostGeneration(path, release.sha)
    acquireHostExecutor(path, 'host:test')
    const created = createInfrastructureOperation(
      path,
      {
        operationType: 'deploy',
        reason: 'Private operator reason',
        target: { gitSha: release.sha, imageDigest: release.webDigest },
      },
      actor,
      'receipt',
    )
    const claim = claimNextInfrastructureOperation(path, 'host:test', 300)
    if (!claim) throw new Error('Missing receipt operation')
    const lease = { leaseOwner: 'host:test', fencingToken: claim.fencingToken }
    startInfrastructureOperation(path, claim.id, lease)
    expect(publicReleaseStatus(path).current).toBeNull()
    finishInfrastructureOperation(path, created.operation.id, lease, {
      status: 'completed',
      phase: 'deployment-verified',
      result: {
        hostRelease: { ...release, status: 'converged', executorSha: release.sha },
        secret: 'private fixture metadata',
      },
    })
    expect(publicReleaseStatus(path, release.sha, release.webDigest)).toEqual({
      state: 'completed',
      current: {
        gitSha: publication.gitSha,
        imageDigest: publication.imageDigest,
        serviceSha: publication.serviceSha,
        recoverySha: publication.recoverySha,
        manifestVersion: 2,
      },
    })
    expect(JSON.stringify(publicReleaseStatus(path))).not.toContain('private')
    setReleasePullEnabled(path, true)
    await pollPublishedRelease(settings, github({ head: 'e'.repeat(40) }))
    expect(readReleasePull(path).status).toMatchObject({
      phase: 'deployed',
      gitSha: publication.gitSha,
    })
    expect(listInfrastructureOperations(path)).toHaveLength(1)
  })
})

describe('GitHub publication delivery', () => {
  it('reuses a published record and preserves its successful status on client retry', async () => {
    const request = vi.fn<typeof fetch>(async (input, init) => {
      expect(init?.method).toBe('GET')
      return Response.json(
        String(input).includes('/statuses?') ? [{ state: 'success' }] : [deployment],
      )
    })
    expect(await publishRelease(publication, 'fixture-token', request)).toMatchObject({
      publicationId: 42,
    })
    expect(request).toHaveBeenCalledTimes(2)
  })
  it('creates pending status on a recovered publication with no status yet', async () => {
    const methods: string[] = []
    const request = vi.fn<typeof fetch>(async (input, init) => {
      methods.push(init?.method ?? '')
      if (init?.method === 'POST') return Response.json({ id: 1 })
      return Response.json(String(input).includes('/statuses?') ? [] : [deployment])
    })
    await publishRelease(publication, 'fixture-token', request)
    expect(methods).toEqual(['GET', 'GET', 'POST'])
  })
  it('retries transient reads and stops on permanent rejection or a write failure', async () => {
    const request = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('', { status: 502 }))
      .mockResolvedValueOnce(Response.json([]))
    await expect(
      githubReleaseRequest('deployments', 'fixture', undefined, request),
    ).resolves.toEqual([])
    expect(request).toHaveBeenCalledTimes(2)
    request.mockReset().mockResolvedValue(new Response('', { status: 403 }))
    await expect(
      githubReleaseRequest('deployments', 'fixture', undefined, request),
    ).rejects.toThrow(/403/)
    expect(request).toHaveBeenCalledTimes(1)
    request.mockReset().mockRejectedValue(new TypeError('Unknown write outcome'))
    await expect(githubReleaseRequest('deployments', 'fixture', {}, request)).rejects.toThrow()
    expect(request).toHaveBeenCalledTimes(1)
  })
})
