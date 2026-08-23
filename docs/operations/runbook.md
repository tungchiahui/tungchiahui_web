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
./site deploy
```

如果 Deployment 在 Cutover 前失败，Production 应继续停留在 Old Slot。

正常 Application Release 由 Web Application Repository 的 `main` Workflow 在 CI Gates 通过后自动发起。这里的命令用于人工触发、重试或指定版本，并调用同一个 Deployment Engine。

## Rollback

```bash
./site rollback
```

当新 Application 有问题且 Database 仍保持 Backward-compatible 时使用。

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
3. 评估 Latest Known-good Backup/WAL
4. 选择 Restore Target/Time
5. 时间允许时，先 Restore 到 Disposable Validation Environment
6. 使用 `./site restore <backup-or-time>` 执行 Controlled Recovery

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
