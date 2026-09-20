import { mkdtempSync, rmSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import type { DeploymentConfiguration } from '../../src/deployment/configuration'
import {
  DockerDeploymentPlatform,
  replaceEnvironment,
  webEnvironmentFromProcess,
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
  it.each([
    { revision: null },
    { revision: '' },
    { revision: 'b'.repeat(40) },
    { revision: 'a'.repeat(40) },
    { revision: 'a'.repeat(40), registry: true },
    { revision: 'a'.repeat(40), registry: true, cached: true },
    { revision: 'a'.repeat(40), registry: true, cached: true, changedWebDigest: true },
    { revision: 'b'.repeat(40), registry: true },
    { revision: 'a'.repeat(40), registry: true, pullError: 'http' },
    { revision: 'a'.repeat(40), registry: true, pullError: 'stream' },
    { revision: 'a'.repeat(40), registry: true, pullError: 'single' },
    { revision: 'a'.repeat(40), registry: true, pullError: 'malformed' },
    { revision: 'a'.repeat(40), registry: true, missingDigest: true },
    { revision: 'a'.repeat(40), registry: true, missingServiceLabel: true },
    { revision: 'a'.repeat(40), registry: true, invalidWebDigest: true },
    { revision: 'a'.repeat(40), registry: true, running: true },
  ] as const)(
    'validates migration image before replacing the runner: %j',
    async (scenario: {
      revision: string | null
      registry?: boolean
      cached?: boolean
      changedWebDigest?: boolean
      pullError?: string
      missingDigest?: boolean
      missingServiceLabel?: boolean
      invalidWebDigest?: boolean
      running?: boolean
    }) => {
      const { revision } = scenario
      const directory = mkdtempSync(join(tmpdir(), 'migration-docker-'))
      const socketPath = join(directory, 'docker.sock')
      const imageId = `sha256:${'c'.repeat(64)}`
      const targetSha = 'a'.repeat(40)
      const webDigest = `sha256:${'a'.repeat(64)}`
      const serviceDigest = `sha256:${'e'.repeat(64)}`
      const repository = 'registry.example.test/site'
      const reference = scenario.registry ? `${repository}-service@${serviceDigest}` : imageId
      const webReference = `${repository}@${webDigest}`
      const targetImageId = scenario.registry ? `sha256:${'d'.repeat(64)}` : imageId
      let pulled = scenario.cached === true
      let authentication: string | undefined
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
              State: { ExitCode: 0, Running: scenario.running === true },
            }),
          )
        } else if (path === `/images/${webReference}/json`) {
          response.end(
            JSON.stringify({
              Config: {
                Labels: scenario.missingServiceLabel
                  ? {}
                  : { 'cn.tungchiahui.release.service-digest': serviceDigest },
              },
              Id: `sha256:${'f'.repeat(64)}`,
              RepoDigests: scenario.invalidWebDigest ? [] : [webReference],
            }),
          )
        } else if (path === `/images/${reference}/json`) {
          if (scenario.registry && !pulled) {
            response.statusCode = 404
            response.end('{}')
            return
          }
          response.end(
            JSON.stringify({
              Config: {
                Labels:
                  revision === null ? null : { 'org.opencontainers.image.revision': revision },
              },
              Id: targetImageId,
              RepoDigests: scenario.missingDigest
                ? [`unapproved.test/service@sha256:${'d'.repeat(64)}`]
                : [`${repository}-service@${serviceDigest}`],
            }),
          )
        } else if (path === `/images/create?fromImage=${reference}`) {
          authentication = request.headers['x-registry-auth'] as string | undefined
          pulled = true
          if (scenario.pullError === 'http') {
            response.statusCode = 404
            response.end('{}')
          } else if (scenario.pullError === 'stream') {
            response.end(
              '{"status":"pulling"}\n{"errorDetail":{"message":"sensitive-registry-error"}}\n',
            )
          } else if (scenario.pullError === 'single') {
            response.end('{"error":"sensitive-registry-error"}')
          } else if (scenario.pullError === 'malformed') {
            response.end('invalid sensitive-registry-error')
          } else {
            response.end('{"status":"pulling"}\n{"status":"complete"}\n')
          }
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
        const platform = new DockerDeploymentPlatform(
          {
            ...migrationConfiguration,
            ...(scenario.registry
              ? {
                  DEPLOYMENT_IMAGE_REPOSITORY: repository,
                  DEPLOYMENT_REGISTRY_USERNAME: 'registry-user',
                  DEPLOYMENT_REGISTRY_TOKEN: 'test-registry-token',
                }
              : {}),
          },
          socketPath,
        )
        const target = { digest: webDigest, sha: targetSha, slot: 'green' as const }
        if (scenario.cached) await platform.validateMigrationImage(target)
        const migration = platform.runMigrations({
          hasFreshRecoverableBackup: true,
          target: scenario.changedWebDigest
            ? { ...target, digest: `sha256:${'9'.repeat(64)}` }
            : target,
        })
        if (
          revision !== targetSha ||
          scenario.pullError ||
          scenario.missingDigest ||
          scenario.missingServiceLabel ||
          scenario.invalidWebDigest ||
          scenario.changedWebDigest ||
          scenario.running
        ) {
          const error = await migration.catch((error: unknown) => error)
          expect(error).toBeInstanceOf(Error)
          expect(String(error)).toContain(
            scenario.running
              ? 'already running'
              : scenario.changedWebDigest
                ? 'release manifest'
                : scenario.pullError === 'http'
                  ? 'Docker rejected'
                  : scenario.pullError
                    ? 'image pull failed'
                    : scenario.missingDigest
                      ? 'approved service repository'
                      : scenario.missingServiceLabel
                        ? 'digest-bound service image'
                        : scenario.invalidWebDigest
                          ? 'approved release digest'
                          : 'does not match target',
          )
          expect(String(error)).not.toContain('sensitive-registry-error')
          expect(
            requests.some(
              (request) => request.startsWith('DELETE') || request.startsWith('POST /containers'),
            ),
          ).toBe(false)
        } else {
          await migration
          expect(JSON.parse(createdBody)).toMatchObject({
            Env: ['DEPLOYMENT_HAS_FRESH_RECOVERABLE_BACKUP=true'],
            HostConfig: { CapDrop: ['ALL'], ReadonlyRootfs: true },
            Image: targetImageId,
          })
          expect(requests).toContain('POST /containers/database-migrate/start')
          expect(
            requests.filter((request) => request === `GET /images/${reference}/json`),
          ).toHaveLength(scenario.registry && !scenario.cached ? 2 : 1)
          if (scenario.registry && !scenario.cached) {
            expect(requests).toContain(`POST /images/create?fromImage=${reference}`)
            expect(JSON.parse(Buffer.from(authentication ?? '', 'base64url').toString())).toEqual({
              password: 'test-registry-token',
              serveraddress: 'registry.example.test',
              username: 'registry-user',
            })
          }
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
      webEnvironmentFromProcess({
        BACKUP_AGE_IDENTITY_BASE64: 'must-not-reach-web',
        DATABASE_ADMIN_URL: 'postgresql://admin:secret@postgres:5432/site',
        DEPLOYMENT_REGISTRY_TOKEN: 'must-not-reach-web',
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
        'DATABASE_ADMIN_URL=postgresql://admin:old@postgres:5432/tungchiahui',
        'DEPLOYMENT_REGISTRY_TOKEN=old-registry-token',
        'OWNER_PASSWORD_HASH=old-owner-password-hash',
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
    expect(environment.has('WEB_DATABASE_URL')).toBe(false)
    expect(environment.get('SITE_BASE_URL')).toBe('https://www.tungchiahui.cn')
    expect(environment.get('SITE_DEPLOYMENT_IMAGE_DIGEST')).toBe(`sha256:${'a'.repeat(64)}`)
    expect(environment.get('SITE_DEPLOYMENT_SHA')).toBe('b'.repeat(40))
    expect(environment.get('SITE_SLOT')).toBe('green')
    expect(environment.get('SITE_RUNTIME_MODE')).toBe('production')
    expect(environment.has('DATABASE_ADMIN_URL')).toBe(false)
    expect(environment.has('DEPLOYMENT_REGISTRY_TOKEN')).toBe(false)
    expect(environment.has('OWNER_PASSWORD_HASH')).toBe(false)
  })
})
