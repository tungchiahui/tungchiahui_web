# 计划性服务器迁移

## 目标与边界

使用尽可能少的 Operator Command，把 Application、PostgreSQL 与 PostgreSQL-independent Control-state 迁移到新服务器，同时以实测证据证明 No Data Loss 和 Near-zero Planned Downtime。

Phase 17 只建立并演练该能力，不激活真实 Production Primary、DNS 或 Public Cutover。真实迁移仍须单独的 Owner 授权、目标 Inventory/Secret 绑定和变更窗口。

正常入口为：

```bash
./site provision <inventory-hostname-or-alias> --reason "<change reference>"
./site migrate-server <inventory-hostname-or-alias> --reason "<change reference>"
```

两个入口都通过独立 `control-api` 创建 `server-migration` SQLite Operation。`provision` 使用 `provision-only` Action；`migrate-server` 使用 `planned-migration` Action。Operation 使用排他的 Infrastructure-operation Window、Lease/Fencing Token、逐 Phase Evidence 和 Append-only Audit，不依赖健康的 Production PostgreSQL。

Phase 17 的 Disposable Platform Adapter 通过同一 Engine 执行完整迁移。Production Migration Adapter/Inventory、SSH Credential、Target Secret 与 DDNS Provider 不在仓库内自动启用；Phase 18 Activation 必须在真实执行前验证这些外部绑定。不得把未绑定的 Operation 当作已授权的 Production Migration。

## 稳定身份

Durable Target 只接受以字母开头的 DNS Hostname、SSH Config Alias 或 Ansible Inventory Hostname。CLI、Control API Contract 和 Engine 都拒绝数字 IP 作为 Target Identity。

全新机器的首次 Enrollment 可能临时使用 Bootstrap Address，但该值不得进入 Application、CI、CLI 默认配置、Operation Target 或长期 Inventory。Production Origin Contract 始终是：

```text
ddns.tungchiahui.cn
```

## Same-major 方法

PostgreSQL 18 到 PostgreSQL 18 的 Planned Migration 使用 Physical Streaming Replication：

```text
Old PostgreSQL primary
        |
        | base backup + WAL streaming
        v
New PostgreSQL standby
        |
        | final WAL = caught up; source writes stopped
        v
Controlled promotion
```

状态机按顺序持久化：

1. `target-provisioned`
2. `replication-ready`
3. `abort-criteria-passed`
4. `candidate-smoke-passed`
5. `final-wal-confirmed`
6. `control-state-transferred`
7. `target-promoted`
8. `application-reconnected`
9. `origin-cutover-complete`
10. `post-switch-verified`
11. `rollback-window-open`

每一步都必须产生有界 Evidence。Engine 只接受 PostgreSQL Major 18、`physical-streaming`、最终 `lagBytes=0`、`sourceWriting=false` 和明确的 Promotion/Readiness/Smoke Result。

## 执行 Procedure

1. 确认变更授权、稳定 Target Identity、维护窗口和回退责任人。
2. 确认最新 Backup 是有效的：pgBackRest/WAL、Primary Replica、R2 Replica 与 Restore Evidence 均满足 Policy。
3. 使用版本化 Ansible、精确 Git SHA/Digest Image 和 SOPS/age Secret Provision Target；连续运行两次，第二次必须 `changed=0`。
4. 验证 Target Non-root、Read-only Root Filesystem、Drop-all Capability、Storage Ownership、Control-state Directory 和 IPv6 Reachability。
5. 从 Source PostgreSQL 创建 Physical Base Backup 与 Replication Slot，启动 Target Standby。
6. 验证 `pg_is_in_recovery()`、Streaming State、Replication Lag 和代表性新增 Row。
7. 在 Target 部署与 Source 相同的 Candidate，执行 Health、Ready、Version、Home、Article、Search 和 Frozen ROS2 Asset Smoke。
8. 对 Control-state 执行一致 Snapshot：WAL Checkpoint + `VACUUM INTO`；验证 Integrity、Schema、Environment、Active/Previous SHA/Digest、Operation Phase/Lease 和 Audit Digest。
9. 进入受控切换窗口，Quiesce Write，产生 Final WAL，等待 Target Replay LSN 到达 Final LSN；然后停止 Source PostgreSQL。
10. 将最后的 Control-state Snapshot 转移到 Target 并验证连续性。
11. Promote Target PostgreSQL，确认新 Timeline 和 `pg_is_in_recovery()=false`。
12. 验证现有 Target PgBouncer/Application 对 Promoted Database Ready；记录从 Source Stop 到 Target Ready 的实际时间。
13. 只通过 `ddns.tungchiahui.cn` 更新 Origin/Routing；不得持久化数字 IP。
14. 分别执行 Direct-origin、Public-like 和 AAAA-only Health/Ready/Representative Content Probe。
15. 在 Target 写入并读回迁移后 Probe，核对切换前 Base、Streaming 与 Final-WAL Row 全部存在。
16. 最终对账 SQLite Operation Completion 与 Audit，然后保留 Old Host 为停止、Non-writing 的 Rollback Source。

## Promotion 前 Abort Criteria

下列任一条件不成立都必须停止，Engine 会调用同一 Platform 的 `abortBeforePromotion`，不得强行 Promote：

- Backup 不 Fresh、未经双副本验证或 Restore Evidence 不成立；
- Replication 不 Healthy，Target 不是 Standby，Lag 不收敛或 Final WAL 不可证明；
- Target Provision 不幂等、Stable Identity 漂移、Storage/Permission/Secret/Hardening 不一致；
- Target Health、Ready、Version 或代表性 Application Smoke 失败；
- Control-state Integrity、Schema、Environment、Active/Previous Identity、Lease/Phase 或 Audit Digest 不连续；
- IPv6-only Target 在要求的 Direct-origin/Public-like Path 上不可达。

Promotion 前 Abort 应停止并清理 Disposable/Inactive Target；如果已经冻结 Source Write 但尚未 Promote，可重新启动 Source PostgreSQL并验证 Readiness。任何不确定状态都进入人工 `needs-attention`，不得跳过 Fencing。

## Promotion 后 Rollback Window

Promotion 后不得自动把 Old PostgreSQL 重新启动为 Primary，否则会产生 Split Brain。Old Host 保持停止且 Non-writing，保留其 Data、Config、Log 和 Snapshot 作为受控回退证据。

Application-only Failure 优先使用现有 Blue-Green Previous Slot。Database/Origin 回退必须作为新的、显式授权 Operation：先停止 Target Write，确定唯一数据权威和 Reverse Replication/Restore 方法，再更新 Stable Origin。无法证明 Target 新写入已完整回送时，不得简单切回 Old Primary。

## Cross-major PostgreSQL 决策

截至 2026-08-27，ADR 0009 的边界仍成立，不需要新增或 Supersede ADR：

- PostgreSQL 官方说明 File-system-level/Physical Log Shipping 通常不能跨 Major；因此不得把本 Runbook 的 Physical Streaming Procedure 用于 Cross-major。
- 官方 Upgrade 文档说明 Logical Replication 可以跨不同 Major，并可将停机缩短到数秒级；Cross-major Near-zero Planned Migration 默认先评估 Logical Replication。
- Logical Replication 不复制 Schema/DDL 和 Sequence State，且部分对象/操作有限制；执行前必须单独迁移 Schema、同步 Sequence、验证 Replica Identity/Extension/DDL，并测试 Cutover。
- 如果选择 `pg_upgrade`，则接受明确 Maintenance Window，并按目标版本的官方 `pg_upgrade` 文档执行；在 Logical Replication Cluster 的 `pg_upgrade` 场景，官方当前要求所有成员至少 PostgreSQL 17 才会迁移相关 Slot/Subscription State。

当期官方证据：

- [PostgreSQL 18 Upgrading a PostgreSQL Cluster](https://www.postgresql.org/docs/18/upgrading.html)
- [PostgreSQL 18 Log-Shipping Standby Servers](https://www.postgresql.org/docs/18/warm-standby.html)
- [PostgreSQL 18 Logical Replication Restrictions](https://www.postgresql.org/docs/18/logical-replication-restrictions.html)
- [PostgreSQL 18 pg_upgrade](https://www.postgresql.org/docs/18/pgupgrade.html)
- [PostgreSQL Versioning Policy](https://www.postgresql.org/support/versioning/)

Cross-major 实施前必须在当时重新核对 Target Release 官方支持；如果方法改变 ADR 0009 的边界，先创建或 Supersede ADR。

## Permanent HA

该架构支持基于 Replication 的 Planned Migration，不建立无 Quorum/Fencing 的 Always-on Automatic HA。Permanent HA 仍是独立 Architecture Decision。
