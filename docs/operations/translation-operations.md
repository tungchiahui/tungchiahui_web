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

## Public Request

Public `/en-us/...` Page Request 永远不得触发 Paid Translation。

对于 Translation Spending，Public Rendering 是 Read-only 的。
