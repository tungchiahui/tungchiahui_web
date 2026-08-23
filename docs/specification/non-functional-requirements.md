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
- Independent R2 Replica
- Reproducible Server Provisioning

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
- Runtime/Migration/Backup Credential 分离

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

长时间 Operational Request 必须表示为 Durable Job，而不是绑定到 External HTTP Request 生命周期。

## 方向性

Production Runtime Data 不得静默变成 GitHub Content 的第二 Authoring Source。
