# 翻译运维

## 原则

Paid AI Translation 是显式的 Production Operation。

正常 Content Push/Sync 永远不会自动消耗 AI Token。

## 翻译在哪里执行

实际 Translation Work 在生产侧 `content-worker` 中执行，靠近 Production PostgreSQL Runtime State。

Operator 不需要 SSH 到 Production 执行翻译。

External Client 只通过以下 Endpoint 创建/查询 Job：

```text
https://www.tungchiahui.cn/api/ops/translations
```

Phase 9 已实现以下专用 Surface：

```text
POST /api/ops/translations
GET  /api/ops/translations/status?limit=10
GET  /api/ops/translations/:id
POST /api/ops/translations/:id/cancel
```

该 Endpoint 由独立 `control-api` 提供，不属于 Next.js Blue/Green Slot。Translation Job 本身仍是 PostgreSQL-backed Application Job；不得迁入只服务 Deploy/Restore/Recovery 的 Control-state SQLite。Production PostgreSQL 不可用时，Endpoint 应安全报告 Translation Capability 不可用，而不是尝试在 Recovery Store 中执行翻译。

## 为什么这样设计

避免暴露：

- Production Database Credential 给 Developer Machine
- Production AI Credential 给 Developer Machine
- Production DB Port 到 Public Internet
- 不需要时把 AI Credential 交给 GitHub Actions

Production Worker 持有范围受限的 AI Credential 和 Content-table Access。

## Content Push 行为

普通 Push：

```text
push
 -> content sync
 -> reuse known translation blocks
 -> mark unknown/changed blocks pending
 -> publish latest zh-CN
 -> finish
```

它不会暂停等待 Manual Translation。

Pending English Block 渲染 Canonical zh-CN Fallback。

## Local CLI

典型 Workflow：

```bash
./site translate pending --dry-run
```

示例输出：

```text
Documents affected:    7
Pending blocks:        23
Estimated input:    8,240 tokens
Estimated output:   5,100 tokens
Estimated cost:       $0.xx

No paid request has been started.
```

当前 CLI 输出完整结构化 JSON；上述字段是该 Response 中的核心运维信息。Dry-run Job 会持久保存 Estimate 和候选 Segment，但 `provider_request_count`/Provider Call Count 保持零。

执行：

```bash
./site translate pending --execute --budget-usd 0.50
```

其他预期 Scope 可以包括：

```bash
./site translate changed --dry-run
./site translate article <source-path> --dry-run
./site translate all --dry-run
```

Force/Retranslation Flag 必须显式，而且应要求更强 Confirmation，因为它们可能绕过 Translation-memory 节省机制。

实际 Confirmation Contract：

```bash
./site translate all --dry-run --force --confirm-retranslation RETRANSLATE
./site translate all --execute --budget-usd 1.00 \
  --force --confirm-retranslation RETRANSLATE
```

Execute Request 还带有 `EXECUTE_PAID_TRANSLATION` Confirmation；CLI 根据显式 `--execute` 生成该字段，Control API 再次验证，不能由 Workflow 跳过。

## Server-side Budget Enforcement

Budget 不只是 Client-side Estimate。

每次 Paid Request 前，`content-worker` 检查 Translation Job 剩余允许 Budget。

如果下一个 Request 会超过配置 Budget：

- 不开始该 Request
- 保留已完成 Translation
- 将 Job 标记为 `partial` 或等效状态
- 剩余 Segment 保持 Pending

## Job Status

```bash
./site translate status
```

应显示最近 Job 和 Usage。

示例：

```text
Job:          183
Status:       completed
Documents:    4
Blocks reused: 3
Blocks translated: 14
Input tokens:  7,832
Output tokens: 4,019
Cost:          $0.027
```

取消：

```bash
./site translate cancel <job-id>
```

Queued/Retry-wait Job 立即进入 Durable `cancelled`；Running Job 记录 `cancel_requested_at`，Worker 在下一 Segment Provider Request 前停止。已经持久化的 Segment 与 Usage 不回滚。

## GitHub Actions Manual Workflow

Translation 是独立 Manual Workflow，不是 Content-push Workflow 必须继续执行的一步。

使用带 Typed Input 的 `workflow_dispatch`，例如：

```text
scope:
  pending
  changed
  article
  all

article:
  optional source path

budget_usd:
  numeric/string input validated server-side

dry_run:
  boolean
```

运行该 Workflow 会创建与 Local CLI 相同的 Server-side Translation Job。

仓库中的 `.github/workflows/translation.yml` 直接调用 `./site translate`，因此复用同一 TypeScript Parser、Zod Request Contract、Authentication Client 与 Control Endpoint。Workflow 只声明 `contents: read` 和 `id-token: write`，使用 `github.run_id` 形成稳定 Idempotency Key；`environment: production` 可承载 GitHub Environment Approval，而不是存放 Provider Key。

普通 `git push` 永远不会等待该 Workflow。

## Authentication

在可行情况下，GitHub Actions 应使用短期 OIDC 对 Control Request 认证。

Workflow 不应获得：

- PostgreSQL Credential
- Production Host Shell Credential
- Production AI API Key

## Translation Memory

安全时，全局复用未改变的 Semantic Block。

Changed Block 可以使用：

```text
old zh-CN
old en-US
new zh-CN
```

作为 Targeted Patch Translation Context。

不得因为一个 Block 改变就重新翻译整个 Document。

Phase 8 已建立纯数据层：Pending/Translated/Reviewed/Stale、Current Document Mapping、Mixed Materialization、Current-source Binding、Pending/Fallback/Hit Metric，以及 validated Targeted Patch Context。它不会调用 Provider。Phase 9 的显式 Job 执行必须复用这些 Row/Mapping，不得另建 Whole-document Translation Path。

Phase 9 Worker 已复用这些 Row/Mapping。每次成功调用记录 Provider、Model、Input/Output Token 与 Cost；Provider Response 还必须通过 Markdown AST/受保护值 Validator。Provider 或精确 Revalidation 失败会保留 Durable Progress 并 Retry，重验证恢复不会重复已记录的 Provider 调用。Budget 不覆盖的剩余块继续 Pending/Fallback。

## Provider 与授权边界

Local/Test 和所有 Automated Test 固定使用 Fake Provider。Production Provider 厂商尚未由 Accepted ADR 选定；Phase 9 交付的是经过严格 Validation 的 Paid Adapter Boundary，不静默固化 Vendor。真实 Provider Contract Test 只有在 Owner 明确提供非生产 Target、Credential 与付费授权后才运行。

## Public Request

Public `/en-us/...` Page Request 永远不得触发 Paid Translation。

对于 Translation Spending，Public Rendering 是 Read-only 的。
