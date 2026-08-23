# 备份与恢复

## 目标

数据丢失和无法恢复的损坏不可接受。

## PostgreSQL 备份

基线：

- pgBackRest
- 按配置执行 Full/Differential/Incremental Policy
- WAL Archival
- PITR Capability
- Retention Policy
- Integrity Verification

## 备份目标

推荐 Flow：

```text
PostgreSQL
    |
 pgBackRest
    |
primary backup repository
    |
AList S3 or validated backup target
    |
Cloudflare R2 independent replica
```

直接使用 pgBackRest-to-AList S3 必须通过显式 Compatibility Test。

如果 AList S3 不满足所需 Repository Semantics，则使用：

```text
pgBackRest -> local backup repository -> verified sync -> AList/R2
```

正确恢复比架构形式上的整洁更重要。

## Backup Command

```bash
./site backup
```

该命令必须：

- 识别 Production DB
- 安全运行/触发 Backup
- 验证完成状态
- 验证 WAL Archive Health
- 记录 Backup Metadata
- 报告 Replica Status

## Restore

```bash
./site restore <backup-or-time>
```

没有 CLI 中明确的 Environment/Confirmation Policy 时，绝不能对 Production 执行 Destructive Restore。

Restore Control Path 不得依赖健康的待恢复 Production PostgreSQL：

```text
./site restore
      |
      v
independent control-api
      |
      v
host-local control-state SQLite
      |
      v
deploy-agent -> pgBackRest restore/PITR
```

`control-api` 与 `deploy-agent` 的基础启动、Authentication/Authorization、Recovery Operation 创建/查询、Lock/Lease 和 Audit State 必须在 PostgreSQL 不可用时继续工作。Restore 完成并验证后，Application-level Job 才重新回到 PostgreSQL-backed System。

如果正常公网 Control Path 也不可用，授权 Operator 使用显式 Break-glass Mode，通过稳定 Inventory/SSH Host Alias 调用同一个 Recovery Engine 与 SQLite State。不得维护第二套 Restore Script，也不得用 Public Numeric IP 作为 Durable Target Identity。

## Control-state Backup/Recovery

Control-state SQLite 不是业务 Database，但它保存 Active/Previous Slot、Deployment SHA 和进行中的 Recovery Phase，因此必须：

- 位于权限受限的 Host-local Durable Volume
- 使用 Transaction、WAL、适合持久性的同步与明确 Checkpoint Policy
- 在一致性 Checkpoint/Snapshot 后纳入加密的 Infrastructure-state Backup
- 在 Restore Drill 中验证 SQLite Integrity、Schema Version 与 Audit Continuity
- 能够在 State 缺失/损坏时通过 Immutable Image、OpenResty Config 与受控人工对账进行明确重建

不得把 Control-state Backup 与待恢复 PostgreSQL 放在同一个唯一故障点中。

## Restore Drill

按计划执行：

```text
select real backup
      |
disposable PostgreSQL
      |
restore
      |
migration/version check
      |
integrity queries
      |
representative application read checks
      |
control-state/recovery audit verification
      |
destroy disposable environment
```

只有成功完成 Recovery Test 的 Backup 才可信。

## RPO/RTO

在观察真实 Backup/WAL 行为后再添加精确数值目标。

没有 Measurement 时不要虚构 SLA 数字。
