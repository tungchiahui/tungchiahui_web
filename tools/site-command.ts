import { spawnSync } from 'node:child_process'

import { z } from 'zod'

import {
  type TranslationOperationRequest,
  translationOperationRequestSchema,
} from '../src/translation/contracts'

export type SiteCommand =
  | Readonly<{ kind: 'check' }>
  | Readonly<{ kind: 'dev-reset' }>
  | Readonly<{ kind: 'dev-start' }>
  | Readonly<{ kind: 'dev-stop' }>
  | Readonly<{ kind: 'help' }>
  | Readonly<{ kind: 'test' }>
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

  if (arguments_.length === 1) {
    switch (arguments_[0]) {
      case 'check':
        return Object.freeze({ kind: 'check' })
      case 'dev':
        return Object.freeze({ kind: 'dev-start' })
      case 'help':
        return Object.freeze({ kind: 'help' })
      case 'test':
        return Object.freeze({ kind: 'test' })
      default:
        throw new SiteUsageError(`Unknown command: ${arguments_[0]}`)
    }
  }

  if (arguments_.length === 2 && arguments_[0] === 'dev' && arguments_[1] === 'stop') {
    return Object.freeze({ kind: 'dev-stop' })
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
