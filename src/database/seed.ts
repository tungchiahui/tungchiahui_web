import { sql } from 'drizzle-orm'
import { contentHookInputSchema } from '../content/hooks'
import {
  applicationJobRequestSchema,
  documentWriteSchema,
  ownerDatasetWriteSchema,
} from '../domain/persistence'
import { locales } from '../i18n/locales'
import { SearchIndexRepository } from '../search/repository'
import { createDatabaseClient } from './client'
import {
  documents,
  documentTranslations,
  ingestionRuns,
  operationalJobs,
  ownerManagedDatasets,
  translationJobs,
  translationSegments,
} from './schema'

const seedTimestamp = new Date('2026-01-01T00:00:00.000Z')
const sourceCommit = '1111111111111111111111111111111111111111'
const blogId = '10000000-0000-4000-8000-000000000001'
const wikiId = '10000000-0000-4000-8000-000000000002'
const wikiChapterOneId = '10000000-0000-4000-8000-000000000003'
const wikiChapterTwoId = '10000000-0000-4000-8000-000000000004'
const wikiNestedChapterId = '10000000-0000-4000-8000-000000000005'
const ingestionJobId = '20000000-0000-4000-8000-000000000001'
const translationJobId = '20000000-0000-4000-8000-000000000002'
const ingestionRunId = '30000000-0000-4000-8000-000000000001'
const segmentId = '40000000-0000-4000-8000-000000000001'
const sourceHash = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa'
const wikiHash = 'bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb'
const wikiChapterOneHash = '8888888888888888888888888888888888888888888888888888888888888888'
const wikiChapterTwoHash = 'eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee'
const wikiNestedChapterHash = 'ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff'
const translationHash = 'cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc'

export async function seedDevelopmentDatabase(connectionString: string) {
  const client = createDatabaseClient({
    applicationName: 'site-development-seed',
    connectionString,
    maxConnections: 2,
  })
  const blog = documentWriteSchema.parse({
    id: blogId,
    contentType: 'blog',
    sourcePath: 'content/posts/2026-01-01-phase-3-seed.md',
    sourceCommit,
    title: 'Phase 3 Development Seed',
    rawFrontmatter: { title: 'Phase 3 Development Seed', path: '/blog/phase-3-seed' },
    rawMarkdown:
      '# Phase 6 Development Seed\n\nDeterministic local content with `inline-code` and `ROS2_Control`.\n\n## Asset\n\n![Local fixture](/api/assets/fixtures/phase-6.svg)\n\n```ts\nconst phase = 6\n```',
    sourceHash,
    routePath: '/blog/phase-3-seed',
    sourceUpdatedAt: seedTimestamp,
  })
  const wiki = documentWriteSchema.parse({
    id: wikiId,
    contentType: 'wiki',
    sourcePath: 'content/wiki/2026-01-01-phase-3-seed/index.md',
    sourceCommit,
    title: 'Phase 3 Wiki Seed',
    rawFrontmatter: { title: 'Phase 3 Wiki Seed' },
    rawMarkdown: '# Phase 3 Wiki Seed\n\nDeterministic local wiki content.',
    sourceHash: wikiHash,
    routePath: '/wiki/2026-01-01-phase-3-seed',
    sourceUpdatedAt: seedTimestamp,
  })
  const wikiChapterOne = documentWriteSchema.parse({
    id: wikiChapterOneId,
    contentType: 'wiki',
    sourcePath: 'content/wiki/2026-01-01-phase-3-seed/0100-Getting-Started.md',
    sourceCommit,
    title: '简体中文 Markdown 样式测试',
    rawFrontmatter: { title: '简体中文 Markdown 样式测试' },
    rawMarkdown: [
      '# 简体中文 Markdown 样式总览',
      '',
      '这是一段用于本地验收的简体中文正文，包含 **粗体**、*斜体*、~~删除线~~ 和 `行内代码`。',
      '',
      '> 引用块适合放置提示、结论或需要特别注意的信息。',
      '',
      '---',
      '',
      '## 列表与任务',
      '',
      '- 无序列表第一项',
      '- 无序列表第二项',
      '  - 嵌套列表内容',
      '',
      '1. 有序步骤一',
      '2. 有序步骤二',
      '3. 有序步骤三',
      '',
      '- [x] 已完成的任务',
      '- [ ] 尚未完成的任务',
      '',
      '## 表格',
      '',
      '| 元素 | 用途 | 内容语言 | 更新时间 | 兼容状态 | 搜索状态 | 资源状态 |',
      '| :--- | :--- | :---: | :---: | :---: | :---: | ---: |',
      '| 标题 | 建立内容层级 | 简体中文 | 2026-09-07 | 已支持 | 可检索 | 无外部资源 |',
      '| 表格 | 展示结构化数据 | 简体中文 | 2026-09-07 | 已支持 | 可检索 | 窄屏横向滚动 |',
      '| 代码 | 保留技术细节与较长的不可换行标识符 | 简体中文 | 2026-09-07 | 已支持 | 可检索 | 独立横向滚动 |',
      '',
      '## 代码块',
      '',
      '```ts',
      'const phase = 18',
      "const message = '简体中文代码示例'",
      "const longIdentifierForHorizontalOverflowVerification = 'mobile-content-must-scroll-inside-the-code-block-without-widening-the-page'",
      '```',
      '',
      '## 链接、图片与归档',
      '',
      '[站内 Wiki](/wiki) · [Next.js 文档](https://nextjs.org/docs) · [ROS2 归档](/docs/ros2/core/index.html)',
      '',
      '![本地图片测试](/api/assets/fixtures/phase-6.svg)',
      '',
      '### 三级标题',
      '',
      '三级标题用于拆分二级主题。',
      '',
      '#### 四级标题',
      '',
      '四级标题继续细分内容。',
      '',
      '##### 五级标题',
      '',
      '五级标题仍保持清晰可读。',
      '',
      '###### 六级标题',
      '',
      '这是标准 Markdown 支持的最深标题层级。',
    ].join('\n'),
    sourceHash: wikiChapterOneHash,
    routePath: '/wiki/2026-01-01-phase-3-seed/0100-getting-started',
    sourceUpdatedAt: seedTimestamp,
  })
  const wikiChapterTwo = documentWriteSchema.parse({
    id: wikiChapterTwoId,
    contentType: 'wiki',
    sourcePath: 'content/wiki/2026-01-01-phase-3-seed/0900-Advanced.md',
    sourceCommit,
    title: 'Advanced',
    rawFrontmatter: { title: 'Advanced' },
    rawMarkdown:
      '# Advanced\n\nA second chapter verifies continuous Wiki numbering and navigation.',
    sourceHash: wikiChapterTwoHash,
    routePath: '/wiki/2026-01-01-phase-3-seed/0900-advanced',
    sourceUpdatedAt: seedTimestamp,
  })
  const wikiNestedChapter = documentWriteSchema.parse({
    id: wikiNestedChapterId,
    contentType: 'wiki',
    sourcePath: 'content/wiki/2026-01-01-phase-3-seed/0900-0300-Nested.md',
    sourceCommit,
    title: 'Nested topic',
    rawFrontmatter: { title: 'Nested topic' },
    rawMarkdown: '# Nested topic\n\nA nested chapter verifies hierarchy depth.',
    sourceHash: wikiNestedChapterHash,
    routePath: '/wiki/2026-01-01-phase-3-seed/0900-0300-nested',
    sourceUpdatedAt: seedTimestamp,
  })
  const ingestionRequest = applicationJobRequestSchema.parse({
    jobType: 'content_sync',
    payload: { sourceCommit },
  })
  const translationRequest = applicationJobRequestSchema.parse({
    jobType: 'translation',
    payload: { translationJobId },
  })
  const techFootprint = ownerDatasetWriteSchema.parse({
    datasetKey: 'tech_footprint',
    payload: { records: {}, version: 2 },
    revision: 0,
    updatedBy: 'phase3-seed',
  })
  const weightLoss = ownerDatasetWriteSchema.parse({
    datasetKey: 'weight_loss',
    payload: { records: [], version: 2 },
    revision: 0,
    updatedBy: 'phase3-seed',
  })

  try {
    await client.database.transaction(async (transaction) => {
      await transaction.execute(sql`SET LOCAL ROLE site_content_worker`)
      await transaction
        .insert(documents)
        .values([
          { ...blog, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
          { ...wiki, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
          { ...wikiChapterOne, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
          { ...wikiChapterTwo, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
          { ...wikiNestedChapter, createdAt: seedTimestamp, ingestedAt: seedTimestamp },
        ])
        .onConflictDoUpdate({
          target: documents.id,
          set: {
            contentType: sql`excluded.content_type`,
            deletedAt: null,
            ingestedAt: seedTimestamp,
            isDeleted: false,
            rawFrontmatter: sql`excluded.raw_frontmatter`,
            rawMarkdown: sql`excluded.raw_markdown`,
            routePath: sql`excluded.route_path`,
            sourceCommit: sql`excluded.source_commit`,
            sourceHash: sql`excluded.source_hash`,
            sourcePath: sql`excluded.source_path`,
            sourceUpdatedAt: sql`excluded.source_updated_at`,
            title: sql`excluded.title`,
          },
        })
      await transaction
        .insert(operationalJobs)
        .values([
          {
            id: ingestionJobId,
            jobType: ingestionRequest.jobType,
            status: 'completed',
            requestedBy: 'phase3-seed',
            idempotencyKey: 'phase3-seed-content-sync',
            payload: ingestionRequest.payload,
            progress: { completed: true },
            createdAt: seedTimestamp,
            startedAt: seedTimestamp,
            finishedAt: seedTimestamp,
          },
          {
            id: translationJobId,
            jobType: translationRequest.jobType,
            status: 'completed',
            requestedBy: 'phase3-seed',
            idempotencyKey: 'phase3-seed-translation',
            payload: translationRequest.payload,
            progress: { completed: true },
            createdAt: seedTimestamp,
            startedAt: seedTimestamp,
            finishedAt: seedTimestamp,
          },
        ])
        .onConflictDoNothing()
      await transaction
        .insert(ingestionRuns)
        .values({
          id: ingestionRunId,
          operationalJobId: ingestionJobId,
          sourceCommit,
          startedAt: seedTimestamp,
          finishedAt: seedTimestamp,
          status: 'completed',
          filesSeen: 2,
          filesChanged: 2,
          filesDeleted: 0,
        })
        .onConflictDoNothing()
      await transaction
        .insert(translationJobs)
        .values({
          id: translationJobId,
          status: 'completed',
          scope: 'article',
          documentId: blogId,
          requestedBy: 'phase3-seed',
          budgetUsd: '0',
          createdAt: seedTimestamp,
          startedAt: seedTimestamp,
          finishedAt: seedTimestamp,
        })
        .onConflictDoNothing()
      await transaction
        .insert(translationSegments)
        .values({
          id: segmentId,
          sourceHash,
          sourceText: 'Deterministic local content.',
          sourceAstType: 'paragraph',
          locale: 'en-us',
          translatedText: 'Deterministic local content.',
          contextFingerprint: 'phase3-seed-paragraph',
          status: 'reviewed',
          provider: 'fake',
          model: 'phase3-seed',
          createdAt: seedTimestamp,
          updatedAt: seedTimestamp,
        })
        .onConflictDoNothing()
      await transaction
        .insert(documentTranslations)
        .values({
          documentId: blogId,
          locale: 'en-us',
          translatedMarkdown: '# Phase 3 Development Seed\n\nDeterministic local content.',
          translationHash,
          translationVersion: 1,
          generatedAt: seedTimestamp,
        })
        .onConflictDoNothing()
      await transaction
        .insert(ownerManagedDatasets)
        .values([
          { ...techFootprint, updatedAt: seedTimestamp },
          { ...weightLoss, updatedAt: seedTimestamp },
        ])
        .onConflictDoNothing()
    })
  } finally {
    await client.close()
  }

  const search = new SearchIndexRepository(connectionString)
  try {
    await search.reindexLocales(locales)
  } finally {
    await search.close()
  }

  return contentHookInputSchema.parse({
    changes: [
      {
        documentId: wikiChapterOneId,
        routePath: wikiChapterOne.routePath,
        sourceHash: wikiChapterOne.sourceHash,
        type: 'modified',
      },
    ],
    searchLocales: locales,
    sourceCommit,
    translation: {
      fallbackSegments: 0,
      memoryHits: 0,
      pendingSegments: 0,
      translatedSegments: 0,
    },
  })
}
