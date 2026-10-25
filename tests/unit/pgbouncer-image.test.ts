import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import {
  bindPgBouncerImage,
  pgbouncerImagePlaceholder,
} from '../../src/host-release/pgbouncer-image'

describe('PgBouncer release topology binding', () => {
  const source = readFileSync('ops/production/compose.yaml', 'utf8')
  const reference = `ghcr.io/example/web-pgbouncer@sha256:${'a'.repeat(64)}`

  it('binds one immutable image before the recovery artifact is signed by digest', () => {
    const bound = bindPgBouncerImage(source, reference)
    expect(bound).toContain(`image: ${reference}`)
    expect(bound).not.toContain(pgbouncerImagePlaceholder)
    expect(bound.replace(reference, pgbouncerImagePlaceholder)).toBe(source)
  })

  it('rejects mutable references and unexpected topology instead of leaving a fallback', () => {
    for (const image of [
      'percona/pgbouncer:latest',
      'image:1.25.2',
      `${reference}\nprivileged: true`,
    ])
      expect(() => bindPgBouncerImage(source, image)).toThrow()
    expect(() => bindPgBouncerImage('services: {}', reference)).toThrow()
    expect(() => bindPgBouncerImage(source + pgbouncerImagePlaceholder, reference)).toThrow()
  })
})
