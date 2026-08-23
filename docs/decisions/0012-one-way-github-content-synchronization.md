# ADR 0012：保持 GitHub Content Synchronization 单向

- Status: Accepted
- Date: 2026-08-23

## Context

GitHub 应始终作为 Canonical zh-CN Markdown Authoring Source。允许 Production Runtime State 自动回写会造成 Dual-authority Conflict，并且需要范围明显更大的 GitHub Credential。

## Decision

Canonical Content Synchronization 单向执行：GitHub -> PostgreSQL。Production 可以 Fetch/Read 所引用的 Commit，但不会自动 Commit、Push、Open PR 或修改 Canonical GitHub Content。

## Consequences

Source-of-truth Ownership 保持明确；当 Public Access 足够时，Production GitHub Credential 可以保持 Read-only，甚至完全不需要 Credential。未来 Web CMS/Writeback Flow 需要新 ADR。
