# ADR 0023：单一生产配置源与服务级注入边界

## Status

Accepted

## Context

ADR 0022 将生产 Secret 的人工 Source of Truth 收敛为一份 Host-local、`root:root`、`0600`
的 `.env`，但随后把该文件作为 `env_file` 注入几乎所有容器。这使数据库管理、备份、Registry、
Operator 和 Owner Credential 横跨无关 Runtime；Blue/Green Adapter 还会从旧容器模板保留任意
环境变量。单文件简化了人工管理，却不应取消服务级最小权限。

发布流程还存在三个相关的一致性缺口：Migration Runner 通过可移动的 SHA Tag 选择 Service
Image；独立服务的 scoped reconciliation 未包含 `content-worker` 与 `observability-agent`；Worker
把缓存刷新固定发往 Blue Slot，而不是当前活动 Slot。

## Decision

继续使用 `/etc/tungchiahui/.env` 作为唯一人工维护的生产配置源，但它只作为 Docker Compose
插值输入。不得把整份文件通过 `env_file` 注入任何容器。每个 Service 必须在 Compose
`environment` 中显式列出自身所需变量；不同职责的 Secret 不得因为同源文件而跨服务可见。

`deploy-agent` 只获得恢复/部署职责所需配置，以及创建候选 Web Slot 所必需的 Web Runtime
变量。创建 Slot 时必须从这个固定 Allowlist 构造全新的环境，不得继承 Template Container 的
未知或过期变量。`WEB_DATABASE_URL` 仅在边界映射为 Web 读取的 `DATABASE_URL`。

Web Image 是同一 Release Image Set 的 Manifest Anchor。Build 将精确的 Service Image Digest
写入 Web Image Label；Deployment 先验证 Web Digest，再读取该 Label，并仅以
`<approved-service-repository>@<digest>` 选择 Migration Image。SHA Tag 移动不能改变已批准执行物。

独立服务仍不属于普通 Web Blue/Green Cutover。受控 scoped reconciliation 必须把同一 reviewed
Service/Recovery Release 作为一个 Unit 更新 `control-api`、`content-worker`、
`observability-agent`、停止态 Migration Runner 与 `deploy-agent`，并保持两个 Web Slot 不变。
这条路径仍需要明确生产授权。

`content-worker` 的内部 Revalidation 通过仅在 Docker Internal Network 暴露的 OpenResty
Endpoint 转发到当前活动 Slot；Public Listener 继续对 `/api/internal/*` 返回 404。Observability
的 Web Readiness Probe 同样经过活动槽入口。

Release Workflow 必须拒绝已经落后于 `origin/main` 的自动 Push Release，并以最终 Fail-closed
Job 汇总 Build/Deploy 结果。`production` Environment、严格 OIDC Claim Policy 和
`PRODUCTION_DEPLOYMENT_ENABLED` Gate 均保留；没有实际受保护 Audit Evidence 前不得放宽 OIDC。

## Consequences

- 单一 `.env` 仍简化 Owner 备份、校验与轮换，但容器泄露只暴露该服务 Allowlist 中的值。
- 新增变量必须同时经过 Runtime Validation、Compose Allowlist 与相应测试，不能依赖隐式继承。
- 首次启用需要先发布 Image Set，再经授权执行 scoped reconciliation；普通 Web Push 不能自我升级
  正在运行的 `control-api` 或 `deploy-agent`。
- Build/Deploy 被显式停用或跳过时，Release Run 不再以完整发布成功结束。
- 此决策不改变数据库 Schema，不重放任何 Migration，尤其不得重放 0008。
