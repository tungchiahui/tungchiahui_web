# 搜索架构

## 已实现基线

生产搜索使用 PostgreSQL + PGroonga。

Search Service 位于 Server-side。Phase 10 使用 `app.search_documents` 作为可重建 Runtime Projection，并用多列 PGroonga Index 查询；Browser 不接收完整 Content Corpus，也不建立平行 Index。

## 索引内容

每个 Active Document 按四个批准 Locale 各有一个 Projection，包含：

- Title
- Description（如果存在）
- Heading
- Markdown Text Content
- Current-source English Content；未完成的 Block 使用最新 zh-CN Fallback
- 当前 Frontmatter 中存在的相关 Tag/Category

## Locale 行为

Search Query 按当前 Locale 进行 Scope 或 Ranking。

示例：

- `zh-cn` 搜索 Canonical Simplified Chinese。
- `zh-hk` 搜索 Materialized HK Content View/Translation。
- `zh-tw` 搜索 Materialized TW Content View/Translation。
- `en-us` 搜索 English Translation。

Query 必须使用精确 Locale Filter，不执行偶然 Cross-locale Result。Fallback 只发生在 Projection Materialization：en-US 使用 Phase 8/9 Current-source Mixed/Fallback，zh-HK/zh-TW 使用 Materialized Conversion 或既有确定性 Converter。

## API 形态

`GET /api/search` 使用严格 Query Validation，Result 包括：

```text
title
route
locale
content_type
snippet
matched context
score
```

Raw Markdown、Source/Projection Hash、Source Path、Database Identity 和内部 Error 不属于 Public Contract。HTTP Response 使用 `no-store`；Next 内部 Search Cache 见 Caching Architecture。

## Ranking

Phase 10 Ranking 固定使用 Title 16、Heading 8、Metadata 4、Body 2 的 PGroonga Weight；Exact Case-insensitive Title Match 额外加 1000。其后以 PGroonga Score、Source Update Time、Route 排序。Ranking 行为需要 Test Fixture。

不得只靠肉眼观察调整 Relevance。

代表性测试应覆盖：

- Exact Title Match
- Heading Match
- Body Match
- 中文短语
- English Technical Term
- ROS2 / C++ / STM32 等 Mixed Identifier

## 刷新与重建

- Content/Translation Update 只刷新受影响 Document/Locale 的 Projection，并在 Transaction 成功后失效对应 Locale Cache Tag。
- `search_reindex` 使用 PostgreSQL `operational_jobs` 的 Claim/Lease/Retry，由 `content-worker` 执行。
- Full Reindex 使用 Per-locale Advisory Transaction Lock，完成后只失效请求 Locale。
- Projection Hash 使精确刷新重放不改写未变化 Row；Search Projection 可从 Current Runtime Content 安全重建。
- Search/Reindex 不使用 host-local SQLite。

详细实现和 Recovery Contract 见 `docs/development/phase-10-pgroonga-search.md`。

## 非目标

不要：

- 把所有 Document 下载到浏览器后再搜索
- 维护一套平行的 Production Search JSON Index
- 在 PGroonga 已满足要求时增加 Elasticsearch/Meilisearch

## 未来评估

如果未来 Corpus 或 Ranking Requirement 超出 PostgreSQL + PGroonga 能力，在引入专门 Search Service 前先创建 ADR。
