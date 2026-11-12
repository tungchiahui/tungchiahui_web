import { describe, expect, it } from 'vitest'
import { parseReleaseJobFailure } from '../../src/host-release/coordinator'

describe('release-job log diagnostics', () => {
  it('only accepts a structured failure and redacts sensitive data', () => {
    const logs = [
      'raw output: postgresql://user:password@host/db',
      JSON.stringify({
        event: 'release_job_failed',
        error_type: 'Error',
        message: 'Failed: postgresql://user:password@host/db',
      }),
    ].join('\n')
    expect(parseReleaseJobFailure(logs)).toEqual({
      error_type: 'Error',
      message: 'Failed: [REDACTED]',
    })
  })

  it('rejects unstructured or unexpected output', () => {
    expect(parseReleaseJobFailure('password=secret')).toBeNull()
    expect(
      parseReleaseJobFailure(JSON.stringify({ event: 'release_job_diagnostic_audit_failed' })),
    ).toBeNull()
    expect(
      parseReleaseJobFailure(
        JSON.stringify({
          event: 'release_job_failed',
          error_type: 'Error',
          message: 'failure',
          unexpected: 'secret',
        }),
      ),
    ).toBeNull()
  })
})
