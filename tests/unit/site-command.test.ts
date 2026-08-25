import { describe, expect, it } from 'vitest'

import { assertToolchain, parseSiteCommand, SiteUsageError } from '../../tools/site-command'

describe('site command boundary', () => {
  it('parses the Phase 2 command surface', () => {
    expect(parseSiteCommand(['check'])).toEqual({ kind: 'check' })
    expect(parseSiteCommand(['test'])).toEqual({ kind: 'test' })
    expect(parseSiteCommand(['dev'])).toEqual({ kind: 'dev-start' })
    expect(parseSiteCommand(['dev', 'stop'])).toEqual({ kind: 'dev-stop' })
    expect(
      parseSiteCommand(['dev', 'reset', '--environment', 'local', '--confirm', 'RESET-LOCAL-DATA']),
    ).toEqual({ kind: 'dev-reset' })
    expect(parseSiteCommand([])).toEqual({ kind: 'help' })
    expect(
      parseSiteCommand(['storage', 'contract', 's3', '--confirm', 'S3-NON-PRODUCTION']),
    ).toEqual({ kind: 'storage-contract-s3' })
    expect(parseSiteCommand(['translate', 'pending', '--dry-run'])).toEqual({
      action: 'create',
      kind: 'translate',
      request: { force: false, mode: 'dry-run', scope: 'pending' },
    })
    expect(
      parseSiteCommand([
        'translate',
        'article',
        'content/posts/example.md',
        '--execute',
        '--budget-usd',
        '0.50',
      ]),
    ).toEqual({
      action: 'create',
      kind: 'translate',
      request: {
        articleSourcePath: 'content/posts/example.md',
        budgetUsd: 0.5,
        executionConfirmation: 'EXECUTE_PAID_TRANSLATION',
        force: false,
        mode: 'execute',
        scope: 'article',
      },
    })
  })

  it('rejects unknown or ambiguous commands', () => {
    expect(() => parseSiteCommand(['deploy'])).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['check', 'extra'])).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['dev', 'reset'])).toThrow(SiteUsageError)
    expect(() =>
      parseSiteCommand(['dev', 'reset', '--environment', 'production', '--confirm', 'yes']),
    ).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['translate', 'pending', '--execute'])).toThrow()
    expect(() => parseSiteCommand(['translate', 'all', '--dry-run', '--force'])).toThrow()
    expect(() => parseSiteCommand(['storage', 'contract', 's3'])).toThrow(SiteUsageError)
    expect(() =>
      parseSiteCommand(['storage', 'contract', 's3', '--confirm', 'PRODUCTION']),
    ).toThrow(SiteUsageError)
  })

  it('pins the Node.js runtime', () => {
    expect(() => assertToolchain('24.19.0')).not.toThrow()
    expect(() => assertToolchain('22.23.1')).toThrow(SiteUsageError)
  })
})
