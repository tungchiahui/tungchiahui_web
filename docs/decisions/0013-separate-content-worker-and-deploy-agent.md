# ADR 0013：分离 Content Worker 与 Deploy Agent 权限

- Status: Accepted
- Date: 2026-08-23

## Context

Content Parsing 和 Paid Translation 会处理复杂/类似不可信的内容以及 External AI Service，而 Deployment 需要强大的 Docker/OpenResty/Host Privilege。把它们合并会不必要地扩大 content-worker 被攻破后的 Blast Radius。

## Decision

使用非公开的 `content-worker` 处理 Ingestion/Translation/Search/Revalidation，使用独立 `deploy-agent` 处理 Blue-Green Deployment、Migration Orchestration、OpenResty Cutover 和 Rollback。每个组件只获得其 Role 所需权限。

## Consequences

Operational Complexity 略有增加，但 Privilege Boundary 明显更清晰。Content Processing 中的漏洞不会自动获得 Infrastructure-control Capability。
