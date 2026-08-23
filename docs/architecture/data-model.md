# 数据模型

本文件定义逻辑职责，而不是最终 SQL Column Name。精确 Schema 由 Database Migration 进行版本管理。

## 主要实体

### documents

表示一个 Canonical Content Document。

典型字段：

```text
id
content_type          blog | wiki
source_path
source_commit
title
raw_frontmatter       JSONB
raw_markdown          TEXT
source_hash
route_path
created_at
source_updated_at
ingested_at
is_deleted
```

规则：

- `source_path` 确定性映射到 Canonical GitHub Content File。
- `raw_markdown` 保存 Source Markdown，而不是 Rendered HTML。
- Route Data 通过计算获得，不强迫作者在 Markdown 中增加新的 Frontmatter Field。
- Soft/Delete Bookkeeping 必须避免 Move 时意外生成重复 Identity。

### document_translations

表示特定 Locale 的 Materialized Content Translation。

典型字段：

```text
document_id
locale
translated_markdown
translation_hash
translation_version
generated_at
```

`zh-cn` 可以直接由 Canonical Document 表示，而不是重复存储。

当 Translation Pending 时，Materialized English Document 可以同时包含 Translated Block 和 Canonical zh-CN Fallback Block。

### translation_segments

Semantic-block Granularity 的 Translation Memory。

典型字段：

```text
id
source_hash
source_text
source_ast_type
locale
translated_text
context_fingerprint
status
provider
model
input_tokens
output_tokens
cost
created_at
updated_at
```

典型状态可以包括：

```text
pending
translated
fallback
stale
failed
reviewed
```

规则：

- 完全未变的 Block => Reuse
- 仅 Formatting 的 Normalize 在安全时可以复用
- 修改后的 Block 可以使用 Old Source + Old Translation + New Source 做 Targeted Patch Translation
- Segment Position 本身不是 Identity
- Pending Block 不会自动调用 AI

### translation_jobs

追踪显式付费 Translation Operation。

典型字段：

```text
id
status
scope
requested_by
budget_usd
estimated_input_tokens
estimated_output_tokens
estimated_cost
actual_input_tokens
actual_output_tokens
actual_cost
created_at
started_at
finished_at
error_summary
```

典型状态：

```text
queued
running
completed
partial
failed
cancelled
```

Server-side Worker 在继续发出付费 Request 前强制执行 Budget。

### operational_jobs

通用的 Durable Control-plane Job。

典型字段：

```text
id
job_type
status
requested_by
idempotency_key
payload
progress
created_at
started_at
finished_at
error_summary
```

它可以实现成一个通用表，并在关联表中保存 Translation-specific Detail；也可以实现成多个 Specialized Table。最终 Relational Design 应保持 Durable、Inspectable State。

### ingestion_runs

追踪 Content Synchronization。

典型字段：

```text
id
source_commit
started_at
finished_at
status
files_seen
files_changed
files_deleted
error_summary
```

### content_aliases

只有在无法通过新的 Deterministic Router 保留 Legacy Route 时才使用。

该表是最后手段，而不是默认用来堆 Redirect Map 的地方。

## 搜索

PGroonga 索引：

- Title
- Source Content
- Translated Content
- Relevant Metadata

Search Schema 必须支持 Locale Filtering。

## ID 与作者编写的 Frontmatter

不要仅仅为了满足内部 Storage，就强迫作者把 UUID 或 Database ID 写进 Markdown Frontmatter。

Internal Identity 属于 Database/Runtime Concern。

作者编写的 Markdown 保持简洁且面向人。
