import { describe, expect, it } from 'vitest'

import {
  productionEnvironmentFromProcess,
  replaceEnvironment,
} from '../../src/deployment/docker-platform'

describe('Docker deployment platform environment handling', () => {
  it('propagates only production env keys from deploy-agent process env', () => {
    expect(
      productionEnvironmentFromProcess({
        DEPLOYMENT_OPENRESTY_CONTAINER_NAME: 'openresty',
        DOCKER_SOCKET_PATH: '/run/deploy-capability/docker.sock',
        NODE_ENV: 'production',
        WEB_DATABASE_URL: 'postgresql://site_app_login:new@pgbouncer:6432/tungchiahui',
      }),
    ).toEqual({
      WEB_DATABASE_URL: 'postgresql://site_app_login:new@pgbouncer:6432/tungchiahui',
    })
  })

  it('refreshes web slot environment from the production env file overlay', () => {
    const result = replaceEnvironment(
      [
        'DATABASE_URL=postgresql://old-role:old@pgbouncer:6432/tungchiahui',
        'SITE_BASE_URL=https://old.example.test',
        'SITE_DEPLOYMENT_IMAGE_DIGEST=sha256:old',
        `SITE_DEPLOYMENT_SHA=${'0'.repeat(40)}`,
        'SITE_SLOT=blue',
      ],
      {
        digest: `sha256:${'a'.repeat(64)}`,
        sha: 'b'.repeat(40),
        slot: 'green',
      },
      {
        SITE_BASE_URL: 'https://www.tungchiahui.cn',
        WEB_DATABASE_URL: 'postgresql://site_app_login:new@pgbouncer:6432/tungchiahui',
      },
    )
    const environment = new Map(
      result.map((entry) => {
        const separator = entry.indexOf('=')
        return [entry.slice(0, separator), entry.slice(separator + 1)] as const
      }),
    )

    expect(environment.get('DATABASE_URL')).toBe(
      'postgresql://site_app_login:new@pgbouncer:6432/tungchiahui',
    )
    expect(environment.get('WEB_DATABASE_URL')).toBe(
      'postgresql://site_app_login:new@pgbouncer:6432/tungchiahui',
    )
    expect(environment.get('SITE_BASE_URL')).toBe('https://www.tungchiahui.cn')
    expect(environment.get('SITE_DEPLOYMENT_IMAGE_DIGEST')).toBe(`sha256:${'a'.repeat(64)}`)
    expect(environment.get('SITE_DEPLOYMENT_SHA')).toBe('b'.repeat(40))
    expect(environment.get('SITE_SLOT')).toBe('green')
  })
})
