import { spawnSync } from 'node:child_process'

import { z } from 'zod'

import { backupTypeSchema, restoreSelectorSchema } from '../control-plane/contracts'

const pgBackRestBackupSchema = z
  .object({
    archive: z
      .object({ start: z.string().nullable().optional(), stop: z.string().nullable().optional() })
      .optional(),
    info: z
      .object({
        repository: z
          .object({ delta: z.number().int().nonnegative(), size: z.number().int().nonnegative() })
          .passthrough(),
        size: z.number().int().nonnegative(),
      })
      .passthrough(),
    label: z.string().min(1),
    timestamp: z.object({ start: z.number().int(), stop: z.number().int() }),
    type: backupTypeSchema,
  })
  .passthrough()

const pgBackRestInfoSchema = z.array(
  z
    .object({
      archive: z
        .array(
          z
            .object({
              max: z.string().nullable().optional(),
              min: z.string().nullable().optional(),
            })
            .passthrough(),
        )
        .default([]),
      backup: z.array(pgBackRestBackupSchema).default([]),
      name: z.string().min(1),
      status: z.object({ code: z.number().int(), message: z.string() }).passthrough(),
    })
    .passthrough(),
)

export type PgBackRestCommandConfiguration = Readonly<{
  configPath: string
  stanza: string
}>

function runPgBackRest(
  configuration: PgBackRestCommandConfiguration,
  arguments_: readonly string[],
) {
  const result = spawnSync(
    'pgbackrest',
    [
      `--config=${z.string().startsWith('/').parse(configuration.configPath)}`,
      `--stanza=${z
        .string()
        .regex(/^[a-z][a-z0-9-]{0,62}$/)
        .parse(configuration.stanza)}`,
      '--log-level-console=warn',
      ...arguments_,
    ],
    { encoding: 'utf8' },
  )
  if (result.error) throw new Error(`Unable to run pgBackRest: ${result.error.message}`)
  if (result.status !== 0) {
    const diagnostic = [result.stderr.trim(), result.stdout.trim()].find(
      (candidate) => candidate.length > 0,
    )
    throw new Error(
      `pgBackRest command failed with exit code ${String(result.status)}${diagnostic ? `: ${diagnostic}` : ''}`,
    )
  }
  return result.stdout
}

export function initializePgBackRest(configuration: PgBackRestCommandConfiguration) {
  runPgBackRest(configuration, ['stanza-create'])
  runPgBackRest(configuration, ['check'])
}

export function checkPgBackRest(configuration: PgBackRestCommandConfiguration) {
  runPgBackRest(configuration, ['check'])
  runPgBackRest(configuration, ['verify'])
  return readPgBackRestInfo(configuration)
}

export function readPgBackRestInfo(configuration: PgBackRestCommandConfiguration) {
  const output = runPgBackRest(configuration, ['--output=json', 'info'])
  return pgBackRestInfoSchema.parse(JSON.parse(output) as unknown)
}

export function runPgBackRestBackup(
  configuration: PgBackRestCommandConfiguration,
  backupType: z.infer<typeof backupTypeSchema>,
) {
  const type = backupTypeSchema.parse(backupType)
  runPgBackRest(configuration, [`--type=${type}`, '--start-fast', 'backup'])
  const stanza = readPgBackRestInfo(configuration).find(
    (candidate) => candidate.name === configuration.stanza,
  )
  if (stanza?.status.code !== 0) {
    throw new Error('pgBackRest did not report a healthy configured stanza')
  }
  const backup = [...stanza.backup].sort(
    (left, right) => right.timestamp.stop - left.timestamp.stop,
  )[0]
  if (!backup || backup.type !== type) {
    throw new Error(`pgBackRest did not report the completed ${type} backup`)
  }
  const archive = stanza.archive[0]
  return Object.freeze({
    backupId: backup.label,
    backupType: backup.type,
    completedAt: new Date(backup.timestamp.stop * 1_000).toISOString(),
    databaseBytes: backup.info.size,
    repositoryBytes: backup.info.repository.size,
    startedAt: new Date(backup.timestamp.start * 1_000).toISOString(),
    walArchiveMax: archive?.max ?? backup.archive?.stop ?? null,
  })
}

export function restorePgBackRest(
  configuration: PgBackRestCommandConfiguration,
  selector: z.infer<typeof restoreSelectorSchema>,
) {
  const parsed = restoreSelectorSchema.parse(selector)
  const targetArguments =
    'backupId' in parsed
      ? [`--set=${parsed.backupId}`]
      : [
          '--type=time',
          `--target=${new Date(parsed.targetTime).toISOString().replace('T', ' ').replace('Z', '+00')}`,
          '--target-action=promote',
        ]
  runPgBackRest(configuration, [...targetArguments, 'restore'])
}
