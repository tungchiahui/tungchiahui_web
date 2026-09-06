# Phase 17 Planned Server Migration Readiness

## 设计结果

Phase 17 将既有 `server-migration` SQLite Operation 从占位 Contract 扩展为可审计的迁移状态机，并通过 `./site provision` 与 `./site migrate-server` 暴露稳定入口。Target 只接受 Hostname/SSH Alias/Inventory Hostname，CLI、Control API 与 Engine 三层均拒绝数字 IP。Active Server Migration 独占 Infrastructure-operation Window，避免与 Deploy、Rollback、Backup、Restore 或另一迁移并发改变同一基础设施。

`src/server-migration/engine.ts` 是唯一迁移编排器。它复用 Control-state Transaction、Lease/Fencing、Phase Audit、Ansible Provision、Hardened Compose、Recovery Evidence 和既有 Blue-Green/Application Smoke，不增加第二套 Control Plane、Database 或 Deployment Script。`provision-only` 在 Target 幂等重建后终止；`planned-migration` 继续执行 Physical Replication、Abort Gate、Candidate Smoke、Final WAL、Control-state Transfer、Promotion、Application Reconnect、Stable-origin Cutover、Post-switch Verify 和 Non-writing Rollback Window。

Phase 17 的完整 Platform Adapter 位于 Disposable Production-foundation Gate：它从版本化 Ansible 和临时 SOPS/age Secret 建立第二台隔离 Target，使用 PostgreSQL 18 `pg_basebackup -R -X stream` 与 Replication Slot，执行真实 WAL Streaming、Write Quiesce、Promotion 和 Target Write。该 Adapter 是迁移执行能力的非生产验收边界；Production Inventory、SSH Secret、DDNS Provider 与真实 Primary 执行不会由仓库默认值自动激活，仍需 Phase 18/Owner 的精确授权和外部绑定验证。

## Control-state 与失败模型

Control-state 转移使用现有一致 Snapshot/Restore，不复制打开的 SQLite 文件。演练分别验证 Promotion 前 Snapshot 与 Operation 完成后的最终 Reconcile：

- SQLite Integrity、Schema Version 和 Environment；
- Active/Previous Slot、Current/Last SHA 与 Digest；
- 当前 Operation Phase、Lease Owner 和 Fencing Token；
- Append-only Audit Digest 及最终 `infrastructure_operation_finished` Event。

Promotion 前的任何异常都调用 `abortBeforePromotion`，并且 `promoteTarget` 不会执行。Promotion 后 Engine 不会自动重新启动 Old Primary；Old Host 必须保持 Non-writing，防止 Split Brain。Post-promotion Database 回退是新的显式 Recovery/Migration Operation，不是自动 Failback。

## 网络与数据边界

Origin Cutover 仍使用 `ddns.tungchiahui.cn`。测试 Target 的 Inventory Identity 是 `phase17-nonproduction-target`，没有把临时 Host Root、端口或数字地址写入 Durable Config。最终 Smoke 强制 `curl --ipv6` 和 AAAA-only `--resolve ... [::1]`，应用、CLI 与 Workflow 不需要为 IPv6-only 改配置。

三条唯一 Database Probe 分别在 Base Backup 前、Streaming 阶段和 Final WAL 阶段写入。Promotion 后三条必须全部存在，并能新增第四条 Target Write；Source PostgreSQL 同时必须停止。由此将 No-data-loss、Target-writable 和 Old-source-non-writing 分开验证。

## Cross-major 决策

2026-08-27 复核 PostgreSQL 18 官方 Upgrade、Physical Standby、Logical Replication Restriction、`pg_upgrade` 和 Version Policy 后，ADR 0009 仍适用：Same-major 使用 Physical Streaming；Cross-major 默认评估 Logical Replication，明确补做 Schema/DDL、Sequence、Replica Identity 与 Extension 验证；接受 Maintenance Window 时才选择适配 Target Release 的 `pg_upgrade`。本阶段不改变既有架构，因此没有新增 ADR。

## 回滚与恢复影响

本阶段没有 PostgreSQL Schema Migration，也没有改变 Backup Format 或 SQLite Schema。代码回滚会移除新 CLI/Engine，但 Version 5 SQLite 中已存在的 `server-migration` Operation Type 和历史 Audit 保持可读。已 Promote 的数据库不得通过代码回滚自动逆转；必须依照 `docs/operations/server-migration.md` 确定唯一写入权威并执行显式 Recovery Plan。

最终 Regression Gate 还发现 `node-postgres` Pool 在 PgBouncer 停止时会对 Idle Client 发出未监听的 `error` Event，令独立 `control-api` 退出。共享 Database Client 现在监听该 Event，输出经过 Redaction 的 `postgresql/idle_client_error` Telemetry；Active Query 仍按既有边界返回 Store Unavailable。Unit 与真实 PgBouncer-down Integration 证明 Control API/SQLite Route 保持可用，没有把数据库错误静默当作成功。

没有执行 Production、真实 DNS/DDNS/Public Cutover、GitHub Write、AList/R2、Paid AI、旧 Nuxt Repository 读取或修改。
