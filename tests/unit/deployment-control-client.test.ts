import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  controlRequest,
  isTransientControlRequestFailure,
  publicRequest,
} from '../../tools/control/client'

import {
  createDeployment,
  deploymentAttemptIdentity,
  deploymentImageRepositoryFromEnvironment,
  resolveDeploymentImageDigest,
} from '../../tools/deployment/control-client'

vi.mock('../../tools/control/client', () => ({
  controlRequest: vi.fn(),
  publicRequest: vi.fn(),
  isTransientControlRequestFailure: vi.fn(),
}))
afterEach(() => {
  vi.unstubAllEnvs()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
  vi.useRealTimers()
})

const sha = 'b'.repeat(40)
const digest = `sha256:${'c'.repeat(64)}`
const activeStatus = {
  mode: 'production',
  controlState: { incompleteOperations: 0 },
  deployment: {
    activeSlot: 'green',
    currentSha: sha,
    currentDigest: digest,
    pendingSlot: 'none',
    previousSlot: 'blue',
    lastSha: 'a'.repeat(40),
    lastDigest: `sha256:${'a'.repeat(64)}`,
  },
  hostExecutor: { installed: true, healthy: true, currentSha: sha, pendingSha: null },
}
const receipt = {
  operation: {
    id: '11111111-1111-4111-8111-111111111111',
    status: 'completed',
    result: {
      hostRelease: {
        sha,
        webDigest: digest,
        serviceDigest: `sha256:${'d'.repeat(64)}`,
        recoveryDigest: `sha256:${'e'.repeat(64)}`,
        status: 'converged',
      },
    },
  },
}

function confirmationFixture() {
  vi.stubEnv('GITHUB_ACTIONS', 'true')
  vi.mocked(publicRequest).mockImplementation(async (path) => {
    if (path === '/api/version') return { gitSha: sha }
    if (path === '/api/health') return { status: 'ok' }
    return { status: 'ready', dependencies: { postgresql: 'ready' } }
  })
  vi.mocked(controlRequest).mockImplementation(async (path) =>
    path.startsWith('/api/ops/deployment-receipts/') ? receipt : activeStatus,
  )
}

describe('deployment control client', () => {
  it('resumes status reads after a control service outage without a second deployment POST', async () => {
    vi.useFakeTimers()
    vi.stubEnv('GITHUB_ACTIONS', 'true')
    vi.stubEnv('GITHUB_RUN_ID', '123')
    vi.stubEnv('GITHUB_RUN_ATTEMPT', '1')
    vi.mocked(isTransientControlRequestFailure).mockImplementation(
      (error) => error instanceof Error && error.message === 'recoverable-outage',
    )
    let reads = 0
    vi.mocked(controlRequest).mockImplementation(async (path) => {
      if (path === '/api/ops/status')
        return {
          ...activeStatus,
          deployment: {
            ...activeStatus.deployment,
            currentSha: 'a'.repeat(40),
            currentDigest: `sha256:${'a'.repeat(64)}`,
          },
        }
      if (path === '/api/ops/deployments')
        return { mode: 'production', operation: { id: receipt.operation.id, status: 'queued' } }
      if (++reads === 1) throw new Error('recoverable-outage')
      return receipt
    })
    const request = createDeployment({
      gitSha: sha,
      imageDigest: digest,
      reason: 'Control upgrade outage',
      wait: true,
    })
    await vi.runAllTimersAsync()
    await expect(request).resolves.toMatchObject({ operation: { status: 'completed' } })
    expect(reads).toBe(2)
    expect(
      vi.mocked(controlRequest).mock.calls.filter(([, options]) => options.method === 'POST'),
    ).toHaveLength(1)
  })

  it('still fails immediately on an authentication denial during deployment polling', async () => {
    vi.stubEnv('GITHUB_ACTIONS', '')
    vi.mocked(isTransientControlRequestFailure).mockReturnValue(false)
    vi.mocked(controlRequest).mockImplementation(async (path) => {
      if (path === '/api/ops/deployments')
        return { mode: 'production', operation: { id: receipt.operation.id, status: 'queued' } }
      throw new Error('Control API returned HTTP 401: github_oidc_policy_denied')
    })
    await expect(
      createDeployment({ gitSha: sha, imageDigest: digest, reason: 'Denied polling', wait: true }),
    ).rejects.toThrow('github_oidc_policy_denied')
    expect(vi.mocked(controlRequest).mock.calls).toHaveLength(2)
  })
  it('does not confirm an active release whose rollback slot is missing', async () => {
    confirmationFixture()
    vi.mocked(controlRequest).mockResolvedValue({
      ...activeStatus,
      deployment: {
        ...activeStatus.deployment,
        previousSlot: 'none',
        lastSha: null,
        lastDigest: null,
      },
    })
    await expect(
      createDeployment({
        gitSha: sha,
        imageDigest: digest,
        reason: 'Missing rollback slot',
        wait: true,
      }),
    ).rejects.toThrow('still converging')
    expect(
      vi.mocked(controlRequest).mock.calls.some(([, options]) => options.method === 'POST'),
    ).toBe(false)
  })
  it('confirms a previously completed full release without another deployment POST', async () => {
    confirmationFixture()
    const result = await createDeployment({
      gitSha: sha,
      imageDigest: digest,
      reason: 'Confirm lost CI response',
      wait: true,
    })
    expect(result.operation.id).toBe(receipt.operation.id)
    expect(vi.mocked(controlRequest).mock.calls.map(([path]) => path)).toEqual([
      '/api/ops/status',
      `/api/ops/deployment-receipts/${sha}/${digest.slice(7)}`,
      '/api/ops/status',
    ])
    expect(
      vi.mocked(controlRequest).mock.calls.some(([, options]) => options.method === 'POST'),
    ).toBe(false)
  })

  it('requires a complete receipt instead of trusting the active SHA alone', async () => {
    confirmationFixture()
    vi.mocked(controlRequest).mockImplementation(async (path) =>
      path.startsWith('/api/ops/deployment-receipts/') ? { operation: null } : activeStatus,
    )
    await expect(
      createDeployment({ gitSha: sha, imageDigest: digest, reason: 'Missing receipt', wait: true }),
    ).rejects.toThrow('no completed deployment receipt')
    expect(
      vi.mocked(controlRequest).mock.calls.some(([, options]) => options.method === 'POST'),
    ).toBe(false)
  })

  it('rejects a mismatched receipt digest and failed public readiness', async () => {
    confirmationFixture()
    vi.mocked(controlRequest).mockImplementation(async (path) =>
      path.startsWith('/api/ops/deployment-receipts/')
        ? {
            operation: {
              ...receipt.operation,
              result: {
                hostRelease: {
                  ...receipt.operation.result.hostRelease,
                  webDigest: `sha256:${'a'.repeat(64)}`,
                },
              },
            },
          }
        : activeStatus,
    )
    await expect(
      createDeployment({ gitSha: sha, imageDigest: digest, reason: 'Wrong digest', wait: true }),
    ).rejects.toThrow()
    confirmationFixture()
    vi.mocked(publicRequest).mockRejectedValue(new Error('public check failed'))
    await expect(
      createDeployment({ gitSha: sha, imageDigest: digest, reason: 'Not ready', wait: true }),
    ).rejects.toThrow('public check')
  })

  it('rejects a release that changes while its completion is being confirmed', async () => {
    confirmationFixture()
    let reads = 0
    vi.mocked(controlRequest).mockImplementation(async (path) => {
      if (path.startsWith('/api/ops/deployment-receipts/')) return receipt
      reads++
      return reads === 1
        ? activeStatus
        : { ...activeStatus, controlState: { incompleteOperations: 1 } }
    })
    await expect(
      createDeployment({
        gitSha: sha,
        imageDigest: digest,
        reason: 'Concurrent change',
        wait: true,
      }),
    ).rejects.toThrow('changed during')
  })
  it('deduplicates within a workflow attempt but allows a failed release to be retried', () => {
    const environment = {
      GITHUB_ACTIONS: 'true',
      GITHUB_RUN_ID: '34934142023',
      GITHUB_RUN_ATTEMPT: '1',
    }
    const original = deploymentAttemptIdentity(environment)
    expect(deploymentAttemptIdentity(environment)).toBe(original)
    expect(deploymentAttemptIdentity({ ...environment, GITHUB_RUN_ATTEMPT: '2' })).not.toBe(
      original,
    )
    expect(deploymentAttemptIdentity({ ...environment, GITHUB_RUN_ID: '34934142024' })).not.toBe(
      original,
    )
    expect(() => deploymentAttemptIdentity({ GITHUB_ACTIONS: 'true' })).toThrow()
  })

  it('gives explicit operator invocations separate attempts', () => {
    expect(deploymentAttemptIdentity({})).not.toBe(deploymentAttemptIdentity({}))
  })

  it('defaults the manual deployment image repository to GHCR', () => {
    expect(deploymentImageRepositoryFromEnvironment({ NODE_ENV: 'test' })).toBe(
      'ghcr.io/tungchiahui/tungchiahui_web',
    )
    expect(
      deploymentImageRepositoryFromEnvironment({
        NODE_ENV: 'test',
        SITE_DEPLOYMENT_IMAGE_REPOSITORY: 'ghcr.io/example/site',
      }),
    ).toBe('ghcr.io/example/site')
  })

  it('resolves a release digest from Docker manifest inspection output', () => {
    const digest = `sha256:${'a'.repeat(64)}`
    const resolved = resolveDeploymentImageDigest({
      gitSha: 'b'.repeat(40),
      repository: 'ghcr.io/example/site',
      runner(_executable, arguments_) {
        expect(arguments_).toEqual([
          'buildx',
          'imagetools',
          'inspect',
          `ghcr.io/example/site:${'b'.repeat(40)}`,
        ])
        return `Name: ghcr.io/example/site:${'b'.repeat(40)}\nDigest: ${digest}\n`
      },
    })

    expect(resolved).toBe(digest)
  })

  it('falls back to docker manifest inspect when buildx is unavailable', () => {
    const digest = `sha256:${'c'.repeat(64)}`
    let attempts = 0
    const resolved = resolveDeploymentImageDigest({
      gitSha: 'd'.repeat(40),
      repository: 'ghcr.io/example/site',
      runner(_executable, arguments_) {
        attempts += 1
        if (arguments_[0] === 'buildx') throw new Error('missing buildx')
        expect(arguments_).toEqual([
          'manifest',
          'inspect',
          '--verbose',
          `ghcr.io/example/site:${'d'.repeat(40)}`,
        ])
        return JSON.stringify({ Descriptor: { digest } })
      },
    })

    expect(attempts).toBe(2)
    expect(resolved).toBe(digest)
  })
})
