import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { RecordingContentHooks } from '../../src/content/hooks'
import {
  ContentIngestionRepository,
  ContentMemoryValidationError,
} from '../../src/content/ingestion'
import { runPostgresMigrations } from '../../src/database/migrate'
import {
  defaultMemoryManifest,
  memoryEntryKey,
  memoryManifestPath,
  memoryShardPath,
  serializeMemoryShard,
} from '../../src/translation/git-memory'
import { segmentMarkdownForTranslation } from '../../src/translation/segmentation'

export async function verifyGitMemoryImport(connectionString: string) {
  const url = new URL(connectionString)
  if (url.hostname !== '127.0.0.1' || url.password !== 'local-only-postgres')
    throw new Error('Git memory contract requires the disposable local PostgreSQL fixture')
  const admin = new Client({ connectionString })
  await admin.connect()
  const database = `git_memory_${randomUUID().replaceAll('-', '')}`
  await admin.query(`CREATE DATABASE ${database}`)
  url.pathname = `/${database}`
  await runPostgresMigrations(url.toString(), {
    repositoryRoot: process.cwd(),
    hasFreshRecoverableBackup: true,
    hasTechV3CompatiblePreviousRelease: true,
  })
  const client = new Client({ connectionString: url.toString() })
  await client.connect()
  const hooks = new RecordingContentHooks()
  const ingestion = new ContentIngestionRepository(url.toString(), hooks)
  const markdown =
    '---\ntitle: 记忆测试\npath: git-memory-contract\n---\n\n# 当前标题\n\n新的正文。\n'
  const file = { path: 'content/posts/2026-01-01-记忆测试.md', contents: markdown }
  const manifest = { path: memoryManifestPath, contents: JSON.stringify(defaultMemoryManifest) }
  const block = segmentMarkdownForTranslation('# 当前标题')[0]
  if (!block) throw new Error('Missing Git memory fixture')
  const value = {
    normalizationVersion: block.normalizationVersion,
    sourceHash: block.sourceHash,
    contextFingerprint: block.contextFingerprint,
    sourceText: block.sourceText,
    translatedText: '# Current heading',
    provider: 'fixture',
    model: 'fixture',
    usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
  }
  const key = memoryEntryKey(value)
  const shard = { path: memoryShardPath(key), contents: serializeMemoryShard({ [key]: value }) }
  async function ingest(
    commit: string,
    memoryFiles: { path: string; contents: string }[],
    contents = markdown,
  ) {
    const id = randomUUID()
    await client.query(
      "INSERT INTO app.operational_jobs (id,job_type,requested_by,idempotency_key,payload) VALUES ($1,'content_sync','git-memory-fixture',$2,'{}')",
      [id, `memory-fixture:${id}`],
    )
    return ingestion.ingest(id, {
      sourceCommit: commit.repeat(40),
      files: [{ ...file, contents }],
      memoryFiles,
      filesFetched: 0,
    })
  }
  try {
    await ingest('a', [manifest])
    hooks.calls.length = 0
    const translated = await ingest('b', [manifest, shard])
    if (
      translated.filesChanged !== 0 ||
      translated.memory?.documentsMaterialized !== 1 ||
      translated.memory.entriesChanged !== 1 ||
      hooks.calls.some((input) => input.searchLocales?.join() !== 'en-us')
    )
      throw new Error('Memory-only update did not isolate English materialization and hooks')
    const output = await client.query<{ translated_markdown: string; generated_at: Date }>(
      "SELECT translated_markdown,generated_at FROM app.document_translations WHERE locale='en-us'",
    )
    if (
      !output.rows[0]?.translated_markdown.includes('# Current heading') ||
      !output.rows[0].translated_markdown.includes('新的正文。')
    )
      throw new Error('Imported and fallback blocks were not assembled correctly')
    hooks.calls.length = 0
    const repeated = await ingest('b', [manifest, shard])
    if (
      repeated.memory?.entriesChanged !== 0 ||
      repeated.memory.documentsMaterialized !== 0 ||
      hooks.calls.length !== 0
    )
      throw new Error('Same Git snapshot was not a no-op')
    const after = await client.query<{ generated_at: Date }>(
      "SELECT generated_at FROM app.document_translations WHERE locale='en-us'",
    )
    if (after.rows[0]?.generated_at.getTime() !== output.rows[0].generated_at.getTime())
      throw new Error('No-op changed the English generation timestamp')
    const removed = await ingest('c', [manifest])
    if (removed.memory?.documentsMaterialized !== 1)
      throw new Error('Deleted memory did not rematerialize affected content')
    const fallback = await client.query<{ translated_markdown: string }>(
      "SELECT translated_markdown FROM app.document_translations WHERE locale='en-us'",
    )
    if (!fallback.rows[0]?.translated_markdown.includes('# 当前标题'))
      throw new Error('Removed Git memory remained a hidden database translation')
    let rejected = false
    try {
      await ingest(
        'd',
        [manifest, { ...shard, contents: '{invalid' }],
        markdown.replace('新的正文', '最新中文'),
      )
    } catch (error: unknown) {
      rejected = error instanceof ContentMemoryValidationError
    }
    const canonical = await client.query<{ raw_markdown: string }>(
      'SELECT raw_markdown FROM app.documents',
    )
    if (!rejected || !canonical.rows[0]?.raw_markdown.includes('最新中文'))
      throw new Error('Invalid memory was not reported while publishing canonical content')
    const cache = await ingestion.readSourceCache()
    if (
      !cache.files.some((source) => source.path === file.path) ||
      cache.sourceCommit !== 'd'.repeat(40)
    )
      throw new Error('Content snapshot cache or lineage was not persisted')
    console.log(
      'Git translation memory import: PASS (incremental, idempotent, deletion, mixed fallback, invalid-memory isolation)',
    )
  } finally {
    await ingestion.close()
    await client.end()
    await admin.query(`DROP DATABASE ${database}`)
    await admin.end()
  }
}
