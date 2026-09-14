import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { DeploymentConfiguration } from '../../src/deployment/configuration'
import {
  DockerDeploymentPlatform,
  productionEnvironmentFromProcess,
  replaceEnvironment,
} from '../../src/deployment/docker-platform'

const migrationConfiguration: DeploymentConfiguration = {
  DEPLOYMENT_ACTIVE_SLOT_CONFIG_PATH: '/deployment-config/active-slot.conf',
  DEPLOYMENT_ARTICLE_PATH: '/blog/test',
  DEPLOYMENT_ASSET_PATH: '/api/assets/test.svg',
  DEPLOYMENT_BACKUP_MAX_AGE_SECONDS: 3600,
  DEPLOYMENT_BLUE_CONTAINER_NAME: 'web-blue',
  DEPLOYMENT_BLUE_URL: 'http://web-blue:3000',
  DEPLOYMENT_GREEN_CONTAINER_NAME: 'web-green',
  DEPLOYMENT_GREEN_URL: 'http://web-green:3000',
  DEPLOYMENT_JOURNAL_PATH: '/app/deployment/drizzle/meta/_journal.json',
  DEPLOYMENT_MIGRATION_CONTAINER_NAME: 'database-migrate',
  DEPLOYMENT_MIGRATION_POLICY_PATH: '/app/deployment/drizzle/migration-policy.json',
  DEPLOYMENT_OPENRESTY_CONTAINER_NAME: 'openresty',
  DEPLOYMENT_POLLING_ENABLED: 'true',
  DEPLOYMENT_PUBLIC_ENTRY_URL: 'http://openresty:8082',
  DEPLOYMENT_SEARCH_QUERY: 'test',
}

describe('Docker migration image identity', () => {
  it.each([null, '', 'b'.repeat(40), 'a'.repeat(40)])(
    'checks the actual image revision %s before replacing the runner',
    async (revision) => {
      const directory = mkdtempSync(join(tmpdir(), 'migration-docker-'))
      const socketPath = join(directory, 'docker.sock')
      const imageId = `sha256:${'c'.repeat(64)}`
      const targetSha = 'a'.repeat(40)
      const requests: string[] = []
      let createdBody = ''
      const server = createServer(async (request, response) => {
        const path = decodeURIComponent(request.url ?? '')
        requests.push(`${request.method} ${path}`)
        response.setHeader('Content-Type', 'application/json')
        if (path === '/containers/database-migrate/json') {
          response.end(
            JSON.stringify({
              Config: {
                Cmd: ['node', 'dist/database-migrate.cjs'],
                Entrypoint: null,
                Env: ['DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP=false'],
                Image: 'service:mutable-tag',
                Labels: { 'org.opencontainers.image.revision': targetSha },
                User: '10001:10050',
                WorkingDir: '/app',
              },
              HostConfig: {
                Binds: null,
                CapDrop: ['ALL'],
                NetworkMode: 'database',
                ReadonlyRootfs: true,
                RestartPolicy: { MaximumRetryCount: 0, Name: 'no' },
                SecurityOpt: ['no-new-privileges:true'],
                Tmpfs: null,
              },
              Image: imageId,
              Name: '/database-migrate',
              NetworkSettings: { Networks: { database: { Aliases: ['database-migrate'] } } },
              State: { ExitCode: 0, Running: false },
            }),
          )
        } else if (path === `/images/${imageId}/json`) {
          response.end(
            JSON.stringify({
              Config: {
                Labels:
                  revision === null ? null : { 'org.opencontainers.image.revision': revision },
              },
              Id: imageId,
            }),
          )
        } else if (path === '/containers/create?name=database-migrate') {
          for await (const chunk of request) createdBody += String(chunk)
          response.statusCode = 201
          response.end('{}')
        } else if (request.method === 'DELETE' || path === '/containers/database-migrate/start') {
          response.statusCode = 204
          response.end()
        } else {
          response.statusCode = 404
          response.end('{}')
        }
      })
      await new Promise<void>((resolve, reject) => {
        server.once('error', reject)
        server.listen(socketPath, resolve)
      })
      try {
        const platform = new DockerDeploymentPlatform(migrationConfiguration, socketPath)
        const migration = platform.runMigrations({ hasFreshRecoverableBackup: true, targetSha })
        if (revision !== targetSha) {
          await expect(migration).rejects.toThrow('does not match target')
          expect(requests).toEqual([
            'GET /containers/database-migrate/json',
            `GET /images/${imageId}/json`,
          ])
        } else {
          await migration
          expect(JSON.parse(createdBody)).toMatchObject({
            Env: ['DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP=true'],
            HostConfig: { CapDrop: ['ALL'], ReadonlyRootfs: true },
            Image: imageId,
          })
          expect(requests).toContain('POST /containers/database-migrate/start')
        }
      } finally {
        await new Promise<void>((resolve, reject) =>
          server.close((error) => (error ? reject(error) : resolve())),
        )
        rmSync(directory, { recursive: true, force: true })
      }
    },
  )
})

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
