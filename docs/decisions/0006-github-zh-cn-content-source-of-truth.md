# ADR 0006：保持 GitHub zh-CN Markdown 为 Content Source of Truth

- Status: Accepted
- Date: 2026-08-23

## Context

作者希望保留 Local Markdown Editing、Git History、Simple Frontmatter 和当前 Repository Layout，同时消除 Content Publication 引发 Full-site Rebuild 的问题。

## Decision

GitHub Content Repository 只保存 Canonical zh-CN Authored Markdown。将它同步进 PostgreSQL 供 Production Runtime 使用。Generated Locale Content 是 Runtime Materialized Data，不是 Canonical Git Content。

## Consequences

Production Database 可以通过 Canonical Source 加 Translation Tooling 重建。Git 继续非常适合 Authoring/History，同时无需把 Generated File 强塞进 Content Repository。
