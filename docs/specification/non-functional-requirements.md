# 非功能需求

## 可靠性

- Application Deployment 不得有意中断 Production Traffic。
- Failed Inactive-slot Deployment 不得影响 Active Slot。
- Rollback 不得要求重新构建旧 Image。
- Content Sync 必须 Idempotent。
- Backup Restore 必须按计划自动测试。

## 可恢复性

目标设计：

- Immutable Application Image
- Database Base Backup
- WAL Archival
- PITR Capability
- Off-host Backup Copy
- AList `backups/` Primary Recovery Namespace 与完整 R2 Off-site Replica
- Reproducible Server Provisioning
- Independent `control-api` outside Next.js Blue/Green Slots
- PostgreSQL-independent SQLite Control-plane Recovery State
- Audited Break-glass Path using the same Recovery Engine

## 可维护性

- Strict TypeScript
- Trust Boundary 的 Runtime Validation
- Stable Project CLI
- Architecture Decision 记录为 ADR
- 不存在隐藏的 Manual Production State
- Migration 进入 Version Control
- Configuration 有文档且经过 Validation

## 安全

- Least Privilege
- Encrypted Production Secret
- HTTPS
- Secure Response Header
- Client Bundle 不包含 Secret
- 显式 Trust-boundary Validation
- Runtime/Migration/Backup Credential 尽量分离；AList v3 实例级 S3 Pair 例外按 ADR 0018 以固定
  Prefix、只读应用 Adapter、Public Prefix Deny、Artifact Encryption 和独立 R2 Credential 补偿
- Multi-stage/Minimal/Non-root Production Container
- Read-only Root Filesystem where practical, with explicit Writable Volume/tmpfs
- Docker/Host Privilege restricted to `deploy-agent`

## 性能

- Server-side Rendering/Caching 必须避免不必要的 DB Work
- PgBouncer 保护 PostgreSQL Connection Management
- Static Asset 通过 CDN/Object Storage 提供
- 昂贵的 Markdown/Translation Work 尽可能在 Content Ingestion 时执行
- 在实际可行时，Code Highlighting 应预处理/缓存，而不是在 Hot Path 上重复计算

## 可移植性

应用不得依赖 Provider-specific Blob/KV API。

Provider-specific Concern 被隔离在：

- PostgreSQL
- S3-compatible Object Storage
- Standard HTTP/CDN Behavior

## 可复现性

安装文档化的 Host Prerequisite 后，新的 Development Environment 应能够通过一个受支持命令完成 Bootstrap。

新的 Production Server 应能够从 Version-controlled Infrastructure 和 Encrypted Secret 完成 Provision。

## 网络独立性

系统不得要求永久 Public IPv4 Address。

Application、CI 和 Operator Tooling 必须使用稳定 Domain/Host Identity。

未来从 Public IPv4+IPv6 改成 IPv6-only Origin 时，不得要求修改 Application Code。

## 成本安全

Paid AI Translation 必须有显式 Trigger 和 Server-side Budget Control。

正常 Content Publishing 和 Public Page Rendering 不得意外消耗付费 AI Token。

## 控制面持久性

长时间 Operational Request 必须表示为 Durable Job/Operation，而不是绑定到 External HTTP Request 生命周期。

Content/Translation/Search/普通 Background Job 使用 PostgreSQL；Deploy/Rollback/Restore/Recovery 使用 PostgreSQL-independent host-local SQLite。Control-state Transition 必须 Atomic、Crash-recoverable、Locked、Auditable 且在 Restart 后可恢复。

`/api/ops/*` 由 OpenResty 直接路由到独立 `control-api`，不能依赖 Next.js Slot。正常 Remote Control 与 Break-glass 必须复用同一 Deployment/Recovery Engine。

## 供应链维护

Renovate 只通过 PR 提交依赖更新；`pnpm-lock.yaml` 同步更新，CI Gates 不得绕过，Core Major 默认不自动 Merge，Security Update 提高优先级，生产继续采用 Stable/LTS Version Policy。

## 方向性

Production Runtime Data 不得静默变成 GitHub Content 的第二 Authoring Source。
