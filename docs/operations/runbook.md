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

## Rollback

```bash
./site rollback
```

当新 Application 有问题且 Database 仍保持 Backward-compatible 时使用。

Rollback 只切到 Version 5 Control State 中保留的 Previous SHA/Digest，不 Rebuild Image。Stabilization Window 内不得手工删除或覆盖 Previous Container。若 PostgreSQL Incident 令 Application Smoke 失败，先以 `./site status` 确认 Traffic/SQLite State，再按 Database Incident 流程处理；不要把 Control-state Failure 与 Application Dependency Failure 混为一体。

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
3. 使用 `./site backup status` 评估 Latest Verified Backup、WAL Max 和两套 Replica Freshness
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

## S3 Incident

Static Asset 与 Article Content 在运维上彼此独立。

检查：

- AList Health
- CDN/Origin Behavior
- Bucket/Object Permission
- R2 Backup Availability

不要在没有更新并验证所有依赖 Service 的情况下 Rotation Production Credential。

## Disk Pressure

删除任何内容前：

1. Identify Filesystem
2. Identify Largest Consumer
3. Protect PostgreSQL Data/WAL
4. Protect Active Backup Repository
5. 有意识地移除安全的 Cache/Build/Container Garbage
6. 需要时扩展 Storage

## Server Replacement

使用：

```bash
./site migrate-server <new-host>
```

遵循 `server-migration.md`。

## Security Incident

- Preserve Evidence
- Rotate Affected Credential
- Invalidate Exposed Token
- Deploy Patched Version
- Review Log
- Verify Backup Integrity
- Document Root Cause and Preventative Action

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

OpenResty 必须把 `/api/ops/*` 直接路由到独立 `control-api`，而不是 Next.js Blue/Green Slot。因此 Next.js 全挂时先验证 Control API 与 Control-state SQLite，再决定 Deploy/Rollback。

如果 EdgeOne/OpenResty/`control-api` 也不可用，使用文档化的显式 Break-glass Mode，通过稳定 Ansible Inventory/SSH Alias 调用同一个 Recovery Engine。要求 Environment、Target、Reason、Confirmation 和 Audit；不得临时发明无审计的 Root Script。

```bash
./site restore <backup-id-or-ISO-time> \
  --environment production \
  --confirm RESTORE-PRODUCTION \
  --reason "control-api unavailable: <incident reference>" \
  --break-glass \
  --inventory-host tungchiahui-production-origin
```

Break-glass 仅替换请求到达路径，不替换 Recovery Engine：它必须产生 `break_glass_restore_authorized` Audit、进入同一个 SQLite Queue，并由同一 Lease/Fencing Agent 执行。不要把公网数字 IP、临时 Root Script 或绕过 Confirmation 的命令写进 Runbook。

## Backup Verification

正常 Backup 示例：

```bash
./site backup --environment production --type full --reason "scheduled full backup"
./site backup status
```

只有同时满足以下证据才把 Backup 视为有效：pgBackRest `check`/`verify` 成功、WAL Max 已记录、主 `BACKUP_S3_*` 与独立 R2 均为 `fresh`、Manifest/逐对象 SHA-256 读回一致。任一副本失败会保留失败记录但 `valid=false`，不得用于自动 Restore 选择。

Production Restore Drill 必须另行获得明确授权；自动 `test:recovery` 只操作 Disposable Target。Control-state 恢复前必须验证 age Ciphertext Hash、SQLite Integrity/Foreign Key、Schema Version、Environment 和 Audit Digest。
