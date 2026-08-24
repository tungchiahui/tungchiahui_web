import { mkdirSync } from 'node:fs'
import { dirname } from 'node:path'
import { DatabaseSync } from 'node:sqlite'

import { z } from 'zod'

const controlStateSummarySchema = z.object({
  environment: z.enum(['local', 'test']),
  initialized_at: z.string(),
  journal_mode: z.literal('wal'),
  schema_version: z.literal(1),
  synchronous: z.union([z.literal(2), z.literal('2')]),
})

export type ControlStateEnvironment = 'local' | 'test'

export type ControlStateSummary = Readonly<{
  environment: ControlStateEnvironment
  initializedAt: string
  journalMode: 'wal'
  schemaVersion: 1
  synchronous: 2
}>

const initialMigration = `
  CREATE TABLE IF NOT EXISTS control_schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
  ) STRICT;

  CREATE TABLE IF NOT EXISTS local_control_metadata (
    singleton_id INTEGER PRIMARY KEY CHECK (singleton_id = 1),
    environment TEXT NOT NULL CHECK (environment IN ('local', 'test')),
    initialized_at TEXT NOT NULL
  ) STRICT;
`

function openControlState(path: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const database = new DatabaseSync(path)
  database.exec('PRAGMA foreign_keys = ON;')
  database.exec('PRAGMA journal_mode = WAL;')
  database.exec('PRAGMA synchronous = FULL;')
  database.exec('PRAGMA busy_timeout = 5000;')
  return database
}

export function initializeControlState(
  path: string,
  environment: ControlStateEnvironment,
): ControlStateSummary {
  const database = openControlState(path)

  try {
    const appliedAt = new Date().toISOString()
    database.exec('BEGIN IMMEDIATE;')

    try {
      database.exec(initialMigration)
      database
        .prepare(
          'INSERT OR IGNORE INTO control_schema_migrations (version, applied_at) VALUES (1, ?)',
        )
        .run(appliedAt)
      database
        .prepare(
          `INSERT OR IGNORE INTO local_control_metadata
            (singleton_id, environment, initialized_at)
           VALUES (1, ?, ?)`,
        )
        .run(environment, appliedAt)
      database.exec('COMMIT;')
    } catch (error: unknown) {
      database.exec('ROLLBACK;')
      throw error
    }

    const summary = readSummary(database)

    if (summary.environment !== environment) {
      throw new Error('Control-state environment does not match the requested local/test mode')
    }

    return summary
  } finally {
    database.close()
  }
}

export function readControlState(path: string): ControlStateSummary {
  const database = openControlState(path)

  try {
    return readSummary(database)
  } finally {
    database.close()
  }
}

function readSummary(database: DatabaseSync): ControlStateSummary {
  const metadata = database
    .prepare(
      `SELECT
        environment,
        initialized_at,
        (SELECT MAX(version) FROM control_schema_migrations) AS schema_version,
        (SELECT journal_mode FROM pragma_journal_mode) AS journal_mode,
        (SELECT synchronous FROM pragma_synchronous) AS synchronous
       FROM local_control_metadata
       WHERE singleton_id = 1`,
    )
    .get()
  const parsed = controlStateSummarySchema.parse(metadata)

  return Object.freeze({
    environment: parsed.environment,
    initializedAt: parsed.initialized_at,
    journalMode: parsed.journal_mode,
    schemaVersion: parsed.schema_version,
    synchronous: 2,
  })
}
