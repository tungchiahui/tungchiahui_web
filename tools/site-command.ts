import { spawnSync } from 'node:child_process'

import { z } from 'zod'

import {
  type TranslationOperationRequest,
  translationOperationRequestSchema,
} from '../src/translation/contracts'

export type SiteCommand =
  | Readonly<{ execute: boolean; kind: 'asset-backup'; secretFile: string }>
  | Readonly<{
      backupType: 'diff' | 'full' | 'incr'
      environment: 'local' | 'production' | 'test'
      kind: 'backup-create'
      reason: string
    }>
  | Readonly<{ kind: 'backup-status' }>
  | Readonly<{
      backupId: string
      environment: 'local' | 'production' | 'test'
      kind: 'backup-offsite-retry'
      reason: string
    }>
  | Readonly<{ kind: 'check' }>
  | Readonly<{
      gitSha?: string
      imageDigest?: string
      kind: 'deployment-create'
      reason: string
      wait: boolean
    }>
  | Readonly<{ kind: 'content-sync'; sourceCommit: string }>
  | Readonly<{ kind: 'dev-reset' }>
  | Readonly<{ kind: 'dev-start' }>
  | Readonly<{ kind: 'dev-stop' }>
  | Readonly<{ kind: 'help' }>
  | Readonly<{ kind: 'production-secrets-init' }>
  | Readonly<{ kind: 'production-secrets-validate' }>
  | Readonly<{
      action: 'planned-migration' | 'provision-only'
      inventoryHost: string
      kind: 'server-migration-create'
      reason: string
    }>
  | Readonly<{ kind: 'rollback-create'; reason: string }>
  | Readonly<{ kind: 'status' }>
  | Readonly<{ kind: 'storage-contract-s3' }>
  | Readonly<{ kind: 'test' }>
  | Readonly<{
      breakGlass: boolean
      confirmation: string
      environment: 'local' | 'production' | 'test'
      inventoryHost?: string
      kind: 'restore'
      reason: string
      selector: Readonly<{ backupId: string }> | Readonly<{ targetTime: string }>
    }>
  | Readonly<{
      action: 'create'
      kind: 'translate'
      request: TranslationOperationRequest
    }>
  | Readonly<{ action: 'status'; jobId?: string; kind: 'translate' }>
  | Readonly<{ action: 'cancel'; jobId: string; kind: 'translate' }>

export class SiteUsageError extends Error {
  override readonly name = 'SiteUsageError'
}

export function assertToolchain(nodeVersion: string) {
  if (nodeVersion !== '24.19.0') {
    throw new SiteUsageError(`Node.js 24.19.0 is required; received ${nodeVersion}`)
  }
}

export function parseSiteCommand(arguments_: readonly string[]): SiteCommand {
  if (arguments_.length === 0) {
    return Object.freeze({ kind: 'help' })
  }

  if (
    arguments_.length === 3 &&
    arguments_[0] === 'production' &&
    arguments_[1] === 'secrets' &&
    arguments_[2] === 'init'
  ) {
    return Object.freeze({ kind: 'production-secrets-init' })
  }

  if (arguments_[0] === 'storage' && arguments_[1] === 'backup' && arguments_[2] === 'assets') {
    let execute = false
    let confirmed = false
    let secretFile = 'ops/production/secrets/production.sops.yaml'
    let index = 3
    while (index < arguments_.length) {
      const argument = arguments_[index]
      if (argument === '--execute') {
        execute = true
        index += 1
        continue
      }
      if (argument === '--confirm') {
        confirmed = arguments_[index + 1] === 'ASSET-BACKUP-PRESERVE-R2-ONLY'
        index += 2
        continue
      }
      if (argument === '--secret-file') {
        secretFile = z
          .string()
          .min(1)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      throw new SiteUsageError(`Unknown asset backup argument: ${String(argument)}`)
    }
    if (execute && !confirmed) {
      throw new SiteUsageError(
        'Asset backup execution requires --confirm ASSET-BACKUP-PRESERVE-R2-ONLY',
      )
    }
    return Object.freeze({ execute, kind: 'asset-backup', secretFile })
  }

  if (
    arguments_.length === 3 &&
    arguments_[0] === 'production' &&
    arguments_[1] === 'secrets' &&
    arguments_[2] === 'validate'
  ) {
    return Object.freeze({ kind: 'production-secrets-validate' })
  }

  if (arguments_[0] === 'deploy') {
    let gitSha: string | undefined
    let imageDigest: string | undefined
    let reason = 'manual operator deployment'
    let wait = false
    let index = 1
    if (arguments_[index] !== undefined && !arguments_[index]?.startsWith('--')) {
      gitSha = z
        .string()
        .regex(/^[a-f0-9]{40}$/)
        .parse(arguments_[index])
      index += 1
    }
    while (index < arguments_.length) {
      const argument = arguments_[index]
      if (argument === '--image-digest') {
        imageDigest = z
          .string()
          .regex(/^sha256:[a-f0-9]{64}$/)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--reason') {
        reason = z
          .string()
          .trim()
          .min(1)
          .max(1_000)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--wait') {
        wait = true
        index += 1
        continue
      }
      throw new SiteUsageError(`Unknown deploy argument: ${String(argument)}`)
    }
    return Object.freeze({
      ...(gitSha === undefined ? {} : { gitSha }),
      ...(imageDigest === undefined ? {} : { imageDigest }),
      kind: 'deployment-create',
      reason,
      wait,
    })
  }

  if (arguments_[0] === 'migrate-server' || arguments_[0] === 'provision') {
    const inventoryHost = z
      .string()
      .regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/)
      .safeParse(arguments_[1])
    if (!inventoryHost.success) {
      throw new SiteUsageError(`${arguments_[0]} requires a stable inventory hostname or SSH alias`)
    }
    let reason =
      arguments_[0] === 'provision'
        ? 'manual operator target provisioning'
        : 'manual operator planned server migration'
    let index = 2
    while (index < arguments_.length) {
      if (arguments_[index] !== '--reason') {
        throw new SiteUsageError(`Unknown ${arguments_[0]} argument: ${String(arguments_[index])}`)
      }
      reason = z
        .string()
        .trim()
        .min(1)
        .max(1_000)
        .parse(arguments_[index + 1])
      index += 2
    }
    return Object.freeze({
      action: arguments_[0] === 'provision' ? 'provision-only' : 'planned-migration',
      inventoryHost: inventoryHost.data,
      kind: 'server-migration-create',
      reason,
    })
  }

  if (arguments_[0] === 'content' && arguments_[1] === 'sync' && arguments_.length === 3) {
    return Object.freeze({
      kind: 'content-sync',
      sourceCommit: z
        .string()
        .regex(/^[a-f0-9]{40}$/)
        .parse(arguments_[2]),
    })
  }

  if (arguments_[0] === 'rollback') {
    let reason = 'manual operator rollback'
    if (arguments_.length > 1) {
      if (arguments_.length !== 3 || arguments_[1] !== '--reason') {
        throw new SiteUsageError('rollback accepts only --reason <text>')
      }
      reason = z.string().trim().min(1).max(1_000).parse(arguments_[2])
    }
    return Object.freeze({ kind: 'rollback-create', reason })
  }

  if (arguments_.length === 1) {
    switch (arguments_[0]) {
      case 'check':
        return Object.freeze({ kind: 'check' })
      case 'dev':
        return Object.freeze({ kind: 'dev-start' })
      case 'help':
        return Object.freeze({ kind: 'help' })
      case 'status':
        return Object.freeze({ kind: 'status' })
      case 'test':
        return Object.freeze({ kind: 'test' })
      default:
        throw new SiteUsageError(`Unknown command: ${arguments_[0]}`)
    }
  }

  if (arguments_.length === 2 && arguments_[0] === 'dev' && arguments_[1] === 'stop') {
    return Object.freeze({ kind: 'dev-stop' })
  }

  if (arguments_.length === 2 && arguments_[0] === 'backup' && arguments_[1] === 'status') {
    return Object.freeze({ kind: 'backup-status' })
  }

  if (arguments_[0] === 'backup' && arguments_[1] === 'retry-offsite') {
    const backupId = z.string().min(1).max(200).parse(arguments_[2])
    let environment: 'local' | 'production' | 'test' | undefined
    let reason: string | undefined
    let index = 3
    while (index < arguments_.length) {
      const argument = arguments_[index]
      if (argument === '--environment') {
        environment = z.enum(['local', 'test', 'production']).parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--reason') {
        reason = z
          .string()
          .trim()
          .min(1)
          .max(1_000)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      throw new SiteUsageError(`Unknown backup retry argument: ${String(argument)}`)
    }
    if (!environment || !reason) {
      throw new SiteUsageError('backup retry-offsite requires --environment and --reason')
    }
    return Object.freeze({ backupId, environment, kind: 'backup-offsite-retry', reason })
  }

  if (arguments_[0] === 'backup') {
    let backupType: 'diff' | 'full' | 'incr' = 'full'
    let environment: 'local' | 'production' | 'test' | undefined
    let reason: string | undefined
    let index = 1
    while (index < arguments_.length) {
      const argument = arguments_[index]
      if (argument === '--environment') {
        environment = z.enum(['local', 'test', 'production']).parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--type') {
        backupType = z.enum(['full', 'diff', 'incr']).parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--reason') {
        reason = z
          .string()
          .trim()
          .min(1)
          .max(1_000)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      throw new SiteUsageError(`Unknown backup argument: ${String(argument)}`)
    }
    if (!environment || !reason) {
      throw new SiteUsageError('backup requires --environment and --reason')
    }
    return Object.freeze({ backupType, environment, kind: 'backup-create', reason })
  }

  if (arguments_[0] === 'restore') {
    const selectorValue = arguments_[1]
    if (!selectorValue || selectorValue.startsWith('--')) {
      throw new SiteUsageError('restore requires a backup id or ISO timestamp')
    }
    const timestamp = z.iso.datetime({ offset: true }).safeParse(selectorValue)
    const selector = timestamp.success
      ? Object.freeze({ targetTime: timestamp.data })
      : Object.freeze({ backupId: z.string().min(1).max(200).parse(selectorValue) })
    let breakGlass = false
    let confirmation: string | undefined
    let environment: 'local' | 'production' | 'test' | undefined
    let inventoryHost: string | undefined
    let reason: string | undefined
    let index = 2
    while (index < arguments_.length) {
      const argument = arguments_[index]
      if (argument === '--environment') {
        environment = z.enum(['local', 'test', 'production']).parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--confirm') {
        confirmation = z
          .string()
          .min(1)
          .max(100)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--reason') {
        reason = z
          .string()
          .trim()
          .min(1)
          .max(1_000)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      if (argument === '--break-glass') {
        breakGlass = true
        index += 1
        continue
      }
      if (argument === '--inventory-host') {
        inventoryHost = z
          .string()
          .regex(/^[a-zA-Z][a-zA-Z0-9._-]{0,252}$/)
          .parse(arguments_[index + 1])
        index += 2
        continue
      }
      throw new SiteUsageError(`Unknown restore argument: ${String(argument)}`)
    }
    if (!environment || !confirmation || !reason) {
      throw new SiteUsageError('restore requires --environment, --confirm, and --reason')
    }
    const expectedConfirmation = `RESTORE-${environment.toUpperCase()}`
    if (confirmation !== expectedConfirmation) {
      throw new SiteUsageError(`restore confirmation must be ${expectedConfirmation}`)
    }
    if (breakGlass !== (inventoryHost !== undefined)) {
      throw new SiteUsageError(
        'break-glass restore requires both --break-glass and --inventory-host',
      )
    }
    return Object.freeze({
      breakGlass,
      confirmation,
      environment,
      ...(inventoryHost === undefined ? {} : { inventoryHost }),
      kind: 'restore',
      reason,
      selector,
    })
  }

  if (
    arguments_.length === 6 &&
    arguments_[0] === 'dev' &&
    arguments_[1] === 'reset' &&
    arguments_[2] === '--environment' &&
    arguments_[3] === 'local' &&
    arguments_[4] === '--confirm' &&
    arguments_[5] === 'RESET-LOCAL-DATA'
  ) {
    return Object.freeze({ kind: 'dev-reset' })
  }

  if (arguments_[0] === 'dev' && arguments_[1] === 'reset') {
    throw new SiteUsageError('Local reset requires: --environment local --confirm RESET-LOCAL-DATA')
  }

  if (arguments_[0] === 'translate') {
    const translationArguments = arguments_.slice(1)
    if (translationArguments[0] === 'status') {
      if (translationArguments.length > 2)
        throw new SiteUsageError('translate status accepts at most one job id')
      return Object.freeze({
        action: 'status' as const,
        ...(translationArguments[1] === undefined
          ? {}
          : { jobId: z.uuid().parse(translationArguments[1]) }),
        kind: 'translate' as const,
      })
    }
    if (translationArguments[0] === 'cancel') {
      if (translationArguments.length !== 2)
        throw new SiteUsageError('translate cancel requires one job id')
      return Object.freeze({
        action: 'cancel' as const,
        jobId: z.uuid().parse(translationArguments[1]),
        kind: 'translate' as const,
      })
    }
    const scope = z
      .enum(['pending', 'changed', 'article', 'all'])
      .safeParse(translationArguments[0])
    if (!scope.success)
      throw new SiteUsageError(
        'translate requires pending, changed, article, all, status, or cancel',
      )
    let index = 1
    let articleSourcePath: string | undefined
    if (scope.data === 'article') {
      articleSourcePath = translationArguments[index]
      if (!articleSourcePath || articleSourcePath.startsWith('--')) {
        throw new SiteUsageError('translate article requires a source path')
      }
      index += 1
    }
    let mode: 'dry-run' | 'execute' | undefined
    let budgetUsd: number | undefined
    let force = false
    let retranslationConfirmation: 'RETRANSLATE' | undefined
    while (index < translationArguments.length) {
      const argument = translationArguments[index]
      if (argument === '--dry-run' || argument === '--execute') {
        if (mode !== undefined) throw new SiteUsageError('choose exactly one translation mode')
        mode = argument === '--dry-run' ? 'dry-run' : 'execute'
        index += 1
        continue
      }
      if (argument === '--budget-usd') {
        budgetUsd = z.coerce
          .number()
          .finite()
          .nonnegative()
          .parse(translationArguments[index + 1])
        index += 2
        continue
      }
      if (argument === '--force') {
        force = true
        index += 1
        continue
      }
      if (argument === '--confirm-retranslation') {
        retranslationConfirmation = z.literal('RETRANSLATE').parse(translationArguments[index + 1])
        index += 2
        continue
      }
      throw new SiteUsageError(`Unknown translate argument: ${String(argument)}`)
    }
    if (mode === undefined) throw new SiteUsageError('translate requires --dry-run or --execute')
    const request = translationOperationRequestSchema.parse({
      ...(articleSourcePath === undefined ? {} : { articleSourcePath }),
      ...(budgetUsd === undefined ? {} : { budgetUsd }),
      ...(mode === 'execute' ? { executionConfirmation: 'EXECUTE_PAID_TRANSLATION' as const } : {}),
      force,
      mode,
      ...(retranslationConfirmation === undefined ? {} : { retranslationConfirmation }),
      scope: scope.data,
    })
    return Object.freeze({ action: 'create', kind: 'translate', request })
  }

  if (
    arguments_.length === 5 &&
    arguments_[0] === 'storage' &&
    arguments_[1] === 'contract' &&
    arguments_[2] === 's3' &&
    arguments_[3] === '--confirm' &&
    arguments_[4] === 'S3-NON-PRODUCTION'
  ) {
    return Object.freeze({ kind: 'storage-contract-s3' })
  }

  if (arguments_[0] === 'storage') {
    throw new SiteUsageError(
      'External S3 contract requires: storage contract s3 --confirm S3-NON-PRODUCTION',
    )
  }

  throw new SiteUsageError('Invalid or ambiguous command arguments')
}

export function executePackageScript(script: 'site:check' | 'site:test') {
  const executable = process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm'
  const result = spawnSync(executable, ['run', script], { stdio: 'inherit' })

  if (result.error) {
    throw new Error(`Unable to run pnpm: ${result.error.message}`)
  }

  return result.status ?? 1
}
