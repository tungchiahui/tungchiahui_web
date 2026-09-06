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
./site translate status <job-id>
./site translate cancel <job-id>
```

Force 重译还要求 `--force --confirm-retranslation RETRANSLATE`。Execute 模式在请求 Contract 中加入显式 Paid Confirmation；Operator CLI 不直接连接 Production PostgreSQL，也不持有 Provider Credential。输出为结构化 JSON，包含 Job、Estimate、Progress、Usage/Cost 与 Error State，供 Human/Workflow 使用可靠 Exit Code 处理。

### Deployment

```bash
SITE_DEPLOYMENT_IMAGE_DIGEST=sha256:<digest> ./site deploy
./site deploy <40-char-git-sha> --image-digest sha256:<digest> [--reason <text>] [--wait]
```

### Rollback

```bash
./site rollback [--reason <text>]
```

Deploy 的 Release Identity 必须同时包含完整 Git SHA 与固定 Registry Manifest Digest；不接受 Tag、Short SHA 或 `latest`。省略 SHA 时读取当前 Git HEAD，省略 Flag 时 Digest 只可由仓库外 `SITE_DEPLOYMENT_IMAGE_DIGEST` 提供。`--wait` 只轮询同一 SQLite Operation 到 Terminal State，不在 CLI/Workflow 进程执行 Docker、Migration、Smoke 或 Cutover。CLI、CI 与 Control API 使用相同 Endpoint、Idempotency、SQLite Operation 和 Shared Engine。

### Content automation

```bash
./site content sync <40-char-source-commit>
```

该命令只通过 Control API 创建 PostgreSQL-backed `content_sync` Application Job，不 Fetch/Materialize Content，也不触发 Translation、Application Image Build 或 Blue-Green。它是 reviewed reusable Content Workflow 的稳定客户端，不是第二套 Sync Engine。

### Backup

```bash
./site backup --environment <local|test|production> --type <full|diff|incr> --reason <text>
./site backup status
```

`--environment` 与 `--reason` 必填；Type 默认 `full`，但生产自动化应显式写出 Policy 类型。命令只创建可审计 SQLite Recovery Operation，不在 CLI Process 内直接备份。

### Restore

```bash
./site restore <backup-id-or-ISO-time> --environment <environment> --confirm RESTORE-<ENV> --reason <text>
```

Restore 必须要求显式 Target Environment、匹配 Environment 的 Confirmation 和非空 Reason。Production 固定要求 `RESTORE-PRODUCTION`。

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

Web Application Repository 的 `push/merge to main` 在 CI Quality Gates 全部通过后自动构建 Git-SHA-tagged Immutable Image，并调用该统一实现。`./site deploy` 只提供人工触发、重试或指定版本。Content Repository Push 只通过 reusable workflow 调用 `./site content sync`，不触发 Next.js Build/Blue-Green；Translation 仍只允许显式 typed `workflow_dispatch`。

## Break-glass

当 EdgeOne/OpenResty/`control-api` 本身不可用时，CLI 可以提供显式的 Break-glass Option，通过稳定 Ansible Inventory/SSH Alias 到达目标 Host。精确 Flag 由实现确定，但契约必须：

- 要求显式 Environment、Target、Reason 与 Confirmation
- 调用与正常路径相同的 Deployment/Recovery Engine
- 使用同一个 SQLite State、Lock/Lease 与 Audit Model
- 不要求 Production PostgreSQL
- 不把家庭公网数字 IP 变成 Durable CLI Configuration
- 不提供无审计的任意 Root Shell Shortcut

当前显式形式为：

```bash
./site restore <backup-id-or-ISO-time> --environment production \
  --confirm RESTORE-PRODUCTION --reason <text> \
  --break-glass --inventory-host <stable-ssh-alias>
```

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
