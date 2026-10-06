import { describe, expect, it } from 'vitest'
import { validateCompleteRelease } from '../../tools/deployment/control-client'

const sha = 'a'.repeat(40)
const digest = `sha256:${'b'.repeat(64)}`
const operation = {
  result: {
    hostRelease: {
      sha,
      webDigest: digest,
      serviceDigest: `sha256:${'c'.repeat(64)}`,
      recoveryDigest: `sha256:${'d'.repeat(64)}`,
      status: 'converged',
    },
  },
}
describe('complete production release evidence', () => {
  it('rejects an old Web-only completion and an unrelated SHA or digest', () => {
    expect(() => validateCompleteRelease({ status: 'completed' }, sha, digest)).toThrow()
    expect(() => validateCompleteRelease(operation, 'e'.repeat(40), digest)).toThrow()
    expect(() => validateCompleteRelease(operation, sha, `sha256:${'f'.repeat(64)}`)).toThrow()
    expect(() =>
      validateCompleteRelease(
        {
          ...operation,
          result: { hostRelease: { ...operation.result.hostRelease, status: 'pending' } },
        },
        sha,
        digest,
      ),
    ).toThrow()
    expect(() => validateCompleteRelease(operation, sha, digest)).not.toThrow()
  })
  it('preserves explicitly isolated local/test fake deployment support', () => {
    expect(() =>
      validateCompleteRelease({ status: 'completed' }, sha, digest, 'local'),
    ).not.toThrow()
    expect(() =>
      validateCompleteRelease({ status: 'completed' }, sha, digest, 'test'),
    ).not.toThrow()
  })
})
