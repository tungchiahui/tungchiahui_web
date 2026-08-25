# 生产部署

## Deployment Identity

每个已部署 Application Image 都是 Immutable，并由 Git Commit SHA 标识。

概念上的 Identity 示例：

```text
web:c904e21
```

不得使用 `latest` 作为 Deployment 或 Rollback 的 Source of Truth。

## 入口

Web Application Repository 的正常 Production Trigger：

```text
push/merge to main
 -> CI Quality Gates
 -> build Git-SHA-tagged immutable image
 -> POST /api/ops/deployments
```

Quality Gates 未全部通过时不得构建/发布 Production Candidate，也不得 Cutover。

Human-triggered/Retry/指定版本：

```bash
./site deploy
./site deploy <git-sha-or-release>
```

GitHub Actions 和 `./site deploy` 向同一个独立 `control-api` 完成认证，执行相同 Policy，并调用同一个底层 Deployment Engine；不得维护 CI/Manual 两套实现。

正常 Remote Operation 使用：

```text
https://www.tungchiahui.cn/api/ops/deployments
```

它不需要直接使用 Public IP 寻址，也不需要直接访问 Production DB。

## Control/Execution 分离

`control-api` 校验请求并在 host-local SQLite 创建 Durable Deployment Operation。该 State 不依赖 Production PostgreSQL。

内部 `deploy-agent` 执行高权限 Deployment Action。

不得向 `content-worker` 或 `control-api` 授予 Docker Socket/Unrestricted Host Permission。只有 `deploy-agent` 获得完成声明操作所需的最小 Docker/OpenResty/Host Capability。

Phase 12 只交付该权限边界的最小可执行起点：Production Compose 中仅 `deploy-agent` 挂载 Docker Socket，且当前代码只发出 `GET /_ping` 并报告 `productionOperations: false`。正式 Compose Lifecycle、Migration、Smoke、OpenResty Cutover、Rollback 和 Recovery Engine 仍属于 Phase 14；不得把 Phase 12 Health Stub 当成 Deployment Success Path。

## High-level Flow

```text
Git commit
   |
CI Quality Gates
   |
build immutable Git-SHA image
   |
deployment operation
   |
deploy-agent preflight
   |
inactive slot start
   |
health/readiness/smoke
   |
OpenResty cutover
   |
post-cutover smoke
```

每个 Phase 在 Control-state SQLite 中持久化，至少记录 Active/Previous Slot、Current/Target SHA、Image Digest、Operation Status、Lock/Lease、Actor 与 Audit Event。Restart 后必须基于持久 Phase 安全 Resume、Rollback 或要求人工处置。

## Preflight

操作 Inactive Slot 前：

- Target Image 存在
- Production Config Validation 通过
- Encrypted Secret 可以 Resolve
- 如果 Release/Phase 需要 Database，则其可达且 Required Migration State 已知
- Backup Policy 满足 Migration Risk 要求
- Active Slot 和 Rollback Target 已确认
- Disk Space 足够

Production PostgreSQL 不可用不得阻止 `control-api`、Deployment Operation State 或 `deploy-agent` 启动。依赖 Database Readiness/Migration 的普通 Application Release 可以安全停在 Preflight/Recovery Phase，但基础 Deploy/Rollback/Restore/Recovery Control 仍可执行和查询。

## Deployment Failure

Traffic Cutover 前：

- 保持 Active Slot 不变
- 安全时拆除 Failed Inactive Candidate
- 报告 Failure
- 不切流

Traffic Cutover 后：

- 如果 Post-cutover Check 失败，并且 Schema 仍兼容 Rollback，立即切回 Previous Slot
- 保留 Evidence/Log 供诊断

## Application Deploy 与 Content Publish

Content Ingestion 不需要 Blue-Green Application Deployment。

Application Deployment 用于：

- Code
- UI
- Style
- Runtime Behavior
- API Behavior
- Schema-compatible Application Change

Content Push 和 Translation 是独立的 Durable Job Flow。

Content Repository 的 Markdown Push 只触发 Content Sync；它不得构建 Next.js Docker Image 或触发 Blue-Green Deployment。

## Docker Production Hardening

- Image 使用 Multi-stage Build，只把 Runtime 必需 Artifact 带入最终 Stage
- Runtime Image 尽量 Minimal，Container 使用专用 Non-root User
- Secret 在 Runtime 注入，不 Bake 进 Image/Layer
- Production Identity 只使用 Git SHA 与固定 Digest，不使用 `latest`
- 实际可行的 Service 使用 Read-only Root Filesystem
- 必要写路径使用精确的 Writable Volume/tmpfs；Control-state SQLite 使用专用 Host-local Volume
- Drop 不需要的 Linux Capability，不共享不必要的 Host Namespace/Device
- `deploy-agent` 的 Docker/Host Access 使用最小 Scope、独立身份和完整 Audit
