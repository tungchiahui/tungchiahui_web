import { Client } from 'pg'
import { z } from 'zod'
import type { ContentSnapshot, ReadonlyContentSource } from '../../src/content/contracts'
import { RecordingContentHooks } from '../../src/content/hooks'
import { ContentIngestionRepository } from '../../src/content/ingestion'
import { ContentJobRepository } from '../../src/content/jobs'
import { ContentWorker } from '../../src/content/worker'
import { ApplicationJobRepository } from '../../src/control-plane/application-jobs'
import type { ActorIdentity } from '../../src/control-plane/contracts'
import { TranslationMemoryRepository } from '../../src/translation/repository'

const commitA = 'a'.repeat(40)
const commitB = 'b'.repeat(40)
const commitC = 'c'.repeat(40)
const commitD = 'd'.repeat(40)
const commitE = 'e'.repeat(40)

const actor: ActorIdentity = {
  capabilities: ['application-job:create'],
  id: 'phase5-integration',
  kind: 'service',
}

function markdown(frontmatter: readonly string[], body: string) {
  return `---\n${frontmatter.join('\n')}\n---\n\n${body}\n`
}

const snapshotAFiles = [
  {
    path: 'content/posts/2026-01-06-新博客启用.md',
    contents: markdown(
      ['title: 新博客启用', 'date: 2026-01-06', 'path: newblogenable!'],
      '# 新博客启用\n\n这是当前段落。\n\n这个区块保持待翻译。',
    ),
  },
  {
    path: 'content/posts/2026-01-14-W311MI_AX300驱动.md',
    contents: markdown(
      ['title: W311MI AX300 驱动', 'date: 2026-01-14', 'path: w311mi_ax300'],
      '# 驱动',
    ),
  },
  {
    path: 'content/posts/2026-02-09-新的todolist界面.md',
    contents: markdown(
      [
        'title: 新的 todolist 界面',
        'date: 2026-02-09',
        'path: newtodolist',
        'description: Legacy four-key frontmatter fixture',
      ],
      '# Todo',
    ),
  },
  {
    path: 'content/posts/2026-07-21-VSCode任务栏启动Codex插件打不开.md',
    contents: markdown(
      [
        'title: VSCode 任务栏启动 Codex 插件打不开',
        'date: 2026-07-21',
        'path: vscode-taskbar-codex-fix',
      ],
      '# Codex',
    ),
  },
  {
    path: 'content/wiki/2024-10-03-Docker教程/index.md',
    contents: markdown(['title: Docker 教程'], '# Docker'),
  },
  {
    path: 'content/wiki/2023-10-05-Cplusplus教学/0100-C++开发环境搭建与测试.md',
    contents: markdown(
      ['title: C++ 开发环境搭建与测试'],
      '# C++ 与 Unicode 渲染\n\n正文保护 `ROS2_Control` 与 https://example.com/id。\n\n## 代码示例\n\n```cpp\nint main() { return 0; }\n```\n\n## 资源与链接\n\n![本地 S3Mock Fixture](/api/assets/fixtures/phase-6.svg)\n\n[ROS2 文档](/docs/ros2/core/index.html)',
    ),
  },
  {
    path: 'content/wiki/2021-09-16-OpenWrt编译教学/0500-其他参考资料添加USB和硬盘格式还有网卡教程：.md',
    contents: markdown(['title: 其他参考资料'], '# OpenWrt'),
  },
] as const

function snapshot(
  sourceCommit: string,
  files: readonly Readonly<{ contents: string; path: string }>[],
) {
  return { files: [...files], sourceCommit }
}

const snapshotA = snapshot(commitA, snapshotAFiles)
export const phase5FinalSnapshot = snapshot(commitB, [
  {
    ...snapshotAFiles[0],
    contents: markdown(
      ['title: 新博客启用', 'date: 2026-01-06', 'path: newblogenable!'],
      '# 新博客启用\n\nModified at commit B.',
    ),
  },
  {
    ...snapshotAFiles[1],
    contents: markdown(
      ['title: W311MI AX300 驱动', 'date: 2026-01-14', 'path: w311mi_ax300'],
      '# 新博客启用',
    ),
  },
  snapshotAFiles[2],
  snapshotAFiles[3],
  snapshotAFiles[4],
  {
    ...snapshotAFiles[5],
    path: 'content/wiki/2023-10-05-Cplusplus教学/0200-C++开发环境搭建与测试.md',
  },
  {
    path: 'content/wiki/2023-12-30-ros2-tutorial/1300-0100-0100-Boost.Aiso.md',
    contents: markdown(['title: Boost Aiso'], '# Boost'),
  },
])
const snapshotC = snapshot(commitC, [
  ...phase5FinalSnapshot.files,
  {
    path: 'content/wiki/重复 标题/index.md',
    contents: markdown(['title: 重复 标题'], '# First'),
  },
  {
    path: 'content/wiki/重复-标题/index.md',
    contents: markdown(['title: 重复-标题'], '# Second'),
  },
])
const snapshotD = snapshot(commitD, phase5FinalSnapshot.files)

class FixtureContentSource implements ReadonlyContentSource {
  readonly #snapshots: ReadonlyMap<string, ContentSnapshot>
  readonly #transientFailures = new Map<string, number>()

  constructor(snapshots: ReadonlyMap<string, ContentSnapshot>) {
    this.#snapshots = snapshots
  }

  failNext(sourceCommit: string) {
    this.#transientFailures.set(sourceCommit, (this.#transientFailures.get(sourceCommit) ?? 0) + 1)
  }

  async fetchSnapshot(sourceCommit: string) {
    const failures = this.#transientFailures.get(sourceCommit) ?? 0
    if (failures > 0) {
      this.#transientFailures.set(sourceCommit, failures - 1)
      throw new Error('Injected transient read-only GitHub failure')
    }
    const result = this.#snapshots.get(sourceCommit)
    if (!result) throw new Error(`Missing fixture snapshot ${sourceCommit}`)
    return result
  }
}

async function createJob(
  repository: ApplicationJobRepository,
  sourceCommit: string,
  suffix: string,
) {
  return repository.createJob(
    { jobType: 'content_sync', payload: { sourceCommit } },
    actor,
    `phase5:content-sync:${suffix}`,
  )
}

const jobStateSchema = z.object({
  attempt_count: z.number().int(),
  progress: z.record(z.string(), z.unknown()),
  status: z.enum(['queued', 'running', 'retry_wait', 'completed', 'failed', 'cancelled']),
})

export async function verifyPhase5Ingestion(connectionString: string, firstJobId: string) {
  const hooks = new RecordingContentHooks()
  const ingestion = new ContentIngestionRepository(connectionString, hooks)
  const jobs = new ContentJobRepository(connectionString)
  const jobCreator = new ApplicationJobRepository(connectionString)
  const translationMemory = new TranslationMemoryRepository(connectionString)
  const source = new FixtureContentSource(
    new Map([
      [commitA, snapshotA],
      [commitB, phase5FinalSnapshot],
      [commitC, snapshotC],
      [commitD, snapshotD],
    ]),
  )
  const worker = new ContentWorker({
    contentSource: source,
    ingestion,
    jobs,
    retryDelayMilliseconds: 0,
    workerId: 'phase5-integration-worker',
  })
  const client = new Client({ connectionString })
  await client.connect()

  try {
    const first = await worker.runOnce()
    if (!first.claimed || !first.completed || first.jobId !== firstJobId) {
      throw new Error('content-worker did not claim and complete the durable control-api job')
    }
    if (first.result.filesSeen !== snapshotA.files.length || hooks.calls.length !== 3) {
      throw new Error('Initial ingestion did not materialize all representative Legacy fixtures')
    }
    if (
      first.result.translation.pendingSegments === 0 ||
      first.result.translation.fallbackSegments !== first.result.translation.pendingSegments ||
      first.result.translation.memoryHits !== 0
    ) {
      throw new Error('Initial English backfill did not expose pending/fallback metrics')
    }
    const englishBackfill = await client.query<{
      count: string
      current: boolean
      pending_segment_count: number
      translated_markdown: string
    }>(`SELECT count(*) OVER () AS count,
              translation.source_hash = document.source_hash AS current,
              translation.pending_segment_count,
              translation.translated_markdown
         FROM app.documents document
         JOIN app.document_translations translation ON translation.document_id = document.id
        WHERE NOT document.is_deleted AND translation.locale = 'en-us'`)
    if (
      englishBackfill.rows.length !== snapshotA.files.length ||
      englishBackfill.rows.some((row) => !row.current || row.pending_segment_count < 1)
    ) {
      throw new Error('Safe Phase 8 backfill did not bind every English row to current zh-CN')
    }
    const initialEnglishBlog = englishBackfill.rows.find((row) =>
      row.translated_markdown.includes('# 新博客启用'),
    )
    if (!initialEnglishBlog?.translated_markdown.includes('这是当前段落。')) {
      throw new Error('Pending English blocks did not render the latest canonical zh-CN fallback')
    }
    const activeA = await client.query<{ count: string }>(
      'SELECT count(*) FROM app.documents WHERE NOT is_deleted',
    )
    if (Number(activeA.rows[0]?.count) !== snapshotA.files.length) {
      throw new Error('Initial ingestion left an unexpected active document count')
    }
    const materializations = await client.query<{
      generated_at: Date
      locale: 'zh-hk' | 'zh-tw'
      route_path: string
      translated_markdown: string
      translation_version: number
    }>(`SELECT d.route_path,
              t.locale,
              t.translated_markdown,
              t.translation_version,
              t.generated_at
         FROM app.documents d
         JOIN app.document_translations t ON t.document_id = d.id
        WHERE NOT d.is_deleted AND t.locale IN ('zh-hk', 'zh-tw')
        ORDER BY d.route_path, t.locale`)
    if (materializations.rows.length !== snapshotA.files.length * 2) {
      throw new Error('OpenCC ingestion did not materialize both deterministic content locales')
    }
    const hongKongBlog = materializations.rows.find(
      (row) => row.route_path === '/blog/newblogenable!' && row.locale === 'zh-hk',
    )
    const taiwanBlog = materializations.rows.find(
      (row) => row.route_path === '/blog/newblogenable!' && row.locale === 'zh-tw',
    )
    if (
      !hongKongBlog?.translated_markdown.includes('# 新網誌啓用') ||
      !taiwanBlog?.translated_markdown.includes('# 新部落格啟用') ||
      materializations.rows.some((row) => row.translation_version !== 1)
    ) {
      throw new Error('Versioned OpenCC glossary materialization returned unexpected output')
    }
    const protectedMarkdown = materializations.rows.find(
      (row) =>
        row.route_path ===
          '/wiki/2023-10-05-cplusplus-jiao-xue/0100-c-kai-fa-huan-jing-da-jian-yu-ce-shi' &&
        row.locale === 'zh-tw',
    )?.translated_markdown
    if (
      !protectedMarkdown?.includes('title: C++ 开发环境搭建与测试') ||
      !protectedMarkdown.includes('`ROS2_Control`') ||
      !protectedMarkdown.includes('https://example.com/id')
    ) {
      throw new Error('OpenCC materialization changed protected Markdown syntax')
    }
    const materializationTimestamps = new Map(
      materializations.rows.map((row) => [
        `${row.route_path}:${row.locale}`,
        row.generated_at.getTime(),
      ]),
    )
    const alias = await client.query<{ approval_reference: string; created_at: Date }>(
      "SELECT approval_reference, created_at FROM app.content_aliases WHERE alias_path = '/wiki/docker-tutorial'",
    )
    if (alias.rows.length !== 1 || !alias.rows[0]?.approval_reference.includes('Phase 0')) {
      throw new Error('Approved Legacy alias was not linked to the materialized Wiki document')
    }

    await createJob(jobCreator, commitA, 'replay')
    const replay = await worker.runOnce()
    if (!replay.claimed || !replay.completed || replay.result.filesChanged !== 0) {
      throw new Error('Same-commit replay was not an idempotent content no-op')
    }
    if (hooks.calls.length !== 3) {
      throw new Error(
        'Same-commit replay emitted duplicate translation/search/revalidation effects',
      )
    }
    const segmentCountBeforeReuse = await client.query<{ count: string }>(
      "SELECT count(*) FROM app.translation_segments WHERE locale = 'en-us'",
    )
    const mappingCountBeforeReuse = await client.query<{ count: string }>(
      "SELECT count(*) FROM app.document_translation_segments WHERE locale = 'en-us'",
    )
    await client.query(
      `UPDATE app.translation_segments segment
          SET translated_text = CASE segment.source_text
                WHEN '# 新博客启用' THEN '# New blog enabled'
                WHEN '这是当前段落。' THEN 'This is the current paragraph.'
              END,
              status = 'reviewed',
              provider = 'phase8-test-fixture',
              model = 'no-provider-call',
              updated_at = now()
         FROM app.document_translation_segments mapping
         JOIN app.documents document ON document.id = mapping.document_id
        WHERE mapping.segment_id = segment.id
          AND document.route_path = '/blog/newblogenable!'
          AND segment.source_text IN ('# 新博客启用', '这是当前段落。')`,
    )
    await createJob(jobCreator, commitA, 'translation-memory-reuse')
    const reused = await worker.runOnce()
    if (
      !reused.claimed ||
      !reused.completed ||
      reused.result.translation.memoryHits < 2 ||
      Number(hooks.calls.length) !== 6
    ) {
      throw new Error('Reviewed Translation Memory blocks were not reused deterministically')
    }
    const translatedBlog = await client.query<{
      fallback_segment_count: number
      translated_markdown: string
      translated_segment_count: number
    }>(`SELECT translation.translated_markdown,
              translation.fallback_segment_count,
              translation.translated_segment_count
         FROM app.document_translations translation
         JOIN app.documents document ON document.id = translation.document_id
        WHERE document.route_path = '/blog/newblogenable!'
          AND translation.locale = 'en-us'`)
    if (
      translatedBlog.rows[0]?.fallback_segment_count !== 1 ||
      translatedBlog.rows[0]?.translated_segment_count !== 2 ||
      !translatedBlog.rows[0]?.translated_markdown.includes('# New blog enabled') ||
      !translatedBlog.rows[0]?.translated_markdown.includes('This is the current paragraph.') ||
      !translatedBlog.rows[0]?.translated_markdown.includes('这个区块保持待翻译。')
    ) {
      throw new Error('English materialization did not combine reviewed Translation Memory blocks')
    }
    await createJob(jobCreator, commitA, 'translation-memory-idempotent')
    const memoryReplay = await worker.runOnce()
    const segmentCountAfterReuse = await client.query<{ count: string }>(
      "SELECT count(*) FROM app.translation_segments WHERE locale = 'en-us'",
    )
    const mappingCountAfterReuse = await client.query<{ count: string }>(
      "SELECT count(*) FROM app.document_translation_segments WHERE locale = 'en-us'",
    )
    if (
      !memoryReplay.claimed ||
      !memoryReplay.completed ||
      memoryReplay.result.changes.length !== 0 ||
      Number(hooks.calls.length) !== 6 ||
      segmentCountAfterReuse.rows[0]?.count !== segmentCountBeforeReuse.rows[0]?.count ||
      mappingCountAfterReuse.rows[0]?.count !== mappingCountBeforeReuse.rows[0]?.count
    ) {
      throw new Error('Translation Memory replay duplicated rows, mappings, or downstream effects')
    }
    const replayedMaterializations = await client.query<{
      generated_at: Date
      locale: 'zh-hk' | 'zh-tw'
      route_path: string
    }>(`SELECT d.route_path, t.locale, t.generated_at
         FROM app.documents d
         JOIN app.document_translations t ON t.document_id = d.id
        WHERE NOT d.is_deleted AND t.locale IN ('zh-hk', 'zh-tw')`)
    if (
      replayedMaterializations.rows.some(
        (row) =>
          materializationTimestamps.get(`${row.route_path}:${row.locale}`) !==
          row.generated_at.getTime(),
      )
    ) {
      throw new Error('Same-commit replay rewrote unchanged OpenCC materialization')
    }
    const replayedAlias = await client.query<{ created_at: Date }>(
      "SELECT created_at FROM app.content_aliases WHERE alias_path = '/wiki/docker-tutorial'",
    )
    if (replayedAlias.rows[0]?.created_at.getTime() !== alias.rows[0]?.created_at.getTime()) {
      throw new Error('Same-commit replay rewrote an unchanged approved alias')
    }

    const movedBefore = await client.query<{ id: string }>(
      "SELECT id FROM app.documents WHERE source_path = 'content/wiki/2023-10-05-Cplusplus教学/0100-C++开发环境搭建与测试.md'",
    )
    await createJob(jobCreator, commitB, 'delta')
    const delta = await worker.runOnce()
    if (
      !delta.claimed ||
      !delta.completed ||
      delta.result.filesChanged !== 4 ||
      delta.result.filesDeleted !== 1
    ) {
      throw new Error('Add/modify/delete/move reconciliation returned unexpected counts')
    }
    const movedAfter = await client.query<{ id: string }>(
      "SELECT id FROM app.documents WHERE source_path = 'content/wiki/2023-10-05-Cplusplus教学/0200-C++开发环境搭建与测试.md' AND NOT is_deleted",
    )
    if (!movedBefore.rows[0] || movedBefore.rows[0].id !== movedAfter.rows[0]?.id) {
      throw new Error('Safe content-hash move did not preserve internal document identity')
    }
    const globalReuse = await client.query<{
      translated_markdown: string
      translation_memory_hits: number
    }>(`SELECT translation.translated_markdown, translation.translation_memory_hits
         FROM app.document_translations translation
         JOIN app.documents document ON document.id = translation.document_id
        WHERE document.route_path = '/blog/w311mi_ax300'
          AND translation.locale = 'en-us'`)
    if (
      globalReuse.rows[0]?.translation_memory_hits !== 1 ||
      !globalReuse.rows[0]?.translated_markdown.includes('# New blog enabled')
    ) {
      throw new Error('Unchanged semantic block was not safely reused across documents')
    }
    const mixedEnglish = await client.query<{
      fallback_segment_count: number
      pending_segment_count: number
      translated_markdown: string
      translation_memory_hits: number
    }>(`SELECT translation.translated_markdown,
              translation.pending_segment_count,
              translation.fallback_segment_count,
              translation.translation_memory_hits
         FROM app.document_translations translation
         JOIN app.documents document ON document.id = translation.document_id
        WHERE document.route_path = '/blog/newblogenable!'
          AND translation.locale = 'en-us'`)
    if (
      mixedEnglish.rows[0]?.pending_segment_count !== 1 ||
      mixedEnglish.rows[0]?.fallback_segment_count !== 1 ||
      mixedEnglish.rows[0]?.translation_memory_hits !== 1 ||
      !mixedEnglish.rows[0]?.translated_markdown.includes('# New blog enabled') ||
      !mixedEnglish.rows[0]?.translated_markdown.includes('Modified at commit B.') ||
      mixedEnglish.rows[0]?.translated_markdown.includes('This is the current paragraph.')
    ) {
      throw new Error(
        'Changed English block did not use current zh-CN fallback with safe hash reuse',
      )
    }
    const newBlog = await client.query<{ id: string }>(
      "SELECT id FROM app.documents WHERE route_path = '/blog/newblogenable!'",
    )
    const patchContexts = await translationMemory.listTargetedPatchContexts(newBlog.rows[0]?.id)
    if (
      patchContexts.length !== 1 ||
      patchContexts[0]?.patch.oldSource !== '这是当前段落。' ||
      patchContexts[0]?.patch.oldTranslation !== 'This is the current paragraph.' ||
      patchContexts[0]?.patch.newSource !== 'Modified at commit B.'
    ) {
      throw new Error('Targeted patch context did not preserve old zh-CN/en-US/new zh-CN')
    }
    const hookCountBeforeDeltaReplay = hooks.calls.length
    await createJob(jobCreator, commitB, 'translation-delta-idempotent')
    const deltaReplay = await worker.runOnce()
    const replayedPatchContexts = await translationMemory.listTargetedPatchContexts(
      newBlog.rows[0]?.id,
    )
    if (
      !deltaReplay.claimed ||
      !deltaReplay.completed ||
      deltaReplay.result.changes.length !== 0 ||
      hooks.calls.length !== hookCountBeforeDeltaReplay ||
      replayedPatchContexts[0]?.patch.oldTranslation !== 'This is the current paragraph.'
    ) {
      throw new Error('Delta replay changed mappings, hooks, or targeted patch context')
    }
    const memoryMetrics = await translationMemory.readMetrics()
    if (memoryMetrics.pending_segments < 1 || memoryMetrics.memory_hits < 1) {
      throw new Error('Translation Memory metrics did not expose pending and hit counts')
    }
    const stalePending = await client.query<{ count: string }>(
      `SELECT count(*)
         FROM app.translation_segments
        WHERE locale = 'en-us'
          AND source_text = '这个区块保持待翻译。'
          AND status = 'stale'`,
    )
    if (Number(stalePending.rows[0]?.count) !== 1) {
      throw new Error('Superseded pending block did not transition to stale')
    }

    await createJob(jobCreator, commitC, 'collision')
    const collision = await worker.runOnce()
    if (!collision.claimed || collision.completed || collision.retryScheduled) {
      throw new Error('Deterministic Pinyin collision was not recorded as a permanent job failure')
    }
    const afterCollision = await client.query<{ count: string }>(
      'SELECT count(*) FROM app.documents WHERE NOT is_deleted AND source_commit = $1',
      [commitB],
    )
    if (Number(afterCollision.rows[0]?.count) !== phase5FinalSnapshot.files.length) {
      throw new Error('Failed collision ingestion changed the previously valid runtime snapshot')
    }

    source.failNext(commitD)
    const retryJob = await createJob(jobCreator, commitD, 'retry')
    const failedAttempt = await worker.runOnce()
    if (!failedAttempt.claimed || failedAttempt.completed || !failedAttempt.retryScheduled) {
      throw new Error('Transient source failure did not schedule a durable retry')
    }
    const successfulRetry = await worker.runOnce()
    if (!successfulRetry.claimed || !successfulRetry.completed) {
      throw new Error('Durable content job retry did not complete')
    }
    const retryState = jobStateSchema.parse(
      (
        await client.query(
          'SELECT status, attempt_count, progress FROM app.operational_jobs WHERE id = $1',
          [retryJob.job.id],
        )
      ).rows[0],
    )
    if (retryState.status !== 'completed' || retryState.attempt_count !== 2) {
      throw new Error('Retry attempt/progress state was not persisted')
    }

    await createJob(jobCreator, commitE, 'concurrent-claim')
    const secondJobs = new ContentJobRepository(connectionString)
    try {
      const claims = await Promise.all([
        jobs.claimNext('phase5-claim-a', 30_000),
        secondJobs.claimNext('phase5-claim-b', 30_000),
      ])
      const claimed = claims.filter((value) => value !== null)
      if (claimed.length !== 1 || !claimed[0]) {
        throw new Error('SKIP LOCKED claim did not grant a content job to exactly one worker')
      }
      await jobs.fail(claimed[0], new Error('Concurrency test cleanup'), {
        retryable: false,
        retryDelayMilliseconds: 0,
      })
    } finally {
      await secondJobs.close()
    }
  } finally {
    await client.end()
    await Promise.all([
      ingestion.close(),
      jobs.close(),
      jobCreator.close(),
      translationMemory.close(),
    ])
  }
}
