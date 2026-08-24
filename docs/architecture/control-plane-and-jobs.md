# 控制面与持久任务

## 公网控制 Namespace

所有远程生产控制统一暴露在：

```text
https://www.tungchiahui.cn/api/ops/*
```

不需要单独的 Operations Domain。

示例：

```text
POST /api/ops/content/sync
POST /api/ops/translations
POST /api/ops/deployments
POST /api/ops/recovery/restores
GET  /api/ops/jobs/:id
GET  /api/ops/status
```

## Path Ownership

OpenResty 在选择 Next.js Blue/Green Upstream 之前按 Path 分流：

```text
Internet -> EdgeOne -> ddns.tungchiahui.cn:8443 -> OpenResty
                                                        |
                           +----------------------------+------------------+
                           |                                               |
                  ordinary site/API                                /api/ops/*
                           |                                               |
                           v                                               v
                 active Next.js slot                              independent control-api
```

正式 Privileged Control Plane 由独立 `control-api` 提供，不属于 Blue/Green Next.js Application Slot，也不得实现为 `src/app/api/ops/*`。普通业务 API，包括 `/api/search`、`/api/health`、`/api/ready`、`/api/version`，仍可以属于 Next.js。

这样即使两个 Next.js Slot 都不可用，`./site status`、`./site deploy` 和 `./site rollback` 仍有可用的网络与执行路径。

## Request 职责

`control-api` 应当：

1. 对调用者进行 Authentication
2. 对请求的 Capability 进行 Authorization
3. 使用 Zod 校验 Payload
4. 应用 Replay/Idempotency Protection
5. 创建或查看正确类别的 Durable Operation State
6. 提供必要的 Status/Recovery Control
7. 快速返回

它不得直接执行长时间工作，也不得拥有 Unrestricted Host Shell 或完整 Docker Socket。高权限执行交给最小权限 `deploy-agent`。

## 两类持久任务

### PostgreSQL-backed Application Job

以下任务继续使用 PostgreSQL-backed Durable Job：

- Content Sync/Ingestion
- Translation
- Search/Reindex
- 普通 Application-level Background Job

逻辑字段示例：

```text
id
job_type
status
requested_by
idempotency_key
payload
created_at
started_at
finished_at
progress
error_summary
```

Worker 安全 Claim Job，例如使用 PostgreSQL Transaction/Locking 语义中的 `FOR UPDATE SKIP LOCKED`。只要 PostgreSQL 能满足这些 Application Job 的 Durability 和 Throughput 要求，就不增加 External Queue。

当 Production PostgreSQL 不可用时，`control-api` 应安全报告这些能力不可用，而不是让整个控制面停止启动。

### PostgreSQL-independent Infrastructure Recovery Operation

以下操作不得把健康的 Production PostgreSQL 当作创建、恢复或查询 Operation 的绝对前置条件：

- Deploy
- Rollback
- PostgreSQL Restore/Recovery
- 需要基础恢复能力的 Server Migration/Disaster Recovery

单服务器 Docker Compose 基线使用 host-local SQLite 保存最小 Control-plane Recovery State。选择 SQLite 而不是自制 JSON/Atomic-file Protocol，是为了使用成熟 Transaction、Constraint、Concurrency Locking、Crash Recovery 和 Queryable Audit 能力，同时避免引入 Redis、Kafka 或 Kubernetes。

建议状态目录：

```text
/var/lib/tungchiahui/control-state/
└── control.db
```

精确 Host Path 可配置，但必须是专用、权限受限、明确挂载的 Durable Directory，不能放在 Ephemeral Container Layer。

最小状态包括：

- Active Slot
- Previous Rollback Target
- Current/Last Deployment SHA
- Target Image Identity/Digest
- Deployment/Recovery Operation Status 与 Phase
- Idempotency Key
- Actor/Reason/Timestamp/Audit Record
- Lock/Lease Owner、Expiry 与 Heartbeat

可靠性要求：

- 使用 SQLite Transaction 和 Constraint 保证 Atomic State Transition
- 使用 WAL 与适合持久性的同步设置，并明确 Checkpoint Policy
- 只使用 Host-local Filesystem；不得把 SQLite 放到语义不兼容的 Network Filesystem
- 每个 Infrastructure Operation 使用单写入锁或带 Fencing/Expiry 的 Lease
- Restart 后检查 Incomplete Operation，根据持久 Phase 安全 Resume、Rollback 或标记为需要人工处置
- Operation Log/Audit Record 不得因普通 Retry 被覆盖
- Control-state Schema Migration 必须版本化、向后兼容并可恢复

SQLite 只用于 Control-plane Recovery State，绝不是业务 Production Database。Content、Translation、Search 和普通 Application Job 不得迁入该 Store。

### Phase 4 executable baseline

Phase 4 的 Local/Test 实现把上述边界具体化为：独立 Node/TypeScript `control-api`、PostgreSQL `site_control_api` NOLOGIN Role，以及 Version 2 SQLite Schema。SQLite 使用 `BEGIN IMMEDIATE` Transaction、WAL、`synchronous=FULL`、`wal_autocheckpoint=1000`、Versioned Migration、Nonce Uniqueness、Append-only Audit Trigger 和 Lease Fencing Token。

Operation State Machine 是 `queued -> claimed -> running -> completed|failed`；Claimed Lease 到期可重新排队并增加 Fencing Token，Running Lease 到期则进入 `needs-attention/reconcile-required`，避免 Restart 后盲目重放高权限副作用。Heartbeat 只能由匹配 Owner/Fencing Token 的未过期 Lease 续期，旧 Token 不能 Start、Heartbeat 或 Finish。

Local/Test OpenResty 在选择 Web Upstream 前直接把 `/api/ops/*` 路由到 `control-api`，隐藏 Upstream Cache Header 后强制单一 `Cache-Control: no-store`，并设置 Cache Bypass、Method/Rate-limit Test Boundary。当前 Baseline 只创建/查询 Application Job、验证 Owner Dataset Write，以及创建/查询 Infrastructure Operation；没有执行真实 Content、AI、Deploy、Cutover 或 Restore。

### Phase 5 application-job execution baseline

Phase 5 保留 Phase 4 HTTP/Store 分流，并让 `content-worker` 执行 `content_sync`：

- Claim 只选择 `queued`/到期 `retry_wait` 的 Content Job，并使用 `FOR UPDATE SKIP LOCKED` 防止并发重复执行；
- Claim 记录 Worker、开始时间、Lease Expiry 与递增 Attempt；过期 Claim 转入 Retry 或在达到 Limit 后失败；
- Progress 与 Completion/Failure 必须匹配当前 Worker Claim，完成后清除 Lease；
- 瞬时 GitHub Read Failure 可重试；Frontmatter/AST/Route Collision/Identity 歧义属于确定性失败，不进行无意义重试；
- `ingestion_runs`、Document Snapshot 和 Alias 均留在 PostgreSQL，SQLite Schema/Scope 没有变化；
- `content-worker` 仍无 Docker Socket、OpenResty Admin、Host Shell 或 Control-state SQLite Write。

Translation/Search/Cache Job 仍只创建/查询，不在 Phase 5 提前执行。Phase 5 Content Handler 只调用标明替换阶段的零成本 Typed Hook。

## Normal 与 Break-glass Path

正常情况下所有操作仍优先通过：

```text
./site -> https://www.tungchiahui.cn/api/ops/* -> control-api
```

`control-api` 将 Infrastructure Operation 写入 SQLite，`deploy-agent` 从同一状态库 Claim 并调用统一 Deployment/Recovery Engine。Production PostgreSQL 不可用时，`./site restore` 仍可创建、查询并推进 Restore Operation。

如果 EdgeOne/OpenResty/`control-api` 本身不可用，授权 Operator 可以通过稳定 Ansible Inventory/SSH Host Alias 使用显式 Break-glass Mode。Break-glass 必须：

- 调用同一个 Deployment/Recovery Engine，而不是维护第二套实现
- 使用同一个 SQLite State/Lock/Audit Model
- 要求明确 Environment、Target、Reason 与 Confirmation
- 记录 Actor、入口、目标、结果和时间
- 不依赖家庭公网数字 IP 作为 Durable Identity

## Worker 分离

### content-worker

可以获得范围受限的访问权限：

- Content/Translation Table
- Read-only GitHub Content Access
- AI Translation Provider
- 需要时的 Content-related S3 Operation
- Cache Invalidation/Revalidation

不得获得：

- Docker Socket Access
- OpenResty Administrative Write Access
- Unrestricted Host Shell
- PostgreSQL Superuser Access
- Control-state SQLite Write Access

### deploy-agent

只获得执行以下操作所需的范围受限权限：

- Docker/Compose Deployment 与 Inactive Slot Lifecycle
- 已批准的 DB Migration/Restore Orchestration
- OpenResty Config Validation/Reload
- Rollback 与 Recovery State
- Control-state SQLite 的必要读写权限

它不应持有付费 AI Provider Credential 或宽泛的 Content Editing Permission。Docker/Host 权限必须限制到受支持的 Deployment/Recovery Command Surface，而不是提供任意 Root Automation。

## 认证

### GitHub Actions

优先使用短期 GitHub Actions OIDC Authentication。

服务器校验以下 Claim：

- issuer
- audience
- repository
- ref/environment
- workflow identity

避免向 GitHub Actions 提供权限宽泛的长期 Database 或 Server Credential。

### 本地 Operator CLI

本地 `./site` CLI 应在不暴露 Production DB 的情况下进行远程认证。

推荐设计：

- Asymmetric Operator Signing Key
- 服务器仅保存授权 Public Key
- 签名 Method/Path/Body Hash/Timestamp/Nonce
- Replay Protection

也可以通过 ADR 用成熟的等效机制替换该设计。

## GitHub 内容访问

生产 Content Worker 可以读取 Canonical GitHub Repository/Commit，但不得向 GitHub 回写。如果仓库是 Public，应避免引入不必要的 Write Credential。

## EdgeOne/OpenResty 处理

`/api/ops/*` 是控制面，不是可缓存内容。

要求：

- OpenResty 直接路由到 `control-api`
- Cache Bypass
- `Cache-Control: no-store`
- 适合 Control Endpoint 的 WAF/Rate-limit Rule
- Method Restriction
- 创建 Operation 前进行严格 Authentication/Authorization
