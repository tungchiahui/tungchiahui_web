# 搜索架构

## 基线

生产搜索使用 PostgreSQL + PGroonga。

Search Service 位于 Server-side。

## 索引内容

至少包括：

- Title
- Description（如果存在）
- Heading
- Markdown Text Content
- Translated English Content
- 当前 Frontmatter 中存在的相关 Tag/Category

## Locale 行为

Search Query 按当前 Locale 进行 Scope 或 Ranking。

示例：

- `zh-cn` 搜索 Canonical Simplified Chinese。
- `zh-hk` 搜索 Materialized HK Content View/Translation。
- `zh-tw` 搜索 Materialized TW Content View/Translation。
- `en-us` 搜索 English Translation。

Cross-locale Fallback 可以有意添加，但不得偶然发生。

## API 形态

精确 API 由实现决定，但 Result 应包括：

```text
title
route
locale
content_type
snippet
matched context
```

## Ranking

Ranking 行为需要 Test Fixture。

不得只靠肉眼观察调整 Relevance。

代表性测试应覆盖：

- Exact Title Match
- Heading Match
- Body Match
- 中文短语
- English Technical Term
- ROS2 / C++ / STM32 等 Mixed Identifier

## 非目标

不要：

- 把所有 Document 下载到浏览器后再搜索
- 维护一套平行的 Production Search JSON Index
- 在 PGroonga 已满足要求时增加 Elasticsearch/Meilisearch

## 未来评估

如果未来 Corpus 或 Ranking Requirement 超出 PostgreSQL + PGroonga 能力，在引入专门 Search Service 前先创建 ADR。
