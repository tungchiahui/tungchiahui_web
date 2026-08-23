# Operator Command Interface

## 目标

通过一个稳定的 Project Command 隐藏运维实现细节。

推荐 Surface：

```bash
./site <command>
```

一个很薄的 Executable Wrapper 可以 Dispatch 到 TypeScript CLI。

Wrapper 属于 Infrastructure Glue，而不是 Application Logic。

## Remote-control 原则

正常 Operator Command 通过稳定 Domain API 访问 Production。

它们不要求 Operator 记住或配置家庭服务器的公网数字 IP。

主要 Control Endpoint：

```text
https://www.tungchiahui.cn/api/ops/*
```

OpenResty 将该 Namespace 直接路由到独立 `control-api`，不经过 Next.js Blue/Green Slot。

## 必需命令

### Development

```bash
./site dev
./site dev stop
./site dev reset
```

### Validation

```bash
./site check
./site test
```

### Production Status

```bash
./site status
```

报告：

- Active Slot
- Active Git SHA
- Inactive Slot
- Health/Readiness
- Database Connectivity
- Content/Translation Job State
- Backup Freshness
- Relevant Warning
- Control-state SQLite/Infrastructure Operation State

如果 PostgreSQL 不可用，Status 仍须返回 Active/Previous Slot、Current/Last Deployment SHA、Control-plane Health、Recovery Operation 与明确的 Database Failure；不得让整个命令因无法查询 Application Job 而失效。

### Translation

```bash
./site translate pending --dry-run
./site translate pending --execute --budget-usd 0.50
./site translate changed --dry-run
./site translate article <source-path> --dry-run
./site translate status
```

该命令创建/查询 Production-side Translation Job，不直接连接 Production PostgreSQL。

### Deployment

```bash
./site deploy
./site deploy <git-sha-or-release>
```

### Rollback

```bash
./site rollback
```

### Backup

```bash
./site backup
./site backup status
```

### Restore

```bash
./site restore <backup-or-time>
```

Restore 必须要求显式 Target Environment。

Production PostgreSQL 不可用时，正常 `./site restore` 仍通过 `control-api` 在 PostgreSQL-independent SQLite 中创建/查询 Recovery Operation，并由 `deploy-agent` 执行。

### Provision

```bash
./site provision <inventory-hostname-or-alias>
```

### Server Migration

```bash
./site migrate-server <inventory-hostname-or-alias>
```

不要让家庭公网数字 IP 成为 Durable Command Contract 的一部分。

第一次 Bootstrap Address 只能用于在分配稳定 Hostname/Alias 前 Enrollment 一台全新 Host。

## 自动化一致性

GitHub Actions 和 Human Operator 必须调用同一套底层 Production Control/Deployment Implementation。

不得创建逻辑分叉的“CI Deployment Path”和“Manual Deployment Path”。

Web Application Repository 的 `push/merge to main` 在 CI Quality Gates 全部通过后自动构建 Git-SHA-tagged Immutable Image，并调用该统一实现。`./site deploy` 只提供人工触发、重试或指定版本。Content Repository Push 只触发 Content Sync，不触发 Next.js Build/Blue-Green。

## Break-glass

当 EdgeOne/OpenResty/`control-api` 本身不可用时，CLI 可以提供显式的 Break-glass Option，通过稳定 Ansible Inventory/SSH Alias 到达目标 Host。精确 Flag 由实现确定，但契约必须：

- 要求显式 Environment、Target、Reason 与 Confirmation
- 调用与正常路径相同的 Deployment/Recovery Engine
- 使用同一个 SQLite State、Lock/Lease 与 Audit Model
- 不要求 Production PostgreSQL
- 不把家庭公网数字 IP 变成 Durable CLI Configuration
- 不提供无审计的任意 Root Shell Shortcut

## 输出

CLI Output 应简洁、结构化且以 Action 为导向。

Deployment 示例：

```text
Current slot: blue  6f82ac1
Target slot:  green c904e21

Preflight ............ OK
Migration ............ OK
Green health ......... OK
Green ready .......... OK
Smoke tests .......... OK
Traffic switch ....... OK
Post-switch smoke .... OK

Production: green c904e21
Rollback:   blue  6f82ac1
```

Exit Code 必须对自动化可靠。
