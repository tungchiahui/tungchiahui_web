# 内容流水线

## 目标

Markdown 内容更新必须能够在不重新构建 Next.js 应用、也不自动消耗 AI 翻译 Token 的情况下生效。

## 流程

```text
Local Markdown edit
        |
      git push
        |
GitHub content repository
        |
trigger /api/ops/content/sync
        |
independent control-api
        |
durable content-sync job
        |
content-worker
        |
read target Git commit/files
        |
parse + validate
        |
compute legacy-compatible route
        |
transactional PostgreSQL upsert
        |
translation block diff
        |
   +----+-------------------+
   |                        |
hash hit                 hash miss/change
   |                        |
reuse EN                 mark pending
   |                        |
   +-----------+------------+
               |
      publish/revalidate zh-CN
               |
        content sync complete
```

Push Workflow **不会**等待人工翻译。

`/api/ops/content/sync` 由独立 `control-api` 提供，但 Content-sync Job 本身继续保存在 PostgreSQL 并由 `content-worker` 执行。Content Repository Push 不构建 Next.js Image，也不触发 Blue-Green Deployment。

## Source of Truth 规则

GitHub 中的 zh-CN 内容是权威内容。

数据库必须能够通过该仓库以及翻译生成能力重新构建。

同步是单向的：

```text
GitHub -> PostgreSQL
```

生产网站/Worker 不得向 GitHub Commit、Push、创建 PR 或编辑 Canonical GitHub Content。

## GitHub 访问

Content Worker 可以 Fetch/Read 触发请求所引用的精确 Commit 或文件。

优先使用 Read-only Access。

Trigger 应标识 Source Commit，使 Ingestion 能证明哪个 Git State 生成了当前 Runtime State。

## 幂等性

在 Source Commit 和 Configuration 相同的情况下，Ingestion 不得创建重复内容或重复翻译。

重复导入同一个 Commit 时，除了安全验证外应当是 No-op。

## 变更文件处理

Pipeline 必须区分：

- 新增
- 修改
- 删除
- 移动/重命名

当能够安全判断 Identity 时，Move 应保持 Runtime Continuity。

## Frontmatter

继续接受当前 Minimal Frontmatter Convention。

不要强迫作者填写可以由 Ingestion Pipeline 可靠推导的 Metadata。

## 翻译检测

对 Markdown 进行结构化解析。

按 Semantic Block 维护 Translation State。

保护：

- Code Block
- Inline Code
- URL
- Identifier
- Markdown Syntax
- 未被明确标记为可翻译的 Frontmatter Field

## 英文翻译缺失行为

新修改且没有可复用英文翻译的 Block 标记为 Pending。

在显式翻译完成前：

```text
/en-us/... renders canonical zh-CN for that block
```

已经翻译的 Block 继续显示英文。

Translation Miss 不得阻塞 zh-CN 发布。

## 付费 AI 翻译

Content Sync 永远不会自动调用付费 AI 翻译。

付费翻译由 `docs/operations/translation-operations.md` 中记录的显式 Translation Job 执行。

Phase 9 的执行路径只选择 Current `document_translation_segments`：`pending`/`changed`/`article`/`all` 不会建立 Whole-document Provider Path。每个成功 Segment 先在 PostgreSQL Transaction 内记录 Translation 与 Usage、重新物化引用它的 Current Document，并将精确 Revalidation Input 写入 Durable Progress；随后才调用 Revalidation Hook。若 Hook 失败，Retry 先完成该精确 Revalidation，再继续剩余 Segment，不重复已记录的 Provider Request。预算不足时不发出下一请求，已完成内容保留，未覆盖 Segment 继续 Pending/Fallback。

## 失败行为

可选 Translation 失败时不得破坏已有 Published Translation。

使用 Staged/Transactional Update。

在可行情况下，Content Sync 失败必须保留受影响内容此前有效的 Runtime Version。

## 缓存失效

尽可能只使受影响的 Document/List/Search Cache 失效。

内容发布不得要求 Application Blue-Green Deployment。

## Phase 5 executable baseline

Phase 5 将上述 Pipeline 实现为以下边界：

- `GitHubContentSource` 只有 `fetchSnapshot(commit)` 能力，只对 GitHub Tree/Blob API 发出 `GET`；Tree 被截断、Blob SHA 不一致或 Commit/Input 不合法时拒绝继续，避免把不完整 Snapshot 当作删除。
- Markdown 使用 unified + remark-parse + remark-frontmatter + remark-rehype 建立并校验 AST；YAML Frontmatter 使用安全 Schema 解析并由 Zod 严格接受当前 `title`、`date`、`path`、`description` 四种 Minimal Shape。
- Blog 显式 `path` 原样优先；Wiki 与 Blog Fallback 使用 Phase 0 固定的 `pinyin-pro` Contract。完整候选 Route 和 7 条批准 Alias 在任何写入前检查冲突。
- Snapshot Apply 在单个 PostgreSQL Transaction 中完成。Source Path 优先保持 Identity；相同 Public Route 或唯一 Source Hash 可证明的 Rename/Move 复用 Document ID；歧义 Hash 不静默合并。
- 删除使用可审计 Soft-delete；同 Path/Route 的恢复复用原 Identity。相同 Commit/Content 重放不更新 Document、Translation 或 Hook Side Effect。
- `content-worker` 使用 `FOR UPDATE SKIP LOCKED` Claim、Lease Expiry Recovery、Attempt Limit、`retry_wait`、Progress 和有界 Error Summary。Application Job 与 `ingestion_runs` 仍只位于 PostgreSQL。
- Translation Diff、Public Revalidation 与 Search Refresh 是明确 Typed Hook。Phase 6 已替换 Public Revalidation，Phase 8 已在同一 Ingestion Transaction 内替换 Translation Diff/Materialization，Phase 10 已替换 Search Refresh：只重建受影响 Document/Locale 的 PGroonga Projection，并在成功后精确失效 Locale Search Tag。没有隐式 AI Provider、Image Build、Deploy 或 GitHub Write Path。

## Phase 8 Translation Memory baseline

- unified/remark 顶层 mdast Node 形成稳定 Semantic Block；Normalization Version、Source Hash 与 AST/受保护值 Context Fingerprint 形成全局 Memory Identity，Ordinal 只负责当前文档拼装。
- 受保护 Frontmatter、Code、HTML、URL、Identifier 与 Markdown Shape 在复用前重新验证；不安全 Target 回到 Pending/当前 zh-CN Fallback。
- `document_translation_segments` 保存当前 Mapping 和可选 Previous Segment，支持 old zh-CN + old en-US + new zh-CN Targeted Patch Context。
- Hash Hit 复用 reviewed/translated Block；Miss 创建 Pending；被替换且不再 Current 的 Pending 变 Stale。单个 Block 改变不会使其他 Translation 失效。
- `document_translations.source_hash` 证明 Mixed Materialization 对应当前 Canonical Document。旧/未 Backfill 行不会被 Public DAL 当成有效英文。
- Content Sync 只执行纯数据 Diff/Reuse/Pending/Fallback，结构上不导入 Provider；同 Snapshot 重放不重复 Segment/Mapping/Hook。

Local/Test Compose 默认让外部 GitHub Polling 处于 Idle，避免本地启动产生网络调用；Disposable Integration 以同一个 Worker/Repository 实现和内存只读 Snapshot 验证完整执行路径。配置明确的 Repository 后，Service 可启用 Polling；私有 Repository 的可选 Token 必须只有读取权限。
