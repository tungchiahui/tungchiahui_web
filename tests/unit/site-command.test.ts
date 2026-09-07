import { describe, expect, it } from 'vitest'

import { createBackupRequestBody } from '../../tools/recovery/control-client'
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
    expect(parseSiteCommand(['status'])).toEqual({ kind: 'status' })
    expect(parseSiteCommand(['production', 'secrets', 'init'])).toEqual({
      kind: 'production-secrets-init',
    })
    expect(parseSiteCommand(['production', 'secrets', 'validate'])).toEqual({
      kind: 'production-secrets-validate',
    })
    expect(parseSiteCommand(['deploy'])).toEqual({
      kind: 'deployment-create',
      reason: 'manual operator deployment',
      wait: false,
    })
    expect(
      parseSiteCommand([
        'deploy',
        'a'.repeat(40),
        '--image-digest',
        `sha256:${'b'.repeat(64)}`,
        '--reason',
        'phase 14 test',
        '--wait',
      ]),
    ).toEqual({
      gitSha: 'a'.repeat(40),
      imageDigest: `sha256:${'b'.repeat(64)}`,
      kind: 'deployment-create',
      reason: 'phase 14 test',
      wait: true,
    })
    expect(parseSiteCommand(['content', 'sync', 'c'.repeat(40)])).toEqual({
      kind: 'content-sync',
      sourceCommit: 'c'.repeat(40),
    })
    expect(parseSiteCommand(['rollback'])).toEqual({
      kind: 'rollback-create',
      reason: 'manual operator rollback',
    })
    expect(parseSiteCommand(['provision', 'phase17-target'])).toEqual({
      action: 'provision-only',
      inventoryHost: 'phase17-target',
      kind: 'server-migration-create',
      reason: 'manual operator target provisioning',
    })
    expect(
      parseSiteCommand([
        'migrate-server',
        'phase17-target',
        '--reason',
        'disposable migration rehearsal',
      ]),
    ).toEqual({
      action: 'planned-migration',
      inventoryHost: 'phase17-target',
      kind: 'server-migration-create',
      reason: 'disposable migration rehearsal',
    })
    expect(
      parseSiteCommand([
        'backup',
        '--environment',
        'test',
        '--type',
        'diff',
        '--reason',
        'disposable drill',
      ]),
    ).toEqual({
      backupType: 'diff',
      environment: 'test',
      kind: 'backup-create',
      reason: 'disposable drill',
    })
    expect(parseSiteCommand(['backup', 'status'])).toEqual({ kind: 'backup-status' })
    expect(
      parseSiteCommand([
        'restore',
        '2026-08-25T12:00:00.000Z',
        '--environment',
        'production',
        '--confirm',
        'RESTORE-PRODUCTION',
        '--reason',
        'database incident',
        '--break-glass',
        '--inventory-host',
        'tungchiahui-production-origin',
      ]),
    ).toEqual({
      breakGlass: true,
      confirmation: 'RESTORE-PRODUCTION',
      environment: 'production',
      inventoryHost: 'tungchiahui-production-origin',
      kind: 'restore',
      reason: 'database incident',
      selector: { targetTime: '2026-08-25T12:00:00.000Z' },
    })
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
    expect(() => parseSiteCommand(['deploy', 'latest'])).toThrow()
    expect(() => parseSiteCommand(['check', 'extra'])).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['dev', 'reset'])).toThrow(SiteUsageError)
    expect(() =>
      parseSiteCommand(['dev', 'reset', '--environment', 'production', '--confirm', 'yes']),
    ).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['translate', 'pending', '--execute'])).toThrow()
    expect(() => parseSiteCommand(['translate', 'all', '--dry-run', '--force'])).toThrow()
    expect(() => parseSiteCommand(['storage', 'contract', 's3'])).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['migrate-server', '127.0.0.1'])).toThrow(SiteUsageError)
    expect(() => parseSiteCommand(['backup', '--environment', 'production'])).toThrow(
      SiteUsageError,
    )
    expect(() =>
      parseSiteCommand([
        'restore',
        'backup-001',
        '--environment',
        'production',
        '--confirm',
        'yes',
        '--reason',
        'incident',
      ]),
    ).toThrow(SiteUsageError)
    expect(() =>
      parseSiteCommand([
        'restore',
        'backup-001',
        '--environment',
        'test',
        '--confirm',
        'RESTORE-TEST',
        '--reason',
        'drill',
        '--break-glass',
      ]),
    ).toThrow(SiteUsageError)
    expect(() =>
      parseSiteCommand(['storage', 'contract', 's3', '--confirm', 'PRODUCTION']),
    ).toThrow(SiteUsageError)
  })

  it('pins the Node.js runtime', () => {
    expect(() => assertToolchain('24.19.0')).not.toThrow()
    expect(() => assertToolchain('22.23.1')).toThrow(SiteUsageError)
  })

  it('removes the internal command discriminator from backup API requests', () => {
    const command = parseSiteCommand([
      'backup',
      '--environment',
      'production',
      '--type',
      'full',
      '--reason',
      'phase 18 backup',
    ])

    expect(createBackupRequestBody(command)).toEqual({
      backupType: 'full',
      environment: 'production',
      reason: 'phase 18 backup',
    })
  })
})
