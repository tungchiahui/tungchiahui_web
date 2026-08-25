# 数据模型

本文件定义逻辑职责。Phase 3 已将这些职责实现为 `app` PostgreSQL Schema；精确 Column、Constraint、Index 和 Enum 继续由 `drizzle/*.sql` Versioned Migration 管理，TypeScript Integration 位于 `src/database/schema.ts`。

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

Phase 8 物理实现增加 `is_translatable` 与 `normalization_version`。全局 Memory Identity 使用 Source Hash、Locale 与 Context Fingerprint；Document Position 不进入该 Identity。

### document_translation_segments

Phase 8 新增的 Current-document Mapping：

```text
id
document_id
locale                  en-us
segment_id
previous_segment_id     optional targeted-patch predecessor
ordinal                 assembly only
source_start/source_end assembly only
created_at/updated_at
```

Ordinal/Offset 只重建当前 Markdown，不是 Segment Identity。Mapping 可在局部修改时指向一个新 Pending Segment，同时保留旧 reviewed/translated Segment 供 targeted patch context 使用。

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
execution_mode          dry-run | execute
force
provider_request_count
completed_segment_count
remaining_segment_count
cancel_requested_at
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

Phase 9 Migration `0004_phase9_budgeted_translation` 是 additive Expand：为既有 `translation_jobs` 增加 Execution、Progress、Cancellation 与 Audit Field，并用非负/状态 Constraint 保护 Budget/Usage。一个 Translation Operation 与同 ID 的 `operational_jobs` Row 配对；通用 Queue 状态负责 Claim/Lease/Retry，Translation Row 保存业务状态（包括 `partial`）和 Cost。Migration 不重写 Segment 或 Canonical Content，也不删除旧 Column。

Server-side Worker 在继续发出付费 Request 前强制执行 Budget。

### operational_jobs

PostgreSQL-backed 的 Application-level Durable Job，用于 Content Sync、Translation、Search/Reindex 与普通后台任务。

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

Phase 5 在该表增加 `max_attempts`、`available_at`、`claimed_at`、`claimed_by` 和 `claim_expires_at`，以支持 PostgreSQL Transaction 内的 `FOR UPDATE SKIP LOCKED` Claim、Retry Schedule、Expired-claim Recovery 和单 Worker Completion Guard。`running` Row 必须同时具有完整 Claim/Lease；Terminal/Queued/Retry Row 不得残留 Claim。`attempt_count` 不得超过 `max_attempts`。

它可以实现成一个通用表，并在关联表中保存 Translation-specific Detail；也可以实现成多个 Specialized Table。最终 Relational Design 应保持 Durable、Inspectable State。

Deploy、Rollback、PostgreSQL Restore/Recovery 与基础 Disaster-recovery Operation 不使用此表作为唯一状态，因为这些操作必须能在 Production PostgreSQL 不可用时启动、恢复和查询。它们的最小状态属于 ADR 0015 定义的 host-local SQLite Control-state Schema，包括 Active/Previous Slot、Deployment SHA、Operation Phase、Lock/Lease 与 Audit Record。该 Schema 不属于业务 PostgreSQL Data Model，也不得承载 Content/Translation/Search Data。

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

每个 Content-sync Operational Job 有一个可重试更新的 Run Summary。失败保存有界 Error，成功保存最终 Seen/Changed/Deleted Count。Document Materialization 与成功 Summary 在同一个 Transaction 中提交；Parse/Collision/Identity 歧义不会留下半成品。

Phase 5 Identity Rule：先匹配 Source Path，再匹配相同 Public Route，最后只在 Source Hash 唯一时把纯 Move/Rename 关联到原 Document ID。不能证明唯一性的 Hash Move 整次失败；不得用自动 Alias、后缀或覆盖掩盖歧义。

### content_aliases

只有在无法通过新的 Deterministic Router 保留 Legacy Route 时才使用。

该表是最后手段，而不是默认用来堆 Redirect Map 的地方。

每条 Alias 必须保存非空 `approval_reference`。Phase 3 不 Seed Alias；Phase 5 只物化 Phase 0 已批准的 7 个 Legacy Wiki Alias，并且只在当前 Snapshot 中存在真实 Canonical Document 时建立 Foreign Key。Alias 路径也参与写前 Route Collision Gate；新增例外仍需 Owner 单项批准。Locale-prefixed Alias 从同一 Logical Route 派生，不复制为无边界 Redirect Row。

### owner_managed_datasets

保存 Owner 已批准从 Legacy EdgeOne Blob 迁入 PostgreSQL 的两类 Runtime Data：

```text
tech_footprint
weight_loss
```

字段包括 `dataset_key`、JSONB `payload`、单调 `revision`、`updated_at` 和 `updated_by`。Phase 4 已在独立 Control API 写边界实现具体 Zod Schema，并使用 `expectedRevision` 做 Compare-and-swap：

- `tech_footprint` Payload 固定为 `{ version: 2, records }`。`records` Key 是 `semester/task/subtask` 三段 Slug；Value 包含 `status: todo | doing | done`、`progress: 0..100`、`note` 与带 Offset 的 `updatedAt`，Status 与 Progress 必须一致。
- `weight_loss` Payload 固定为 `{ version: 2, records }`。Record Date 必须唯一，并保留 Legacy 的 String-valued Optional Metric：`weight` 35–250、`bodyFat` 2–70、`muscleMass` 10–100、`waist` 40–200；空字符串表示未填写。`targetMin`/`targetMax` 是 35–250 的 Number 且 Min 不得大于 Max，另含 `date` 与 `note`。

这些 Shape 来自 Phase 0 Artifact 无法回答后的定点只读 Legacy Baseline Commit `d33e9ee5f90a266207f9f9658a47031eafdb981a` 检查；未扫描或修改旧仓库。`revision` 属于 PostgreSQL Row Envelope，不重复嵌入 Payload。该表不授权把其他业务数据作为任意 Blob 写入。

## Phase 3 物理边界

| Schema / Store | Phase 3 内容 | 明确排除 |
| --- | --- | --- |
| PostgreSQL `app` | Document、Translation、Segment、Translation Job、Application Job、Ingestion、Approved Alias、Owner-managed Dataset | Deploy、Rollback、Restore、Recovery、Server Migration Operation |
| PostgreSQL `drizzle` | Versioned Migration Journal | Application Job 或业务数据 |
| PostgreSQL `public` | PGroonga Extension Bootstrap | 业务 Table |
| host-local SQLite | Phase 12 Version 3 Control-state（兼容升级 Phase 4 Version 2）、Nonce、Infrastructure Operation/Lease/Fencing 与 Append-only Audit | Content、Translation、Search、Ingestion、Application Job |

`src/domain/persistence.ts` 是 Locale、Content/Job/Translation Status、Dataset Key 和 External Write Schema 的唯一 Shared Domain 定义。Drizzle Schema 从这些 Closed Union 建立 PostgreSQL Enum，Repository/API 不得再次手写平行 Union。

Phase 8 Migration `0003_phase8_translation_memory` 是 additive Expand：新增 Document Mapping，并为 `document_translations` 增加 nullable Current-source Hash 与零默认指标。旧行不执行破坏性 Migration-time Backfill；显式 Content Sync 在 Canonical Transaction 内安全重建。

## 搜索

Phase 10 Migration `0005_phase10_pgroonga_search` 以 additive Expand 新增 `app.search_documents`。`(document_id, locale)` 是 Primary Key，并 Foreign Key 到 Canonical Document；Row 保存 Content Type、Canonical Route、Title、Heading、Body、Relevant Metadata、Source/Projection Hash 和时间字段。

PGroonga Multi-column Index 覆盖 Title、Heading、Body 与 Metadata，Locale/Content Type 另有 B-tree Index。每个 Locale Projection 从当前 PostgreSQL Runtime Content 确定性生成：en-US 只接受与当前 Source Hash 绑定的 Materialization，否则索引当前 zh-CN Fallback；zh-HK/zh-TW 使用 Materialized Conversion。Projection 不是 Authoring Source，可按 Locale 重建，不承载 Canonical Markdown。

Search/Reindex 使用 PostgreSQL `operational_jobs`，不进入 host-local SQLite。Migration 不重写 Document/Translation，不删除旧 Column，可在 Application Rollback 时保留。

## ID 与作者编写的 Frontmatter

不要仅仅为了满足内部 Storage，就强迫作者把 UUID 或 Database ID 写进 Markdown Frontmatter。

Internal Identity 属于 Database/Runtime Concern。

作者编写的 Markdown 保持简洁且面向人。
