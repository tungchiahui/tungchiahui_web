# ADR 0015：使用 PostgreSQL-independent Control-plane Recovery State

- Status: Accepted
- Date: 2026-08-23
- Clarifies: ADR 0002, ADR 0004, ADR 0009, ADR 0013

## Context

PostgreSQL-backed Durable Job 适合 Content Sync、Translation、Search/Reindex 和普通 Application Background Work，但 Deploy、Rollback、PostgreSQL Restore/Recovery 如果必须先向同一个 Production PostgreSQL 写入 Job，就会在 Database 故障时无法启动救援操作。单服务器 Docker Compose 架构还需要可靠保存 Active Slot、Rollback Target、Deployment SHA、Operation Phase、Lock 与 Audit State。

## Decision

继续把所有业务 Runtime Content 与 Application Job 保存在 PostgreSQL。仅对 Deploy、Rollback、PostgreSQL Restore/Recovery 和必要 Server Migration/Disaster Recovery，使用专用 host-local SQLite 保存最小 Control-plane Recovery State。

SQLite 位于权限受限、明确挂载的 Durable Host Directory，不在 Ephemeral Container Layer，也不放到语义不兼容的 Network Filesystem。实现必须使用 Transaction/Constraint、WAL、适合持久性的同步与 Checkpoint Policy、单写入锁或带 Fencing/Expiry 的 Lease、版本化 Schema Migration、Crash Restart/Resume 以及不可被 Retry 覆盖的 Audit Record。

正常操作仍通过 `https://www.tungchiahui.cn/api/ops/*` 与独立 `control-api`；`deploy-agent` Claim 并执行 Operation。如果该公网控制路径本身不可用，授权 Operator 可通过稳定 Host/Inventory Identity 使用显式 Break-glass Mode，但必须调用同一个 Deployment/Recovery Engine、SQLite State 与 Audit Model。

## Consequences

Production PostgreSQL 不可用时，`./site restore` 以及基础 Deploy/Rollback/Recovery State 仍可创建、查询和恢复。SQLite 成为需要备份、权限控制、完整性检查和恢复演练的最小 Control-plane State，但它绝不是业务 Production Database，也不得承载 Content、Translation、Search 或普通 Application Job。该决策不 Supersede ADR 0002；它明确了 PostgreSQL Runtime Store 的边界。
