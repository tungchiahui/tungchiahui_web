import { readFileSync } from 'node:fs'

import { z } from 'zod'

const migrationPolicySchema = z.object({
  schemaVersion: z.literal(1),
  migrations: z.array(
    z.object({
      tag: z.string().regex(/^\d{4}_[a-z0-9_]+$/),
      changeKind: z.enum(['expand', 'contract']),
      risk: z.enum(['low', 'medium', 'high']),
      requiresFreshRecoverableBackup: z.boolean(),
      requiresTechV3CompatiblePreviousRelease: z.boolean().default(false),
      reason: z.string().min(1),
      recovery: z.string().min(1),
    }),
  ),
})

const migrationJournalSchema = z.object({
  entries: z.array(z.object({ tag: z.string() })),
})

export type MigrationPolicyOptions = Readonly<{
  allowContract: boolean
  hasFreshRecoverableBackup: boolean
  hasTechV3CompatiblePreviousRelease?: boolean
  throughMigration?: string
  applyMigrations?: boolean
}>

export function validateMigrationPolicy(
  policyPath: string,
  journalPath: string,
  options: MigrationPolicyOptions,
) {
  const policy = migrationPolicySchema.parse(
    JSON.parse(readFileSync(policyPath, 'utf8')) as unknown,
  )
  const journal = migrationJournalSchema.parse(
    JSON.parse(readFileSync(journalPath, 'utf8')) as unknown,
  )
  const policyTags = policy.migrations.map((migration) => migration.tag)
  const journalTags = journal.entries.map((entry) => entry.tag)

  if (JSON.stringify(policyTags) !== JSON.stringify(journalTags)) {
    throw new Error('Migration policy must cover every Drizzle migration in journal order')
  }

  const lastIndex = options.throughMigration
    ? policyTags.indexOf(options.throughMigration)
    : policyTags.length - 1
  if (lastIndex < 0) throw new Error('Migration scope references an unknown migration')
  const selected = { ...policy, migrations: policy.migrations.slice(0, lastIndex + 1) }
  for (const migration of selected.migrations) {
    if (
      migration.requiresTechV3CompatiblePreviousRelease &&
      !options.hasTechV3CompatiblePreviousRelease
    ) {
      throw new Error(
        `Migration requires a V3-compatible active/rollback release: ${migration.tag}`,
      )
    }
    if (migration.changeKind === 'contract' && !options.allowContract) {
      throw new Error(`Contract migration requires a later-release authorization: ${migration.tag}`)
    }

    if (
      migration.requiresFreshRecoverableBackup &&
      options.applyMigrations !== false &&
      !options.hasFreshRecoverableBackup
    ) {
      throw new Error(`Migration requires a fresh recoverable backup: ${migration.tag}`)
    }
  }

  return selected
}
