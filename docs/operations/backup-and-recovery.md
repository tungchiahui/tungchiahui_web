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

## Phase 13 Repository 决策

采用以下已实现 Flow：

```text
PostgreSQL
    |
 pgBackRest 2.59.1 encrypted local repository
    |
SHA-256 manifest + full read-back verification
    |\
    | \-> primary BACKUP_S3_* target (Production: AList)
    \---> off-site BACKUP_OFFSITE_S3_* target (Production: Cloudflare R2)
```

Phase 11 的真实 AList 证据验证了 PUT/GET/HEAD/List/Overwrite/Metadata 等应用对象语义，但也记录了 ETag 缺失和 Cache-Control 规范化；这些证据不足以证明 pgBackRest 直接 Repository 所需的全部一致性语义。因此 Recovery Flow 使用 Local Repository + Verified Sync，不把任意 S3 Provider 当作 pgBackRest 原生 Repository。每个同步 Generation 包含完整 Repository、文件/符号链接类型、逐对象 SHA-256 和 Manifest SHA-256；只有本地 pgBackRest/WAL 检查与 AList Primary、R2 Off-site 完整读回校验都通过，Backup 才标记为有效。

ADR 0018 定义两套远程存储连接：`ASSET_S3_*`/AList Primary `BACKUP_S3_*` 在 Production 指向同一 AList Bucket/Pair，Recovery Engine 只写固定 `backups/`；`BACKUP_OFFSITE_S3_*` 指向独立 R2。Parser 拒绝 AList/R2 Credential 复用和 Production HTTP Endpoint。Local Repository 不是唯一恢复副本；Restore 优先从完整读回验证的 AList Generation 重建，失败时回退同一 R2 Generation。Adapter、CLI 与 Domain Type 不绑定 Provider。

AList v3 的 `ListObjectsV2` 可能为查询的 Repository Prefix 返回重复的同名虚拟目录标记。Replica Verification 只去重并忽略精确等于 `.../repository/` 的该 Prefix Marker；随后仍要求远端 Key Set 与 Manifest 文件集合精确相等，并逐对象读回验证 SHA-256。任何嵌套目录标记、未知对象、缺失对象或内容差异仍会 Fail Closed，不能以 Provider 兼容为由跳过。

Retention 基线由 `ops/production/pgbackrest.conf` 固定：保留 2 个 Full、4 个 Differential，以及对应 2 个 Full 范围内的 WAL；定时策略运行 Full/Differential/Incremental。每次 Backup 后执行 pgBackRest `check` + `verify`，并验证 Primary 与 Off-site 对象副本。

## Backup Command

```bash
./site backup --environment production --type full --reason "scheduled full backup"
./site backup status
```

该命令必须：

- 识别 Production DB
- 安全运行/触发 Backup
- 验证完成状态
- 验证 WAL Archive Health
- 记录 Backup Metadata
- 报告 Replica Status

`backup status` 从 host-local Control-state SQLite 读取 Backup ID/Type、WAL Max、Measured Bytes/Seconds、Manifest Hash 和两端 Replica Freshness，因此 Production PostgreSQL Down 时仍可查询。

## Restore

```bash
./site restore <backup-id> --environment production --confirm RESTORE-PRODUCTION --reason "approved recovery"
./site restore <ISO-8601-time> --environment production --confirm RESTORE-PRODUCTION --reason "approved PITR"
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

```bash
./site restore <backup-id-or-ISO-time> \
  --environment production \
  --confirm RESTORE-PRODUCTION \
  --reason "control-api unavailable" \
  --break-glass \
  --inventory-host Debian
```

Break-glass 只在正常 Control API 不可用时使用。它通过稳定 SSH Alias 调用 `deploy-agent` 镜像中的授权入口，向同一个 SQLite Operation/Audit 写入请求；后续仍由同一个 Agent、Lease/Fencing 与 Recovery Engine 执行，不提供任意 Host Shell 或第二套 Restore 实现。

## Control-state Backup/Recovery

Control-state SQLite 不是业务 Database，但它保存 Active/Previous Slot、Deployment SHA 和进行中的 Recovery Phase，因此必须：

- 位于权限受限的 Host-local Durable Volume
- 使用 Transaction、WAL、适合持久性的同步与明确 Checkpoint Policy
- 在一致性 Checkpoint/Snapshot 后纳入加密的 Infrastructure-state Backup
- 在 Restore Drill 中验证 SQLite Integrity、Schema Version 与 Audit Continuity
- 能够在 State 缺失/损坏时通过 Immutable Image、OpenResty Config 与受控人工对账进行明确重建

一致性 Snapshot 使用 WAL `TRUNCATE` Checkpoint + SQLite `VACUUM INTO`，记录 Integrity、Foreign-key、Schema Version、Environment、Active/Previous Slot、Current/Last SHA、Operation/Audit Count 与 Audit Digest。Snapshot 经 age Recipient 加密后写入 Off-site Backup Target，同时保存 immutable manifest 和经读回验证的 Environment-scoped `latest.json`，因此本地 SQLite 全损时可从 R2 发现最新 Artifact。Restore 前验证 Ciphertext SHA-256、解密后的 SQLite Integrity、Environment 和 Audit Digest。

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

## Asset Object Backup

网站 Asset 与 PostgreSQL Recovery 共处 AList 的不同 Namespace。Production 从 AList 整桶逐对象
读取并计算 SHA-256，向 R2 `BACKUP_OFFSITE_S3_*` 执行 Copy/Add/Update，因此普通 Asset 和
`backups/` Recovery Artifact 都进入完整异地副本；该操作本身不连接 PostgreSQL。

默认先执行只读 Hash Audit：

```bash
./site storage backup assets
```

Owner 单独批准写入后执行：

```bash
./site storage backup assets --execute --confirm ASSET-BACKUP-PRESERVE-R2-ONLY
```

命令在 Controller 内存中解密 Production SOPS 文档，逐对象计算 SHA-256，只复制缺失对象或覆盖
同 Key 但内容变化的对象，并对每次写入做 R2 Read-back Hash Verification。成功后写入不可变的
`asset-backups/manifests/<timestamp>-<sha256>.json` 和经读回验证的
`asset-backups/latest.json`。

该命令明确采用 `copy-add-update-preserve-target-only` 语义：AList 删除或暂时不可读的对象不会从
R2 删除，R2-only 对象会保留并计入报告。任何孤儿清理都是独立 Destructive Operation，必须另行
获得 Owner 对精确对象集合的批准；当前整桶 Backup 没有删除路径。`asset-backups/` 只属于 R2
Mirror Manifest；若 AList Source 出现该 Prefix 则 Fail Closed，避免递归镜像自身 Manifest。
`backups/` 是允许且必须复制的 Recovery Namespace。

自动 Gate：

```bash
pnpm test:recovery
```

该 Gate 只使用 Disposable PostgreSQL 与一套隔离 S3Mock，不访问 Production/AList/R2。它执行真实 Full/Differential/Incremental、WAL Archive、从 Off-site Replica 重建 Repository、指定时间 PITR、PostgreSQL 18/Schema/应用读取验证，以及 age 加密 Control-state Restore。

## RPO/RTO

Phase 13 已收集一次 Disposable 小数据集 Measurement，用于证明可测量性和发现数量级，不作为 Production SLA。Production RPO/RTO 仍为未定义，直到 Production-like 数据量、网络、WAL 速率和多次演练形成足够样本；不得把 Disposable 数值外推为承诺。
