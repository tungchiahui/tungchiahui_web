import { describe, expect, it } from 'vitest'
import { describeHostReleaseFailure } from '../../src/host-release/coordinator'
import { describeHostActionFailure } from '../../src/host-release/provision'

describe('host release diagnostics', () => {
  it('reports Compose failures without emitting secrets from child output or args', () => {
    const message = describeHostActionFailure(
      'docker',
      ['compose', '--env-file', '/private/secret.env', 'up', '--wait', 'pgbouncer', 'openresty'],
      {
        status: 1,
        stdout: 'user-token=topsecret',
        stderr: 'pgbouncer is unhealthy; DATABASE_URL=postgresql://alice:secret@db',
      },
    )
    expect(message).toContain('docker compose up')
    expect(message).toContain('exit_code=1')
    expect(message).toContain('category=healthcheck-or-dependency')
    expect(message).toContain('services=pgbouncer,openresty')
    expect(message).not.toMatch(/topsecret|secret|postgresql|DATABASE_URL/u)
  })

  it('keeps arbitrary errors out of the audit message', () => {
    const message = describeHostActionFailure(
      'docker',
      ['compose', '--env-file', '/secrets/location', 'run', '--rm', 'database-migrate'],
      { status: 137, stdout: null, stderr: 'secret=password1234' },
    )
    expect(message).toContain('docker compose run')
    expect(message).toContain('exit_code=137')
    expect(message).toContain('category=unclassified')
    expect(message).toContain('services=database-migrate')
    expect(message).not.toMatch(/password1234|\/secrets\/location/u)
  })

  it('distinguishes host timeout from child health errors', () => {
    expect(
      describeHostActionFailure('docker', ['compose', 'up', 'control-api'], {
        status: null,
        stdout: null,
        stderr: 'unknown',
        timedOut: true,
      }),
    ).toContain('category=timeout')
  })

  it('redacts the execution and compensation errors', () => {
    expect(
      describeHostReleaseFailure(
        'compensating',
        new Error('connection postgresql://alice:secret@internal/db failed'),
      ),
    ).toEqual({
      failureStep: 'compensating',
      error_type: 'Error',
      message: 'connection [REDACTED] failed',
    })
  })
})
