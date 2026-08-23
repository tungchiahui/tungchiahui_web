# ADR 0002：使用 PostgreSQL 作为 Runtime Content Store

- Status: Accepted
- Date: 2026-08-23

## Context

Runtime Content 需要 Full-text Search、Translation、Translation Memory、Structured Metadata、Deterministic Ingestion State 和高效 Server-side Query。把这些能力建模成 S3 Object 和 JSON Index，本质上是在手工重新实现数据库行为。

## Decision

在 PostgreSQL 18 中保存 Runtime Markdown、Parsed Metadata、Generated Translation、Translation-memory Segment、Ingestion State 和 Search-indexed Content。

## Consequences

系统获得 Migration、Transactional Consistency、Server-side Query 和与 PGroonga 的原生 Integration。PostgreSQL 成为主要 Stateful Service，因此需要采用专业 Backup/Recovery 方案。
