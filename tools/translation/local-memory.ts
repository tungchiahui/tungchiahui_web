import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import {
  closeSync,
  existsSync,
  fsyncSync,
  lstatSync,
  mkdirSync,
  openSync,
  readdirSync,
  readFileSync,
  realpathSync,
  renameSync,
  unlinkSync,
  writeFileSync,
} from 'node:fs'
import { homedir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { z } from 'zod'
import { createDeepSeekTranslationProvider } from '../../src/translation/deepseek'
import {
  defaultMemoryManifest,
  type GitMemoryEntry,
  memoryEntryKey,
  memoryManifestPath,
  memoryManifestSchema,
  memoryShardPath,
  parseMemoryShard,
  serializeMemoryShard,
  validateMemoryEntry,
} from '../../src/translation/git-memory'
import type {
  TranslationProvider,
  TranslationProviderRequest,
} from '../../src/translation/provider'
import {
  segmentMarkdownForTranslation,
  type TargetedPatchContext,
} from '../../src/translation/segmentation'
import type { LocalTranslationCommand } from './local-command'

const blockKeySchema = z.string().regex(/^[a-f0-9]{64}$/)
const jobSchema = z
  .object({
    id: z.uuid(),
    contentRoot: z.string(),
    sourceCommit: z.string().regex(/^[a-f0-9]{40}$/),
    sourceTree: blockKeySchema,
    scope: z.string(),
    budgetMicros: z.number().int().nonnegative(),
    spentMicros: z.number().int().nonnegative(),
    plannedKeys: z.array(blockKeySchema),
    completedKeys: z.array(blockKeySchema),
    failedKeys: z.array(blockKeySchema),
    status: z.enum(['running', 'completed', 'partial', 'cancelled', 'failed']),
    reserved: z
      .object({ key: blockKeySchema, maximumMicros: z.number().int().nonnegative() })
      .nullable(),
    requests: z.number().int().nonnegative(),
    updatedAt: z.string(),
    error: z.string().nullable(),
  })
  .strict()
  .refine((job) => {
    const planned = new Set(job.plannedKeys)
    const settled = [...job.completedKeys, ...job.failedKeys]
    return (
      planned.size === job.plannedKeys.length &&
      new Set(settled).size === settled.length &&
      settled.every((key) => planned.has(key)) &&
      (!job.reserved || (planned.has(job.reserved.key) && !settled.includes(job.reserved.key))) &&
      job.spentMicros <= job.budgetMicros
    )
  }, 'Invalid local budget or block checkpoint')
type LocalJob = z.infer<typeof jobSchema>

function git(root: string, args: readonly string[]) {
  return execFileSync('git', ['-C', root, ...args], {
    encoding: 'utf8',
    maxBuffer: 32_000_000,
  }).trimEnd()
}
function mkdirPrivate(path: string) {
  mkdirSync(path, { recursive: true, mode: 0o700 })
}
export function atomicWrite(path: string, contents: string) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
  const temporary = `${path}.${randomUUID()}.tmp`
  const fd = openSync(temporary, 'wx', 0o600)
  try {
    writeFileSync(fd, contents)
    fsyncSync(fd)
  } finally {
    closeSync(fd)
  }
  renameSync(temporary, path)
  const directory = openSync(dirname(path), 'r')
  try {
    fsyncSync(directory)
  } finally {
    closeSync(directory)
  }
}
function stateRoot(root: string) {
  const identity = createHash('sha256').update(realpathSync(root)).digest('hex')
  return join(homedir(), '.local/state/tungchiahui/translation', identity)
}
function assertMemoryDirectory(root: string) {
  for (const suffix of ['translations', 'translations/en-us', 'translations/en-us/v1']) {
    const path = join(root, suffix)
    if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()))
      throw new Error('Translation memory directory must not be a symlink')
    mkdirSync(path, { recursive: true, mode: 0o755 })
  }
}
export function readLocalMemory(root: string) {
  const records = new Map<string, GitMemoryEntry>()
  for (const suffix of ['translations', 'translations/en-us', 'translations/en-us/v1']) {
    const path = join(root, suffix)
    if (existsSync(path) && (!lstatSync(path).isDirectory() || lstatSync(path).isSymbolicLink()))
      throw new Error('Translation memory directory must be a regular directory')
  }
  const manifest = join(root, memoryManifestPath)
  if (!existsSync(manifest)) {
    const shards = join(root, 'translations/en-us/v1')
    if (existsSync(shards) && readdirSync(shards).some((name) => name.endsWith('.json')))
      throw new Error('Translation shards require their versioned manifest')
    return records
  }
  if (lstatSync(manifest).isSymbolicLink())
    throw new Error('Translation manifest must not be a symlink')
  memoryManifestSchema.parse(JSON.parse(readFileSync(manifest, 'utf8')) as unknown)
  const directory = join(root, 'translations/en-us/v1')
  if (!existsSync(directory)) return records
  if (lstatSync(directory).isSymbolicLink())
    throw new Error('Translation shard directory must not be a symlink')
  for (const name of readdirSync(directory).sort()) {
    if (/^[a-f0-9]{2}\.json\.[a-f0-9-]{36}\.tmp$/u.test(name)) continue
    if (!/^[a-f0-9]{2}\.json$/u.test(name))
      throw new Error('Unexpected file in translation shard directory')
    const path = join(directory, name)
    if (!lstatSync(path).isFile() || lstatSync(path).isSymbolicLink())
      throw new Error('Translation shard must be a regular file')
    const parsed = parseMemoryShard(`translations/en-us/v1/${name}`, readFileSync(path, 'utf8'))
    for (const [key, entry] of Object.entries(parsed.entries)) records.set(key, entry)
  }
  return records
}
function readSources(root: string) {
  if (git(root, ['rev-parse', '--show-toplevel']) !== realpathSync(root))
    throw new Error('--content-root must be the content Git repository root')
  if (git(root, ['status', '--porcelain', '--', 'content']))
    throw new Error('Commit canonical content changes before translating')
  const commit = git(root, ['rev-parse', 'HEAD'])
  const tree = execFileSync('git', ['-C', root, 'ls-tree', '-rz', commit, '--', 'content'], {
    encoding: 'utf8',
    maxBuffer: 32_000_000,
  })
  const paths = tree
    .split('\0')
    .filter(Boolean)
    .map((line) => {
      const tab = line.indexOf('\t')
      const header = line.slice(0, tab).split(' ')
      if (header[0] !== '100644' && header[0] !== '100755')
        throw new Error('Canonical content cannot contain symlinks or submodules')
      return line.slice(tab + 1)
    })
    .filter(
      (path) =>
        /^content\/posts\/[^/]+\.md$/u.test(path) ||
        /^content\/wiki\/[^/]+\/(?:[^/]+\/)*[^/]+\.md$/u.test(path),
    )
  return {
    commit,
    sourceTree: createHash('sha256').update(tree).digest('hex'),
    files: paths.map((path) => ({
      path,
      contents: execFileSync('git', ['-C', root, 'show', `${commit}:${path}`], {
        encoding: 'utf8',
        maxBuffer: 16_000_000,
      }),
    })),
  }
}
function sourceTreeIdentity(root: string) {
  if (git(root, ['status', '--porcelain', '--', 'content']))
    throw new Error('Canonical source has uncommitted changes')
  const tree = execFileSync('git', ['-C', root, 'ls-tree', '-rz', 'HEAD', '--', 'content'], {
    encoding: 'utf8',
    maxBuffer: 32_000_000,
  })
  return createHash('sha256').update(tree).digest('hex')
}
function readJob(root: string, jobId?: string) {
  const directory = stateRoot(root)
  const id =
    jobId ??
    z
      .object({ id: z.uuid() })
      .parse(JSON.parse(readFileSync(join(directory, 'latest.json'), 'utf8')) as unknown).id
  return {
    directory,
    job: jobSchema.parse(
      JSON.parse(readFileSync(join(directory, `${id}.json`), 'utf8')) as unknown,
    ),
  }
}
export function localTranslationStatus(root: string, jobId?: string) {
  const { job } = readJob(root, jobId)
  return {
    jobId: job.id,
    status: job.status,
    completedBlocks: job.completedKeys.length,
    failedBlocks: job.failedKeys.length,
    remainingBlocks: job.plannedKeys.length - job.completedKeys.length - job.failedKeys.length,
    budgetUsd: job.budgetMicros / 1_000_000,
    accountedCostUsd: job.spentMicros / 1_000_000,
    reservedRequest: job.reserved,
    requests: job.requests,
    updatedAt: job.updatedAt,
    error: job.error,
  }
}
export function cancelLocalTranslation(root: string, jobId?: string) {
  const { directory, job } = readJob(root, jobId)
  atomicWrite(join(directory, `${job.id}.cancel`), 'cancel\n')
  return { jobId: job.id, cancellationRequested: true }
}

export async function runLocalTranslation(
  command: LocalTranslationCommand,
  injectedProvider?: TranslationProvider,
) {
  const root = realpathSync(command.contentRoot)
  if (command.action === 'status') return localTranslationStatus(root, command.jobId)
  if (command.action === 'cancel') return cancelLocalTranslation(root, command.jobId)
  const memory = readLocalMemory(root)
  if (command.action === 'validate') return { status: 'valid', entries: memory.size }
  const source = readSources(root)
  if (command.article && !source.files.some((file) => file.path === command.article))
    throw new Error('Article source path is not present in the canonical Git snapshot')
  const blocks = new Map<string, ReturnType<typeof segmentMarkdownForTranslation>[number]>()
  const changedKeys = new Set<string>()
  const contexts = new Map<string, TargetedPatchContext>()
  for (const file of source.files) {
    if (command.article && file.path !== command.article) continue
    let previous: ReturnType<typeof segmentMarkdownForTranslation> = []
    try {
      const parent = git(root, ['log', '-1', '--format=%P', source.commit, '--', file.path]).split(
        ' ',
      )[0]
      if (parent)
        previous = segmentMarkdownForTranslation(
          execFileSync('git', ['-C', root, 'show', `${parent}:${file.path}`], {
            encoding: 'utf8',
            stdio: ['ignore', 'pipe', 'pipe'],
            maxBuffer: 16_000_000,
          }),
        )
    } catch {
      /* A newly added document has no prior source context. */
    }
    for (const block of segmentMarkdownForTranslation(file.contents)) {
      if (!block.isTranslatable) continue
      const key = memoryEntryKey(block)
      blocks.set(key, block)
      const old = previous[block.ordinal]
      if (old?.sourceAstType === block.sourceAstType && old.sourceHash !== block.sourceHash) {
        changedKeys.add(key)
        const translated = memory.get(memoryEntryKey(old))
        if (translated)
          contexts.set(key, {
            oldSource: old.sourceText,
            oldTranslation: translated.translatedText,
            newSource: block.sourceText,
          })
      }
    }
  }
  const planned = [...blocks.keys()].filter(
    (key) =>
      (command.action !== 'changed' || changedKeys.has(key)) && (command.force || !memory.has(key)),
  )
  // Git tree order puts Blog before Wiki and keeps the initial job deterministic.
  // Dry-run uses a credential-free estimator. The key is required only for execute.
  const provider =
    injectedProvider ??
    createDeepSeekTranslationProvider({
      apiKey:
        command.mode === 'execute'
          ? readKey(command.keyFile, root)
          : 'dry-run-no-network-credential',
    })
  const request = (key: string): TranslationProviderRequest => {
    const block = blocks.get(key)
    if (!block) throw new Error('Translation source block is not available')
    return {
      context: contexts.get(key) ?? null,
      maxOutputTokens: Math.max(64, Math.min(100_000, Buffer.byteLength(block.sourceText) * 2)),
      requestId: randomUUID(),
      sourceLocale: 'zh-cn',
      targetLocale: 'en-us',
      sourceText: block.sourceText,
    }
  }
  if (command.mode === 'dry-run') {
    let maximumCostUsd = 0
    for (const key of planned) maximumCostUsd += provider.estimate(request(key)).maximumCostUsd
    return {
      mode: 'dry-run',
      sourceCommit: source.commit,
      documents: source.files.length,
      pendingBlocks: planned.length,
      reusedBlocks: blocks.size - planned.length,
      maximumCostUsd: Math.ceil(maximumCostUsd * 1_000_000) / 1_000_000,
      providerCalls: 0,
    }
  }
  const directory = stateRoot(root)
  mkdirPrivate(directory)
  const lock = join(directory, 'execution.lock')
  if (existsSync(lock)) {
    const pid = z
      .object({ pid: z.number().int().positive() })
      .parse(JSON.parse(readFileSync(lock, 'utf8')) as unknown).pid
    let alive = true
    try {
      process.kill(pid, 0)
    } catch (error: unknown) {
      if (error instanceof Error && 'code' in error && error.code === 'ESRCH') alive = false
    }
    if (alive) throw new Error('Another translation process owns this content repository')
    unlinkSync(lock)
  }
  const lockFd = openSync(lock, 'wx', 0o600)
  writeFileSync(lockFd, JSON.stringify({ pid: process.pid }))
  fsyncSync(lockFd)
  closeSync(lockFd)
  let job: LocalJob | undefined
  const scope = JSON.stringify({
    action: command.action,
    article: command.article ?? null,
    force: command.force,
  })
  try {
    if (command.jobId && existsSync(join(directory, `${command.jobId}.json`))) {
      job = readJob(root, command.jobId).job
      if (
        job.sourceTree !== source.sourceTree ||
        job.budgetMicros !== Math.floor(command.budgetUsd * 1_000_000) ||
        job.contentRoot !== root ||
        job.scope !== scope
      )
        throw new Error('Resume must preserve source snapshot and authorized budget')
      if (job.reserved) {
        if (memory.has(job.reserved.key)) job.completedKeys.push(job.reserved.key)
        else job.failedKeys.push(job.reserved.key)
        job.reserved = null
      }
      job.status = 'running'
    } else {
      job = {
        id: command.jobId ?? randomUUID(),
        contentRoot: root,
        sourceCommit: source.commit,
        sourceTree: source.sourceTree,
        scope,
        budgetMicros: Math.floor(command.budgetUsd * 1_000_000),
        spentMicros: 0,
        plannedKeys: planned,
        completedKeys: [],
        failedKeys: [],
        status: 'running',
        reserved: null,
        requests: 0,
        updatedAt: new Date().toISOString(),
        error: null,
      }
    }
    const activeJob = job
    const persist = () => {
      activeJob.updatedAt = new Date().toISOString()
      atomicWrite(join(directory, `${activeJob.id}.json`), JSON.stringify(activeJob))
    }
    persist()
    atomicWrite(join(directory, 'latest.json'), JSON.stringify({ id: job.id }))
    assertMemoryDirectory(root)
    if (!existsSync(join(root, memoryManifestPath)))
      atomicWrite(
        join(root, memoryManifestPath),
        `${JSON.stringify(defaultMemoryManifest, null, 2)}\n`,
      )
    let consecutiveFailures = 0
    for (const key of job.plannedKeys) {
      if (job.completedKeys.includes(key) || job.failedKeys.includes(key)) continue
      if (existsSync(join(directory, `${job.id}.cancel`))) {
        job.status = 'cancelled'
        break
      }
      if (sourceTreeIdentity(root) !== job.sourceTree) {
        job.status = 'partial'
        job.error = 'Canonical source changed during translation'
        break
      }
      const input = request(key)
      const estimate = provider.estimate(input)
      const maximumMicros = Math.ceil(estimate.maximumCostUsd * 1_000_000)
      if (job.spentMicros + maximumMicros > job.budgetMicros) {
        job.status = 'partial'
        job.error = 'Authorized budget exhausted'
        break
      }
      job.spentMicros += maximumMicros
      job.reserved = { key, maximumMicros }
      job.requests += 1
      persist()
      try {
        const response = await provider.translate(input)
        const block = blocks.get(key)
        if (!block) throw new Error('Missing planned source')
        const entry = validateMemoryEntry(key, {
          normalizationVersion: block.normalizationVersion,
          sourceHash: block.sourceHash,
          contextFingerprint: block.contextFingerprint,
          sourceText: block.sourceText,
          translatedText: response.translatedText,
          provider: response.provider,
          model: response.model,
          usage: response.usage,
        })
        const actualMicros = Math.ceil(response.usage.costUsd * 1_000_000)
        if (actualMicros > maximumMicros)
          throw new Error('Provider usage exceeds the reserved maximum')
        const path = memoryShardPath(key)
        const absolute = join(root, path)
        const entries = existsSync(absolute)
          ? parseMemoryShard(path, readFileSync(absolute, 'utf8')).entries
          : {}
        entries[key] = entry
        const serialized = serializeMemoryShard(entries)
        if (Buffer.byteLength(serialized) > 16_000_000)
          throw new Error('Translation shard size limit reached')
        atomicWrite(absolute, serialized)
        memory.set(key, entry)
        job.spentMicros -= maximumMicros - actualMicros
        job.completedKeys.push(key)
        job.reserved = null
        consecutiveFailures = 0
        persist()
      } catch {
        job.failedKeys.push(key)
        job.reserved = null
        job.error =
          'Provider request failed validation or has uncertain billing; maximum cost retained'
        consecutiveFailures += 1
        persist()
        if (consecutiveFailures >= 5) {
          job.status = 'partial'
          break
        }
      }
      if (job.completedKeys.length % 25 === 0)
        console.log(JSON.stringify(localTranslationStatus(root, job.id)))
    }
    if (job.status === 'running') job.status = job.failedKeys.length ? 'partial' : 'completed'
    persist()
    return localTranslationStatus(root, job.id)
  } catch {
    if (job?.status === 'running') {
      job.status = 'partial'
      job.error = 'Execution interrupted; resume the same job without retrying uncertain requests'
      job.updatedAt = new Date().toISOString()
      atomicWrite(join(directory, `${job.id}.json`), JSON.stringify(job))
    }
    throw new Error('Local translation stopped safely; inspect the checkpoint before resuming')
  } finally {
    unlinkSync(lock)
  }
}

function readKey(path: string | undefined, contentRoot: string) {
  if (!path) throw new Error('Paid translation requires --key-file outside both repositories')
  const file = resolve(path)
  const canonical = realpathSync(file)
  if (canonical.startsWith(`${contentRoot}/`) || canonical.startsWith(`${process.cwd()}/`))
    throw new Error('Translation key must stay outside both repositories')
  const metadata = lstatSync(file)
  if (!metadata.isFile() || metadata.isSymbolicLink() || (metadata.mode & 0o077) !== 0)
    throw new Error('Translation key file must be a private regular file (0600)')
  try {
    return z
      .object({ apiKey: z.string().min(16).max(300) })
      .parse(JSON.parse(readFileSync(file, 'utf8')) as unknown).apiKey
  } catch {
    throw new Error(
      'Private key file must contain a valid apiKey property; contents were not logged',
    )
  }
}
