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
