import { execFileSync } from 'node:child_process'
import { createHash, randomUUID } from 'node:crypto'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { GitHubContentSource } from '../../src/content/github-source'
import { pathsForRevalidation } from '../../src/content/revalidation'
import {
  defaultMemoryManifest,
  gitBlobSha,
  memoryEntryKey,
  memoryShardPath,
  parseMemoryShard,
  serializeMemoryShard,
  validateMemoryEntry,
} from '../../src/translation/git-memory'
import { createValidatedPaidTranslationProvider } from '../../src/translation/provider'
import { segmentMarkdownForTranslation } from '../../src/translation/segmentation'
import { parseLocalTranslationCommand } from '../../tools/translation/local-command'
import {
  cancelLocalTranslation,
  readLocalMemory,
  runLocalTranslation,
} from '../../tools/translation/local-memory'

function entry(source: string, target: string) {
  const block = segmentMarkdownForTranslation(source)[0]
  if (!block) throw new Error('Missing fixture block')
  return {
    normalizationVersion: block.normalizationVersion,
    sourceHash: block.sourceHash,
    contextFingerprint: block.contextFingerprint,
    sourceText: source,
    translatedText: target,
    provider: 'test',
    model: 'test',
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.004 },
  }
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'git-memory-unit-'))
  mkdirSync(join(root, 'content/posts'), { recursive: true })
  writeFileSync(
    join(root, 'content/posts/2026-01-01-标题.md'),
    '---\ntitle: 标题\n---\n\n# 标题\n\n正文。\n',
  )
  const git = (args: string[]) => execFileSync('git', ['-C', root, ...args], { stdio: 'ignore' })
  git(['init'])
  git(['config', 'user.email', 'test@example.invalid'])
  git(['config', 'user.name', 'Test'])
  git(['add', 'content'])
  git(['commit', '-m', 'fixture'])
  return {
    root,
    cleanup() {
      rmSync(root, { recursive: true, force: true })
      const id = createHash('sha256').update(root).digest('hex')
      rmSync(join(homedir(), '.local/state/tungchiahui/translation', id), {
        recursive: true,
        force: true,
      })
    },
  }
}

describe('Git-authoritative block memory', () => {
  it('uses stable sharding and rejects incorrect identity, formula and link changes', () => {
    const value = entry(
      '保留 $x+y$ 与 [文档](https://example.test)。',
      'Keep $x+y$ and [documentation](https://example.test).',
    )
    const key = memoryEntryKey(value)
    const serialized = serializeMemoryShard({ [key]: value })
    expect(parseMemoryShard(memoryShardPath(key), serialized).entries[key]).toEqual(value)
    expect(() =>
      validateMemoryEntry(key, {
        ...value,
        translatedText: value.translatedText.replace('$x+y$', '$changed$'),
      }),
    ).toThrow()
    expect(() =>
      validateMemoryEntry(key, {
        ...value,
        translatedText: value.translatedText.replace('example.test', 'evil.test'),
      }),
    ).toThrow()
    expect(() => parseMemoryShard(memoryShardPath('f'.repeat(64)), serialized)).toThrow()
    expect(serializeMemoryShard({ [key]: value })).toBe(serialized)
  })
  it('rejects metadata outside PostgreSQL bounds before materializing canonical content', () => {
    const value = entry('当前正文。', 'Current body.')
    const key = memoryEntryKey(value)
    for (const input of [
      { ...value, usage: { ...value.usage, inputTokens: 2_147_483_648 } },
      { ...value, usage: { ...value.usage, costUsd: 1_000_000 } },
      { ...value, translatedText: 'Current\0 body.' },
      { ...value, provider: 'test\0provider' },
    ])
      expect(() => validateMemoryEntry(key, input)).toThrow()
  })
  it('permits ordinary English compounds while preserving every original identifier', () => {
    const good = entry('实时控制，例如快速执行。', 'Use real-time control, e.g. execute quickly.')
    expect(validateMemoryEntry(memoryEntryKey(good), good)).toEqual(good)
    const unsafe = entry('保留 custom-id。', 'Replace with another-id.')
    expect(() => validateMemoryEntry(memoryEntryKey(unsafe), unsafe)).toThrow()
  })
  it('rejects changing ordered-list and task-list semantics', () => {
    const ordered = entry('1. 当前步骤', '- Current step')
    expect(() => validateMemoryEntry(memoryEntryKey(ordered), ordered)).toThrow()
    const task = entry('- [ ] 当前任务', '- [x] Current task')
    expect(() => validateMemoryEntry(memoryEntryKey(task), task)).toThrow()
  })
  it('fetches only changed blobs and rejects backwards Git history', async () => {
    const markdown = '---\ntitle: 标题\n---\n\n正文。'
    const manifest = JSON.stringify(defaultMemoryManifest)
    let blobsFetched = 0
    const source = new GitHubContentSource({
      repository: 'owner/content',
      apiBaseUrl: 'https://github.invalid',
      readCache: async () => ({
        sourceCommit: 'a'.repeat(40),
        files: [
          {
            path: 'content/posts/2026-01-01-标题.md',
            contents: markdown,
            blobSha: gitBlobSha(markdown),
          },
        ],
      }),
      fetchImplementation: async (url) => {
        const path = new URL(String(url)).pathname
        if (path.includes('/compare/'))
          return Response.json({ status: path.endsWith('b'.repeat(40)) ? 'ahead' : 'behind' })
        if (path.includes('/trees/'))
          return Response.json({
            tree: [
              { type: 'blob', path: 'content/posts/2026-01-01-标题.md', sha: gitBlobSha(markdown) },
              { type: 'blob', path: 'translations/en-us/manifest.json', sha: gitBlobSha(manifest) },
            ],
          })
        blobsFetched += 1
        return Response.json({
          sha: gitBlobSha(manifest),
          encoding: 'base64',
          content: Buffer.from(manifest).toString('base64'),
        })
      },
    })
    const snapshot = await source.fetchSnapshot('b'.repeat(40))
    expect(snapshot.filesFetched).toBe(1)
    expect(snapshot.memoryFiles).toHaveLength(1)
    expect(blobsFetched).toBe(1)
    await expect(source.fetchSnapshot('c'.repeat(40))).rejects.toThrow('Git history')
  })
  it('revalidates only English page paths for a memory-only update', () => {
    const paths = pathsForRevalidation({
      sourceCommit: 'a'.repeat(40),
      searchLocales: ['en-us'],
      changes: [
        {
          documentId: '00000000-0000-4000-8000-000000000001',
          routePath: '/blog/test',
          sourceHash: 'a'.repeat(64),
          type: 'modified',
        },
      ],
      translation: {
        fallbackSegments: 0,
        memoryHits: 1,
        pendingSegments: 0,
        translatedSegments: 1,
      },
    })
    expect(paths).toContain('/en-us/blog/test')
    expect(paths.every((path) => path.startsWith('/en-us'))).toBe(true)
  })
  it('enforces explicit CLI budget and retranslation confirmation', () => {
    expect(() =>
      parseLocalTranslationCommand(['pending', '--content-root', '/tmp/example', '--execute']),
    ).toThrow('explicit budget')
    expect(() =>
      parseLocalTranslationCommand(['all', '--content-root', '/tmp/example', '--force']),
    ).toThrow('RETRANSLATE')
  })
  it('settles durable local reservations and reuses committed memory without new calls', async () => {
    const test = fixture()
    let calls = 0
    const provider = createValidatedPaidTranslationProvider({
      estimate: () => ({ estimatedInputTokens: 1, estimatedOutputTokens: 1, maximumCostUsd: 0.01 }),
      async translate(request) {
        calls += 1
        return {
          provider: 'test',
          model: 'test',
          translatedText: request.sourceText.startsWith('#') ? '# Title' : 'Body.',
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.004 },
        }
      },
    })
    try {
      const dry = await runLocalTranslation(
        parseLocalTranslationCommand(['pending', '--content-root', test.root, '--dry-run']),
        provider,
      )
      expect(dry).toMatchObject({ pendingBlocks: 2, providerCalls: 0 })
      expect(calls).toBe(0)
      const result = await runLocalTranslation(
        parseLocalTranslationCommand([
          'pending',
          '--content-root',
          test.root,
          '--execute',
          '--budget-usd',
          '0.014',
        ]),
        provider,
      )
      expect(result).toMatchObject({
        status: 'completed',
        completedBlocks: 2,
        accountedCostUsd: 0.008,
      })
      expect(readLocalMemory(test.root).size).toBe(2)
      const again = await runLocalTranslation(
        parseLocalTranslationCommand(['pending', '--content-root', test.root, '--dry-run']),
        provider,
      )
      expect(again).toMatchObject({ pendingBlocks: 0, reusedBlocks: 2 })
      expect(calls).toBe(2)
    } finally {
      test.cleanup()
    }
  })
  it('retains uncertain costs and stops before exceeding the authorized budget', async () => {
    const test = fixture()
    const provider = createValidatedPaidTranslationProvider({
      estimate: () => ({ estimatedInputTokens: 1, estimatedOutputTokens: 1, maximumCostUsd: 0.01 }),
      translate: async () => {
        throw new Error('Unknown paid result')
      },
    })
    try {
      const result = await runLocalTranslation(
        parseLocalTranslationCommand([
          'pending',
          '--content-root',
          test.root,
          '--execute',
          '--budget-usd',
          '0.01',
        ]),
        provider,
      )
      expect(result).toMatchObject({
        status: 'partial',
        failedBlocks: 1,
        accountedCostUsd: 0.01,
        requests: 1,
      })
      expect(readLocalMemory(test.root).size).toBe(0)
      expect(
        readFileSync(join(test.root, 'translations/en-us/manifest.json'), 'utf8'),
      ).not.toContain('apiKey')
    } finally {
      test.cleanup()
    }
  })
  it('does not resend a crash-reserved request when resuming its durable budget', async () => {
    const test = fixture()
    const id = randomUUID()
    let calls = 0
    const provider = createValidatedPaidTranslationProvider({
      estimate: () => ({ estimatedInputTokens: 1, estimatedOutputTokens: 1, maximumCostUsd: 0.01 }),
      translate: async () => {
        calls += 1
        throw new Error('Unknown result')
      },
    })
    const args = [
      'pending',
      '--content-root',
      test.root,
      '--execute',
      '--budget-usd',
      '0.01',
      '--job-id',
      id,
    ]
    try {
      await runLocalTranslation(parseLocalTranslationCommand(args), provider)
      const state = join(
        homedir(),
        '.local/state/tungchiahui/translation',
        createHash('sha256').update(test.root).digest('hex'),
        `${id}.json`,
      )
      const checkpoint = JSON.parse(readFileSync(state, 'utf8')) as {
        failedKeys: string[]
        reserved: { key: string; maximumMicros: number } | null
        status: string
      }
      const key = checkpoint.failedKeys[0]
      if (!key) throw new Error('Missing reserved fixture')
      checkpoint.failedKeys = []
      checkpoint.reserved = { key, maximumMicros: 10_000 }
      checkpoint.status = 'running'
      writeFileSync(state, JSON.stringify(checkpoint))
      const resumed = await runLocalTranslation(parseLocalTranslationCommand(args), provider)
      expect(resumed).toMatchObject({
        status: 'partial',
        requests: 1,
        failedBlocks: 1,
        accountedCostUsd: 0.01,
      })
      expect(calls).toBe(1)
      await expect(
        runLocalTranslation(
          parseLocalTranslationCommand(args.map((arg) => (arg === 'pending' ? 'all' : arg))),
          provider,
        ),
      ).rejects.toThrow('stopped safely')
      expect(calls).toBe(1)
    } finally {
      test.cleanup()
    }
  })
  it('honours cancellation between calls and keeps the successful memory', async () => {
    const test = fixture()
    const id = randomUUID()
    let calls = 0
    const provider = createValidatedPaidTranslationProvider({
      estimate: () => ({ estimatedInputTokens: 1, estimatedOutputTokens: 1, maximumCostUsd: 0.01 }),
      async translate(request) {
        calls += 1
        cancelLocalTranslation(test.root, id)
        return {
          provider: 'test',
          model: 'test',
          translatedText: request.sourceText.startsWith('#') ? '# Title' : 'Body.',
          usage: { inputTokens: 1, outputTokens: 1, costUsd: 0.004 },
        }
      },
    })
    try {
      const result = await runLocalTranslation(
        parseLocalTranslationCommand([
          'pending',
          '--content-root',
          test.root,
          '--execute',
          '--budget-usd',
          '0.1',
          '--job-id',
          id,
        ]),
        provider,
      )
      expect(result).toMatchObject({ status: 'cancelled', completedBlocks: 1, requests: 1 })
      expect(calls).toBe(1)
      expect(readLocalMemory(test.root).size).toBe(1)
    } finally {
      test.cleanup()
    }
  })
})
