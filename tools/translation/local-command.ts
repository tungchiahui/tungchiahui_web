import { resolve } from 'node:path'
import { z } from 'zod'

export type LocalTranslationCommand = Readonly<{
  kind: 'translate-local'
  action: 'pending' | 'changed' | 'article' | 'all' | 'validate' | 'status' | 'cancel'
  contentRoot: string
  mode: 'dry-run' | 'execute'
  budgetUsd: number
  force: boolean
  article?: string
  jobId?: string
  keyFile?: string
}>

export function parseLocalTranslationCommand(args: readonly string[]): LocalTranslationCommand {
  const action = z
    .enum(['pending', 'changed', 'article', 'all', 'validate', 'status', 'cancel'])
    .parse(args[0])
  let article: string | undefined
  let jobId: string | undefined
  let keyFile: string | undefined
  let contentRoot: string | undefined
  let mode: 'dry-run' | 'execute' = 'dry-run'
  let budgetUsd = 0
  let force = false
  let confirmation = false
  let index = 1
  if (action === 'article') {
    article = z.string().min(1).parse(args[index])
    index += 1
  }
  if (
    (action === 'status' || action === 'cancel') &&
    args[index] &&
    !args[index]?.startsWith('--')
  ) {
    jobId = z.uuid().parse(args[index])
    index += 1
  }
  const seen = new Set<string>()
  while (index < args.length) {
    const arg = z.string().parse(args[index])
    if (seen.has(arg)) throw new Error('Duplicate local translation option')
    seen.add(arg)
    switch (arg) {
      case '--content-root':
        contentRoot = resolve(z.string().min(1).parse(args[++index]))
        break
      case '--key-file':
        keyFile = resolve(z.string().min(1).parse(args[++index]))
        break
      case '--job-id':
        jobId = z.uuid().parse(args[++index])
        break
      case '--budget-usd':
        budgetUsd = z.coerce.number().finite().nonnegative().max(10_000).parse(args[++index])
        break
      case '--execute':
        mode = 'execute'
        break
      case '--dry-run':
        mode = 'dry-run'
        break
      case '--force':
        force = true
        break
      case '--confirm-retranslation':
        confirmation = z.literal('RETRANSLATE').parse(args[++index]) === 'RETRANSLATE'
        break
      default:
        throw new Error('Unknown local translation option')
    }
    index += 1
  }
  if (!contentRoot) throw new Error('Local translation requires --content-root')
  if (force && !confirmation)
    throw new Error('Forced translation requires RETRANSLATE confirmation')
  if (mode === 'execute' && !seen.has('--budget-usd'))
    throw new Error('Paid local translation requires an explicit budget')
  if (seen.has('--execute') && seen.has('--dry-run'))
    throw new Error('Choose exactly one translation mode')
  if (mode === 'dry-run' && seen.has('--budget-usd'))
    throw new Error('Dry-run does not accept a budget')
  return {
    kind: 'translate-local',
    action,
    contentRoot,
    mode,
    budgetUsd,
    force,
    ...(article ? { article } : {}),
    ...(jobId ? { jobId } : {}),
    ...(keyFile ? { keyFile } : {}),
  }
}
