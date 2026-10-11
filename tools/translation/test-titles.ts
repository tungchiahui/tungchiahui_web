import { randomUUID } from 'node:crypto'
import { Client } from 'pg'
import { z } from 'zod'
import { RecordingContentHooks } from '../../src/content/hooks'
import { ContentIngestionRepository } from '../../src/content/ingestion'
import { runPostgresMigrations } from '../../src/database/migrate'
import { SearchIndexRepository } from '../../src/search/repository'
import {
  titleTranslationBlock,
  translatedFieldsSchema,
} from '../../src/translation/document-fields'
import {
  defaultMemoryManifest,
  type GitMemoryEntry,
  memoryEntryKey,
  memoryManifestPath,
  memoryShardPath,
  serializeMemoryShard,
} from '../../src/translation/git-memory'

export async function verifyEnglishTitles(connectionString: string) {
  const url = new URL(connectionString)
  if (url.hostname !== '127.0.0.1' || url.password !== 'local-only-postgres')
    throw new Error('Title contract requires disposable local PostgreSQL')
  const admin = new Client({ connectionString })
  await admin.connect()
  const database = `title_contract_${randomUUID().replaceAll('-', '')}`
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
  const search = new SearchIndexRepository(url.toString())
  const blog = {
    path: 'content/posts/2026-01-01-标题.md',
    contents: '---\ntitle: 主标题\npath: title-contract\n---\n\n# 正文\n\n中文内容。',
  }
  const wiki = {
    path: 'content/wiki/2026-01-01-机器人教程/0100-环境.md',
    contents: '---\ntitle: 环境配置\n---\n\n# 设置\n\n教程内容。',
  }
  const records = new Map<string, GitMemoryEntry>()
  for (const [source, target] of [
    ['主标题', 'Article title'],
    ['环境配置', 'Environment setup'],
    ['机器人教程', 'Robot tutorial'],
  ] as const) {
    const block = titleTranslationBlock(source)
    const entry: GitMemoryEntry = {
      ...block,
      translatedText: titleTranslationBlock(target).sourceText,
      provider: 'fixture',
      model: 'fixture',
      usage: { inputTokens: 1, outputTokens: 1, costUsd: 0 },
    }
    // Use only the public memory fields, not document offsets.
    records.set(memoryEntryKey(entry), {
      normalizationVersion: entry.normalizationVersion,
      sourceHash: entry.sourceHash,
      contextFingerprint: entry.contextFingerprint,
      sourceText: entry.sourceText,
      translatedText: entry.translatedText,
      provider: entry.provider,
      model: entry.model,
      usage: entry.usage,
    })
  }
  async function ingest(commit: string, files = [blog, wiki], includeMemory = true) {
    const id = randomUUID()
    await client.query(
      "INSERT INTO app.operational_jobs(id,job_type,requested_by,idempotency_key,payload) VALUES($1,'content_sync','title-contract',$2,'{}')",
      [id, `title-contract:${id}`],
    )
    const shards = Map.groupBy([...records], ([key]) => memoryShardPath(key))
    return ingestion.ingest(id, {
      sourceCommit: commit.repeat(40),
      files,
      memoryFiles: [
        { path: memoryManifestPath, contents: JSON.stringify(defaultMemoryManifest) },
        ...(includeMemory
          ? [...shards].map(([path, entries]) => ({
              path,
              contents: serializeMemoryShard(Object.fromEntries(entries)),
            }))
          : []),
      ],
    })
  }
  async function fields(path: string) {
    const result = await client.query(
      "SELECT t.translated_fields FROM app.document_translations t JOIN app.documents d ON d.id=t.document_id WHERE d.source_path=$1 AND t.locale='en-us'",
      [path],
    )
    return z.object({ translated_fields: translatedFieldsSchema }).parse(result.rows[0])
      .translated_fields
  }
  try {
    await ingest('a', [blog, wiki], false)
    hooks.calls.length = 0
    const published = await ingest('b')
    if (
      published.filesChanged !== 0 ||
      published.memory?.documentsMaterialized !== 2 ||
      hooks.calls.some((call) => call.searchLocales?.join() !== 'en-us')
    )
      throw new Error('Title-only memory update did not isolate English refresh')
    if (
      (await fields(blog.path)).title !== 'Article title' ||
      (await fields(wiki.path)).wikiGroupTitle !== 'Robot tutorial'
    )
      throw new Error('Title memory was not materialized')
    await search.reindexLocales(['zh-cn', 'zh-hk', 'zh-tw', 'en-us'])
    const english = await search.search({ locale: 'en-us', query: 'Article title' })
    if (english[0]?.title !== 'Article title' || english[0]?.matchedContext !== 'title')
      throw new Error('English title relevance failed')
    const chinese = await search.search({ locale: 'zh-cn', query: '主标题' })
    if (chinese[0]?.title !== '主标题') throw new Error('English title leaked into Chinese search')
    const noOp = await ingest('b')
    if (noOp.memory?.documentsMaterialized !== 0)
      throw new Error('Title snapshot replay rewrote materialization')
    const renamed = { ...blog, contents: blog.contents.replace('title: 主标题', 'title: 最新标题') }
    await ingest('c', [renamed, wiki])
    if ((await fields(blog.path)).title !== undefined)
      throw new Error('Changed title retained stale English')
    const body = await client.query('SELECT raw_markdown FROM app.documents WHERE source_path=$1', [
      blog.path,
    ])
    if (!String(body.rows[0]?.raw_markdown).includes('# 正文'))
      throw new Error('Title change rewrote author body')
    await ingest('d', [renamed, wiki], false)
    if (Object.keys(await fields(wiki.path)).length)
      throw new Error('Deleted title memory remained hidden in database')
    await client.query('SET ROLE site_app')
    await client.query('SELECT title,raw_markdown FROM app.documents')
    let denied = false
    try {
      await client.query('SELECT * FROM app.document_translation_fields')
    } catch {
      denied = true
    }
    if (!denied) throw new Error('Public role can read worker-only field mappings')
    await client.query('RESET ROLE')
    console.log(
      'English title contract: PASS (Git import, incremental fields, no-op, title changes, deletion, search relevance/locales, least privilege)',
    )
  } finally {
    await ingestion.close()
    await search.close()
    await client.end()
    await admin.query(`DROP DATABASE ${database}`)
    await admin.end()
  }
}
