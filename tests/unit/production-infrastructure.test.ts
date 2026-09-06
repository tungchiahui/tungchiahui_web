import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'
import { parse } from 'yaml'
import { z } from 'zod'

import { parseControlApiConfiguration } from '../../src/control-plane/configuration'

const composeSource = readFileSync(resolve('ops/production/compose.yaml'), 'utf8')
const openRestySource = readFileSync(resolve('ops/production/openresty.conf'), 'utf8')
const inventorySource = readFileSync(
  resolve('ops/production/ansible/inventory/production.yml'),
  'utf8',
)
const productionRoleSource = readFileSync(
  resolve('ops/production/ansible/roles/tungchiahui_production/tasks/main.yml'),
  'utf8',
)
const composeSchema = z.object({
  networks: z.record(z.string(), z.unknown()),
  services: z.record(
    z.string(),
    z.object({
      cap_drop: z.array(z.string()).optional(),
      depends_on: z.unknown().optional(),
      image: z.string(),
      networks: z.array(z.string()).optional(),
      read_only: z.boolean().optional(),
      security_opt: z.array(z.string()).optional(),
      tmpfs: z.array(z.string()).optional(),
      user: z.string().optional(),
      volumes: z.array(z.unknown()).optional(),
    }),
  ),
})

const compose = composeSchema.parse(parse(composeSource, { merge: true }) as unknown)

describe('Phase 12 production foundation policy', () => {
  it('uses immutable images and multi-stage non-root application images', () => {
    expect(composeSource).not.toMatch(/image:\s+\S+:latest(?:\s|$)/)
    expect(compose.services.postgres?.image).toContain('TUNGCHIAHUI_POSTGRES_IMAGE')
    expect(compose.services.pgbouncer?.image).toContain('@sha256:')
    expect(compose.services.openresty?.image).toContain('@sha256:')

    for (const dockerfile of ['web.Dockerfile', 'services.Dockerfile']) {
      const source = readFileSync(resolve('ops/production/images', dockerfile), 'utf8')
      const fromLines = source.match(/^FROM .*$/gm) ?? []
      expect(fromLines.length).toBeGreaterThanOrEqual(2)
      const externalFromLines = fromLines.filter(
        (line) => !/^FROM (?:build|dependencies)\b/.test(line),
      )
      expect(externalFromLines.every((line) => line.includes('@sha256:'))).toBe(true)
      expect(source).toContain('USER ')
      expect(source).not.toContain('latest')
      expect(source).not.toMatch(/(?:SECRET|PASSWORD|TOKEN)=/)
    }
  })

  it('hardens practical services and isolates Docker capability to deploy-agent', () => {
    const hardenedServices = [
      'control-api',
      'content-worker',
      'database-role-bootstrap',
      'database-migrate',
      'postgres',
      'pgbouncer',
      'web-blue',
      'web-green',
      'deploy-agent',
      'openresty',
      'observability-agent',
    ]
    for (const name of hardenedServices) {
      const service = compose.services[name]
      expect(service?.read_only, name).toBe(true)
      expect(service?.cap_drop, name).toContain('ALL')
      expect(service?.security_opt, name).toContain('no-new-privileges:true')
    }

    const servicesWithDockerSocket = Object.entries(compose.services)
      .filter(([, service]) =>
        JSON.stringify(service.volumes ?? []).includes('/var/run/docker.sock'),
      )
      .map(([name]) => name)
    expect(servicesWithDockerSocket).toEqual(['deploy-agent'])
    expect(composeSource).not.toMatch(/\bprivileged:\s*true\b/)
    expect(composeSource).not.toMatch(/\b(?:ipc|pid|network)_mode:\s*host\b/)
    expect(compose.services['deploy-agent']?.networks).toEqual([
      'backup-egress',
      'deploy-control',
      'deployment-probe',
    ])
    expect(compose.services['control-api']?.depends_on).toBeUndefined()
    expect(compose.services.openresty?.depends_on).toEqual({
      'control-api': { condition: 'service_healthy' },
    })
    expect(compose.services['control-api']?.networks).not.toContain('deploy-control')
    expect(compose.services['content-worker']?.networks).not.toContain('deploy-control')
    expect(JSON.stringify(compose.services['database-role-bootstrap']?.volumes)).toContain(
      '/run/secrets/pgbouncer-userlist.txt:ro',
    )
    expect(compose.services['observability-agent']?.networks).toEqual([
      'application',
      'deployment-probe',
      'edge',
    ])
    for (const name of ['web-blue', 'web-green']) {
      expect(compose.services[name]?.tmpfs).toContain(
        '/app/.next/cache:size=64m,mode=0755,uid=10001,gid=10001,nosuid,nodev',
      )
    }
  })

  it('routes by service DNS behind a loopback-only shared-host ingress', () => {
    expect(openRestySource).toContain('listen 8082;')
    expect(openRestySource).toContain('listen [::]:8082;')
    expect(openRestySource).not.toContain('ssl_certificate')
    expect(composeSource).toMatch(/host_ip: "\$\{TUNGCHIAHUI_ORIGIN_BIND_ADDRESS:-127\.0\.0\.1\}"/)
    expect(composeSource).toMatch(/published: "\$\{TUNGCHIAHUI_ORIGIN_PORT:-3100\}"/)
    expect(openRestySource).toContain('server_name www.tungchiahui.cn ddns.tungchiahui.cn;')
    expect(openRestySource).toContain('location ^~ /api/ops/')
    expect(openRestySource).toContain('set $control_upstream control-api:8080;')
    expect(openRestySource).toContain('include /etc/tungchiahui/deployment/active-slot.conf;')
    expect(openRestySource).toContain('add_header Cache-Control "no-store" always;')
    expect(openRestySource).toContain('log_format structured escape=json')
    expect(openRestySource).toContain('limit_req zone=public_origin')
    expect(openRestySource).toContain('limit_req zone=control_origin')
    expect(openRestySource).toContain('Strict-Transport-Security')
    expect(openRestySource).toContain('Content-Security-Policy')
    expect(openRestySource).toContain('location ^~ /api/internal/')
    expect(inventorySource).toContain('ansible_host: Debian')
    expect(inventorySource).toContain('ansible_user: tungchiahui')
    expect(inventorySource).not.toMatch(/ansible_host:\s*(?:\d{1,3}\.){3}\d{1,3}/)
    expect(composeSource).not.toContain('S3_CONTRACT_')
    expect(composeSource).toContain(
      'DEPLOYMENT_ARTICLE_PATH: ${TUNGCHIAHUI_DEPLOYMENT_ARTICLE_PATH:',
    )
    expect(composeSource).toContain('DEPLOYMENT_ASSET_PATH: ${TUNGCHIAHUI_DEPLOYMENT_ASSET_PATH:')
    expect(composeSource).toContain(
      'DEPLOYMENT_SEARCH_QUERY: ${TUNGCHIAHUI_DEPLOYMENT_SEARCH_QUERY:',
    )
    expect(productionRoleSource).toContain('TUNGCHIAHUI_DEPLOYMENT_ARTICLE_PATH')
    expect(productionRoleSource).toContain('TUNGCHIAHUI_DEPLOYMENT_ASSET_PATH')
    expect(productionRoleSource).toContain('TUNGCHIAHUI_DEPLOYMENT_SEARCH_QUERY')
    expect(productionRoleSource).toContain('replica: offsite-backup-s3')
    expect(productionRoleSource).not.toContain('primary-s3-and-r2')
    expect(productionRoleSource).toContain('schema: 2')
  })

  it('requires externally supplied production authentication policy', () => {
    const baseline = {
      CONTROL_API_HOST: '0.0.0.0',
      CONTROL_API_PORT: '8080',
      CONTROL_STATE_PATH: '/control-state/control.db',
      SITE_RUNTIME_MODE: 'production',
    }
    expect(() => parseControlApiConfiguration(baseline)).toThrow('Production control-api requires')
    expect(() =>
      parseControlApiConfiguration({
        ...baseline,
        CONTROL_GITHUB_OIDC_POLICY_JSON: '{}',
        CONTROL_OPERATOR_KEYS_JSON: '[]',
      }),
    ).toThrow()
  })
})
