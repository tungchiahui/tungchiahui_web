# ADR 0008：要求 Expand/Contract Database Migration

- Status: Accepted
- Date: 2026-08-23

## Context

部署期间 Blue 和 Green Application Version 可能同时针对一个 PostgreSQL Database 运行。同一 Release 中的 Destructive Migration 会破坏 Rollback 和仍然 Active 的 Old Slot。

## Decision

所有 Production Schema Evolution 在相邻 Release 之间必须 Backward-compatible。先 Add/Expand，部署 Compatible Code，Backfill/Verify，最后只在后续 Release 中 Contract Obsolete Schema。

## Consequences

Migration 可能需要跨多个 Release 完成，但 Blue-Green Cutover 和 Rollback 仍然安全。Coding Agent 不得为了方便牺牲这种安全性。
