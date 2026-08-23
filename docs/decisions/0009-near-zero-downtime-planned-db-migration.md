# ADR 0009：支持 Near-Zero-Downtime Planned Database Server Migration

- Status: Accepted
- Date: 2026-08-23

## Context

当前服务器预计会使用多年，但未来 Hardware/Server Migration 不应在 PostgreSQL 已提供成熟 Replication Mechanism 的情况下仍要求长时间 Database Outage。

## Decision

Same-major Planned Migration 使用 Physical Streaming Replication 和 Controlled Promotion/Cutover。Cross-major Migration 选择受支持的 Logical Replication 或与 Target Release 相适应的其他明确 Upgrade Method。通过 `./site migrate-server` 暴露 Orchestration。

## Consequences

项目不需要永久运行第二台 HA Database Server，也能保持 Migration-ready。Always-on Automatic HA 仍然是未来单独的 Architecture Decision，需要 Independent Host、Quorum/Fencing 和 Failover Design。
