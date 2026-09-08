# 生产 Runbook

本文件是运维索引。底层实现细节属于 Project CLI 和聚焦的 Operations Document。

## 检查生产环境

```bash
./site status
```

确认：

- Active Slot/Version
- Health/Readiness
- PostgreSQL
- PgBouncer
- Backup Freshness
- Disk Warning

## Deploy

```bash
./site deploy <40-char-git-sha> --image-digest sha256:<digest> --reason "<change reference>"
```

创建后用 `./site status` 查询 SQLite Operation Phase。确认 Target Digest、Inactive Slot、Migration/Backup Policy、Candidate Smoke 与 Cutover Evidence。Deployment 在 Cutover 前失败时，Production 必须继续停留在 Old Slot；Post-cutover Smoke 失败时 Shared Engine 会切回 Previous Slot并把 Failed Candidate 移除。

正常 Application Release 由 Web Application Repository 的 `main` Workflow 在 CI Gates 通过后自动发起。这里的命令用于人工触发、重试或指定版本，并调用同一个 Deployment Engine。

连续发布没有固定等待时间。每次成功切流后，刚才的 Active Release 成为新的 Previous Rollback Target；准备下一候选版本会覆盖倒数第二个版本所在的 Inactive Slot。不得以连续发布为由跳过并发互斥、Migration、备份、镜像身份或 Smoke Gate。

## Rollback

```bash
./site rollback
```

当新 Application 有问题且 Database 仍保持 Backward-compatible 时使用。

Rollback 只切到 Version 5 Control State 中保留的 Previous SHA/Digest，不 Rebuild Image。若 PostgreSQL Incident 令 Application Smoke 失败，先以 `./site status` 确认 Traffic/SQLite State，再按 Database Incident 流程处理；不要把 Control-state Failure 与 Application Dependency Failure 混为一体。

## 手工安全规则

不要优先通过编辑正在运行的 Container 来“修复”Production。

优先：

1. Diagnose
2. Patch Repository
3. Test
4. Deploy Immutable Replacement

## Database Incident

1. 如果存在 Corruption/Data-loss Risk，停止高风险 Write Operation
2. 保留 Log/State
3. 使用 `./site backup status` 评估 Latest Verified Backup、WAL Max 和唯一 Off-site Replica Freshness
4. 选择 Restore Target/Time
5. 时间允许时，先 Restore 到 Disposable Validation Environment
6. 记录批准者、Environment、Target 和 Reason
7. 使用下列 Controlled Recovery 创建操作：

```bash
./site restore <backup-id-or-ISO-time> \
  --environment production \
  --confirm RESTORE-PRODUCTION \
  --reason "<incident/change reference>"
```

8. 查询操作状态和 Audit；确认 PostgreSQL Version、Migration/Schema、Integrity、代表性应用读取与 WAL Recovery Target
9. 确认 Application Readiness 后再恢复写流量和 PostgreSQL-backed Background Job

该 Restore Path 通过独立 `control-api`、Control-state SQLite 与 `deploy-agent` 工作，不要求待恢复的 Production PostgreSQL 先健康。完成 Restore/Integrity/Readiness Check 后，再恢复 PostgreSQL-backed Content/Translation/Search Job。

## Availability or 5xx

1. 比较 Public Probe 与 Direct-origin Probe：两者失败优先检查 Origin；只有 Public 失败优先检查 Edge/DNS。
2. 查询 `/api/version` 和 `./site status`，核对 Active Slot、SHA/Digest 与 OpenResty Upstream。
3. Public 失败但 `/api/ops/status` 可用时，不要误判整个 Control Plane 消失；保留 SQLite/Audit Evidence。
4. 只有新 Slot 与变更时间相关且 Database 仍向后兼容时，按 Rollback 执行；不得 Rebuild Previous Image。
5. 恢复后等待 `WebAvailabilityFailed resolved`，并从 Public 与 Origin 各做一次 Health-safe 和 Representative Content Read。

## Latency or Pool Saturation

比较 Public/Origin Duration、Next Readiness、PgBouncer TCP、PostgreSQL Connection/Lock/Slow Query 和 Host CPU/I/O。先停止不必要的 Background Work，再处理 Pool/Query Cause；不要仅扩大 Pool 把连接压力转移给 PostgreSQL。恢复后验证代表性请求、Pool Queue 和 `WebLatencyHigh`/`PgbouncerUnavailable resolved`。

## Worker Backlog or Budget Stop

区分 PostgreSQL-backed Content/Translation/Search/Revalidation Job 与 SQLite Infrastructure Operation。检查 Oldest Age、Expired Lease、Attempt/Failure、Translation Partial/Budget Stop 和精确 Progress。Budget Stop 是安全状态，不得通过提高预算自动清除；需要新的显式授权。修复 Cause 后只重试幂等 Job，并确认 Backlog/Age 回落与 `ApplicationJobStuck resolved`。

## Control State or Audit Continuity

检查 SQLite Integrity、Schema Version、WAL、Audit Count/Max ID、Operation Lease/Phase 和 Active/Previous Deployment Identity。不要依赖 Production PostgreSQL。Integrity 或 Audit Continuity 不成立时停止新的高权限 Operation，保留 Control-state Snapshot，按 Backup Verification/Break-glass 流程恢复；确认 `InfrastructureOperationStuck resolved` 后再开放创建操作。

## Backup WAL Off-site S3 or Restore Drill

逐项验证最新 Backup Age/Validity、WAL Archive、Off-site Replica 和 Restore Drill Timestamp。任一失败都不能把 Backup 标记为可恢复。按 `backup-and-recovery.md` 在 Disposable Target 重做 Integrity/Read-back；Production Restore 仍需单独授权。全部证据恢复 Fresh 后确认 `RecoveryEvidenceStale resolved`。

## S3 Incident

Static Asset 与 Article Content 在运维上彼此独立。

检查：

- AList Health
- CDN/Origin Behavior
- Bucket/Object Permission
- Off-site Backup S3 Availability（当前为 R2）

不要在没有更新并验证所有依赖 Service 的情况下 Rotation Production Credential。

代表性 Probe 必须读取 `/api/assets/monitoring/health.svg`。若只有该 Object 缺失，先核对 Activation/Key；若全部 Asset 失败，比较 Application Gateway、AList、Bucket Policy 与 CDN。恢复后验证匿名 Read、MIME/Cache Policy 以及 `AssetStorageUnavailable resolved`；不得写 Canonical Markdown 到 S3。

## Disk Pressure

删除任何内容前：

1. Identify Filesystem
2. Identify Largest Consumer
3. Protect PostgreSQL Data/WAL
4. Protect Active Backup Repository
5. 有意识地移除安全的 Cache/Build/Container Garbage
6. 需要时扩展 Storage

同时检查 Bytes 与 Inode。不要通过填满 Host Disk 做 Production Alert Test；使用 Policy Injection。清理后确认 PostgreSQL/WAL/Backup Integrity、Container Health 和 `HostDiskPressure resolved`。

## Server Replacement

先以稳定 Inventory/SSH Identity 幂等 Provision；不要把 Bootstrap 数字地址写入 Operation 或 Durable Config：

```bash
./site provision <new-host-alias> --reason "<change reference>"
```

确认 Backup/WAL/Off-site S3/Restore Evidence、Target Hardening、Storage、IPv6 与 Candidate Smoke 后，使用：

```bash
./site migrate-server <new-host-alias> --reason "<change reference>"
```

Promotion 前 Replication、Lag、Final WAL、Readiness、Backup、Storage、Smoke 或 Control-state Continuity 任一失败都必须 Abort。Promotion 后 Old PostgreSQL 保持停止且 Non-writing；不得自动重新启动形成 Split Brain。核对 Target 三阶段数据 Probe、Target Write、AAAA-only Origin/Public-like Smoke 和最终 SQLite Audit 后才开放 Rollback Window。

完整 Procedure、Cross-major 方法与显式回退边界见 `server-migration.md`。Phase 17 只证明 Disposable Readiness；真实 Production Primary、Target Inventory/Secret 和 DDNS Cutover 仍需单独 Owner 授权。

## Security Incident

- Preserve Evidence
- Rotate Affected Credential
- Invalidate Exposed Token
- Deploy Patched Version
- Review Log
- Verify Backup Integrity
- Document Root Cause and Preventative Action

Credential Scope 与轮换顺序见 `credential-rotation.md`。保留被影响时间窗的安全 Log/Audit，但不要把 Secret、Authorization/Cookie 或 Connection String 复制到 Ticket。对 Client Bundle、Image、Runtime Log 和 Response 重跑 Leakage Gate，并确认撤销证据。

## Translation

在不花费 Token 的情况下检查：

```bash
./site translate pending --dry-run
```

在显式 Budget 内执行：

```bash
./site translate pending --execute --budget-usd 0.50
```

检查 Status：

```bash
./site translate status
```

不要只是为了运行 Translation Command 而 SSH 到 Production。

## Control-plane Connectivity

正常 Remote Control Path：

```text
https://www.tungchiahui.cn/api/ops/*
```

Origin Identity：

```text
ddns.tungchiahui.cn
```

日常运维中不要把它们替换成记忆中的公网数字 IP。

如果 Origin Connectivity 失败，在修改 Application Configuration 前先诊断 DNS/DDNS/IPv6/EdgeOne Reachability。

## Origin Connectivity

分别检查 `www.tungchiahui.cn` Public Path 与 `ddns.tungchiahui.cn` Direct-origin Path；不要用其中一个替代另一个。验证 DNS A/AAAA、TLS Server Name/Certificate、IPv4/IPv6 Reachability 和 OpenResty Upstream。Origin IPv6 被要求时，AAAA 缺失或 IPv6 Direct Probe 失败必须保留为独立 Signal。恢复后确认 `OriginIpv6Unavailable resolved`，不得把家庭公网数字 IP 写进 Durable Configuration。

OpenResty 必须把 `/api/ops/*` 直接路由到独立 `control-api`，而不是 Next.js Blue/Green Slot。因此 Next.js 全挂时先验证 Control API 与 Control-state SQLite，再决定 Deploy/Rollback。

共享主机可以先用 `http://127.0.0.1:3100` 区分 V2 内部网关与 1Panel/TLS 故障：回环入口
正常而 `https://ddns.tungchiahui.cn:8443` 异常时，检查 1Panel 站点、证书和转发 Header；
两者都异常时再检查 V2 Compose、Active Slot 和 Control State。不要把回环入口发布到 LAN/WAN。

如果 EdgeOne/OpenResty/`control-api` 也不可用，使用文档化的显式 Break-glass Mode，通过稳定 Ansible Inventory/SSH Alias 调用同一个 Recovery Engine。要求 Environment、Target、Reason、Confirmation 和 Audit；不得临时发明无审计的 Root Script。

```bash
./site restore <backup-id-or-ISO-time> \
  --environment production \
  --confirm RESTORE-PRODUCTION \
  --reason "control-api unavailable: <incident reference>" \
  --break-glass \
  --inventory-host Debian
```

Break-glass 仅替换请求到达路径，不替换 Recovery Engine：它必须产生 `break_glass_restore_authorized` Audit、进入同一个 SQLite Queue，并由同一 Lease/Fencing Agent 执行。不要把公网数字 IP、临时 Root Script 或绕过 Confirmation 的命令写进 Runbook。

## Backup Verification

正常 Backup 示例：

```bash
./site backup --environment production --type full --reason "scheduled full backup"
./site backup retry-offsite <backup-id> \
  --environment production \
  --reason "retry verified AList generation"
./site backup status
```

只有同时满足以下证据才把 Backup 视为有效：pgBackRest `check`/`verify` 成功、WAL Max 已记录、AList Primary `BACKUP_S3_*` 与 R2 Off-site `BACKUP_OFFSITE_S3_*` 均为 `fresh`、两端 Manifest/逐对象 SHA-256 读回一致。任一检查失败会保留失败记录但 `valid=false`，不得用于自动 Restore 选择。写入顺序固定为 Local -> AList 完整验证 -> 从 AList 镜像 R2；AList 失败时不得触碰 R2。只有 Primary 已 Fresh 时才可用 `retry-offsite` 单独重试 R2，该命令不会新建 pgBackRest Backup。

Production 定时器固定在 `03:05 Asia/Hong_Kong`，周日 Full、其余日期 Differential，并以日期构造稳定幂等键。Provision 默认不安装也不启用该 Timer；安装或启用都必须先取得 Owner 对精确 Production 操作的批准。pgBackRest 每次成功 Backup 后自动执行本地 Expire；远端 Generation 不自动删除，AList Delete 不传播到 R2。

Production Restore Drill 必须另行获得明确授权；自动 `test:recovery` 只操作 Disposable Target。Control-state 恢复前必须验证 age Ciphertext Hash、SQLite Integrity/Foreign Key、Schema Version、Environment 和 Audit Digest。
