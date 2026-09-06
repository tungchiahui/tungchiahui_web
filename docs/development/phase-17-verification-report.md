# Phase 17 Verification Report

> 最终 Gate 结果在 Phase 17 聚焦 Commit 前记录；全部操作限于 Repository 与 Disposable Local Infrastructure

## Automated Evidence

| Gate | Result |
| --- | --- |
| Version-controlled Target Provision + second-run `changed=0` | PASS |
| Target non-root/read-only/drop-all Hardening | PASS |
| Stable Inventory Identity; numeric IP rejected by CLI/API/Engine | PASS |
| PostgreSQL 18 physical Base Backup + Streaming Replication | PASS |
| Streaming Row、Final WAL LSN catch-up、controlled source stop | PASS |
| Target Candidate Health/Ready/Version/Content/Search/Asset Smoke | PASS |
| Consistent Control-state Snapshot/Restore + final Reconcile | PASS |
| Active/Previous Identity、Operation Lease/Phase、Audit Continuity | PASS |
| Controlled Promotion + Target Write + Old Source Non-writing | PASS |
| AAAA-only Direct-origin/Public-like Smoke | PASS |
| Promotion-before failure invokes safe abort and never promotes | PASS |
| Cross-major official support review | PASS — ADR 0009 remains valid |
| PostgreSQL/PgBouncer-down independent Control API regression | PASS — idle client error is safely observed; SQLite route remains available |

最终 Production-foundation Gate 由仓库锁定的 Node `24.19.0`、pnpm `11.23.0`、PostgreSQL 18 Image 和版本化 Ansible/SOPS/age/Compose Toolchain 执行。结构化输出明确记录 `productionTraffic=false`。

## Timing and Data Evidence

最终一次完整 Disposable Rehearsal 从 Source PostgreSQL 停止到 Target Application `/api/ready` 成功为 `1036.81 ms`。Base-backup、Streaming 和 Final-WAL 三条唯一 Probe 在 Promotion 后全部存在，Target 随后成功写入并读回新 Row；Old Source Container 保持停止且 Non-writing。

该数字只描述一次本机、低数据量、同 Docker Host 的隔离演练。它不是 Production SLA、Capacity Promise、RPO 或 RTO；真实网络、数据量、DNS/DDNS、缓存、Storage 和 Operator Coordination 会改变结果。Production SLA/RPO/RTO 继续标记为 **Unknown**，直到获得明确授权的代表性多次测量。

同一 Gate 还完成既有 Blue-Green、Registry Digest、PostgreSQL-down Control、Hardening、Load/Security 和 Secret/SBOM/Critical Scan 回归。最终输出中的其他一次性 Load 数字同样不构成生产承诺。

完整 Unit 为 `28 files / 130 tests`；Application Integration、S3Mock Contract 与 Playwright `10/10` 通过；六个 Versioned Migration 的 Empty/Previous/Overlap Gate 通过。PgBouncer-down Failure Injection 最初暴露 Idle Pool Error 会退出 Control API，修复后重跑证明独立 SQLite Status/Operation Route 继续工作，而 PostgreSQL-backed Job 安全返回不可用。

## Abort and Rollback Evidence

Unit Test 注入不可收敛的 Replication Readiness Failure，证明 Engine 调用 `abortBeforePromotion` 且没有调用 Promotion。真实演练则在 Final WAL Catch-up、Backup Check、Standby/Storage/Target Readiness 和 Candidate Smoke 全部通过后才 Promote。

Promotion 后回退窗口的安全属性不是“双主切回”，而是 Old PostgreSQL 维持停止、Target 成为唯一可写权威。需要回退时必须冻结 Target Write、对账新增数据并发起新的显式 Operation；不得自动启动 Old Primary。

## Cross-major Evidence

2026-08-27 检查 PostgreSQL 18 官方文档后确认：Physical/Log-shipping 不作为 Cross-major 方法；Logical Replication 支持跨 Major，但不复制 Schema/DDL 和 Sequence State；`pg_upgrade` 适用于接受明确 Maintenance Model 的场景。详情和官方链接已进入 `docs/operations/server-migration.md`。没有出现需要 Supersede ADR 0009 的边界变化。

## Scope Confirmation

没有连接 Production Host/API/Database、真实 DNS/DDNS/EdgeOne、Public Traffic、GitHub、AList/R2、Paid AI 或旧 Nuxt Repository。Target 由临时 Host Root、高端口、自签名 Certificate、Disposable Credential/age Key、临时 Registry 和独立 PostgreSQL Volume 构成，并在 Gate 结束后清理。
