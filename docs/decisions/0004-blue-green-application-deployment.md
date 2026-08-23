# ADR 0004：使用完整 Blue-Green Application Deployment

- Status: Accepted
- Date: 2026-08-23

## Context

Production Update 不应有意造成 Downtime，Rollback 也不应要求重新构建旧 Application Image。

## Decision

把 Immutable Application Image 部署到 Inactive Blue 或 Green Slot，验证 Health/Readiness/Smoke Test，原子切换 OpenResty Traffic，并保留 Previous Slot 以便立即 Rollback。

## Consequences

Deployment 要求相邻 Release 之间保持 Schema Compatibility，并需要更强的 Operational Automation，但能够提供可预测的 Cutover 和 Rollback Behavior。
