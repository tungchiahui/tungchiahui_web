import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { resolve } from 'node:path'

import { describe, expect, it } from 'vitest'

import { validateMigrationPolicy } from '../../src/database/migration-policy'

describe('migration policy', () => {
  it('limits control-service reconciliation to its reviewed additive schema', () => {
    const policy = validateMigrationPolicy(
      'drizzle/migration-policy.json',
      'drizzle/meta/_journal.json',
      {
        allowContract: false,
        hasFreshRecoverableBackup: false,
        throughMigration: '0008_accounts_and_start_data',
      },
    )
    expect(policy.migrations.at(-1)?.tag).toBe('0008_accounts_and_start_data')
    expect(policy.migrations).toHaveLength(9)
    expect(() =>
      validateMigrationPolicy('drizzle/migration-policy.json', 'drizzle/meta/_journal.json', {
        allowContract: false,
        hasFreshRecoverableBackup: false,
        throughMigration: 'unknown',
      }),
    ).toThrow('unknown migration')
  })
  it('blocks V3 backfill while the previous application cannot read V3', () => {
    expect(() =>
      validateMigrationPolicy('drizzle/migration-policy.json', 'drizzle/meta/_journal.json', {
        allowContract: false,
        hasFreshRecoverableBackup: true,
      }),
    ).toThrow('V3-compatible')
  })
  it('covers every checked-in migration through Phase 18 and permits the expand set', () => {
    const policy = validateMigrationPolicy(
      'drizzle/migration-policy.json',
      'drizzle/meta/_journal.json',
      {
        allowContract: false,
        hasFreshRecoverableBackup: true,
        hasTechV3CompatiblePreviousRelease: true,
      },
    )

    expect(policy.migrations).toHaveLength(10)
    expect(policy.migrations.every((migration) => migration.changeKind === 'expand')).toBe(true)
  })

  it('refuses contract and backup-required migrations without explicit policy inputs', () => {
    const directory = mkdtempSync(resolve(tmpdir(), 'phase3-policy-'))
    const journalPath = resolve(directory, 'journal.json')
    const policyPath = resolve(directory, 'policy.json')
    writeFileSync(journalPath, JSON.stringify({ entries: [{ tag: '0002_policy_gate' }] }))

    try {
      writeFileSync(
        policyPath,
        JSON.stringify({
          schemaVersion: 1,
          migrations: [
            {
              tag: '0002_policy_gate',
              changeKind: 'contract',
              risk: 'high',
              requiresFreshRecoverableBackup: true,
              reason: 'Policy enforcement fixture',
              recovery: 'Fixture only',
            },
          ],
        }),
      )
      expect(() =>
        validateMigrationPolicy(policyPath, journalPath, {
          allowContract: false,
          hasFreshRecoverableBackup: true,
        }),
      ).toThrow(/Contract migration/)
      expect(() =>
        validateMigrationPolicy(policyPath, journalPath, {
          allowContract: true,
          hasFreshRecoverableBackup: false,
        }),
      ).toThrow(/fresh recoverable backup/)
    } finally {
      rmSync(directory, { force: true, recursive: true })
    }
  })
})
