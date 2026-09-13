import { describe, expect, it } from 'vitest'

import {
  deploymentImageRepositoryFromEnvironment,
  resolveDeploymentImageDigest,
} from '../../tools/deployment/control-client'

describe('deployment control client', () => {
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
