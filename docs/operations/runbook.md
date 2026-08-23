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
6. 执行 Controlled Recovery

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
