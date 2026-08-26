import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { assertLocalDockerEndpoint } from '../../tools/dev/compose'

const compose = readFileSync(resolve('ops/dev/compose.yaml'), 'utf8')
const devOverride = readFileSync(resolve('ops/dev/compose.dev.yaml'), 'utf8')

describe('Phase 2 Compose policy', () => {
  it('pins every external image by stable version and digest', () => {
    expect(compose).toContain(
      'groonga/pgroonga:4.0.8-alpine-18@sha256:b5c92fa3d86ad76ce75ddd8095f60542cf025348a58b8a38cd0b4a580fe4ce68',
    )
    expect(compose).toContain(
      'percona/percona-pgbouncer:1.25.2-5@sha256:ee8f9b3e8b80b379b47ae41419a0d16de7a20c2be0cae5dbf55fe403d3d9f33d',
    )
    expect(compose).toContain(
      'adobe/s3mock:5.1.0@sha256:65cf60155a2e235fe7d5bf6c633747d6fc7ed93f9f5a6727d86470026b83c2a2',
    )
    expect(compose).toContain(
      'openresty/openresty:1.31.1.1-2-alpine-fat@sha256:427d94fea0c24b099e7891e8d1b7976f6d008e2d427e56bab725c8b8b293795b',
    )
    expect(compose).not.toMatch(/image:\s+\S+:latest(?:\s|$)/)
  })

  it('contains no production target or Docker socket mount', () => {
    expect(compose).not.toContain('/var/run/docker.sock')
    expect(compose).not.toContain('ddns.tungchiahui.cn')
    expect(compose).not.toContain('www.tungchiahui.cn')
    expect(compose).toContain('@pgbouncer:6432')
    expect(compose).toContain('http://s3mock:9090')
  })

  it('publishes development endpoints only on loopback', () => {
    const publishedPorts = devOverride
      .split('\n')
      .filter((line) => line.trimStart().startsWith('- "'))

    expect(publishedPorts).toHaveLength(7)
    expect(publishedPorts.every((line) => line.includes('127.0.0.1:'))).toBe(true)
  })

  it('rejects remote Docker contexts', () => {
    expect(() => assertLocalDockerEndpoint('unix:///var/run/docker.sock')).not.toThrow()
    expect(() => assertLocalDockerEndpoint('npipe:////./pipe/docker_engine')).not.toThrow()
    expect(() => assertLocalDockerEndpoint('ssh://production-host')).toThrow('remote Docker')
    expect(() => assertLocalDockerEndpoint('tcp://192.0.2.10:2376')).toThrow('remote Docker')
  })
})
