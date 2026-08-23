# ADR 0014：将 Control API 与 Next.js Blue/Green Slot 解耦

- Status: Accepted
- Date: 2026-08-23
- Clarifies: ADR 0011, ADR 0013

## Context

`https://www.tungchiahui.cn/api/ops/*` 已被确定为稳定的 Remote Control Namespace，但早期架构文档把这些 Endpoint 实现为 Next.js Route Handler。如果 Active/Inactive Next.js Slot 同时故障，Deploy、Rollback 与 Status 也会失去入口，形成由被管理 Application 承载自身恢复控制面的循环依赖。

## Decision

保留 ADR 0011 的 Hostname/Path Contract，不新增 Operations Domain。OpenResty 在 Blue/Green Application Routing 之前按 Path 分流，将 `/api/ops/*` 直接路由到独立内部 `control-api`；普通网站请求和 `/api/search`、`/api/health`、`/api/ready`、`/api/version` 等业务 API 继续进入 Active Next.js Slot。

`control-api` 负责 Authentication、Capability Authorization、Zod Validation、Replay/Idempotency Protection、Job Control/Status 与必要 Recovery Control。它不属于 Next.js Slot，不在 HTTP Request 内执行长时间任务，也不拥有不受限的 Docker/Host 权限；高权限执行继续交给 ADR 0013 定义的最小权限 `deploy-agent`。

## Consequences

Next.js Blue/Green 全部不可用时，Status、Deploy 与 Rollback 仍有独立控制路径。OpenResty 与 `control-api` 成为需要单独 Health、Hardening、Upgrade 和 Recovery 的生产组件。ADR 0011 的公网 URL、DDNS Origin 与 Public-IP Independence 不变，ADR 0013 的 Worker/Agent 权限分离继续有效。
