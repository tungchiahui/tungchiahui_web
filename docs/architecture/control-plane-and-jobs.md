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

Phase 4 的 Local/Test 实现把上述边界具体化为：独立 Node/TypeScript `control-api`、PostgreSQL `site_control_api` NOLOGIN Role，以及 Version 2 SQLite Schema。Phase 12 以向后兼容 Version 3 Migration 增加 `production` Environment：原 Version 2 Metadata 先保留为 `local_control_metadata_v2`，再复制进扩展 Constraint 的新 Metadata Table。SQLite 继续使用 `BEGIN IMMEDIATE` Transaction、WAL、`synchronous=FULL`、`wal_autocheckpoint=1000`、Versioned Migration、Nonce Uniqueness、Append-only Audit Trigger 和 Lease Fencing Token。

Phase 12 Production Compose 将该 Store 挂载到权限受限的 `/var/lib/tungchiahui/control-state`，并交付独立 `control-api` 与 `deploy-agent` 容器。此阶段 deploy-agent 只允许 Docker `GET /_ping`、对外报告 Production Mutation Disabled；它不是 Phase 14 Deployment Engine，也没有提前实现 Cutover/Rollback。Docker Socket 只进入 deploy-agent，`control-api` 与 `content-worker` 没有该 Mount 或 deploy-control Network。

Phase 13 以向后兼容 Version 4 Migration 新增 `recovery_backup_records`，保存 Backup ID/Type、Repository Generation/Manifest Hash、WAL Max、双 Replica Freshness、有效性和真实 Bytes/Seconds；不把业务数据搬入 SQLite。`control-api` 新增 Backup/Restore Operation 与 Backup Status 路由，仍可在 PostgreSQL Down 时使用。

Phase 14 以 Additive Version 5 Migration 为 Deployment Runtime 增加 Current/Last Digest、Pending Slot/SHA/Digest Cutover Intent、Cutover Timestamp 与 Stabilization Deadline。`control-api` 的 Deployment/Rollback Endpoint 与 `./site` 只创建/读取相同 SQLite Operation；既有 `deploy-agent` 分别 Filter Claim Deployment 与 Recovery 类型，并调用唯一 Shared Engine。Deployment Lease 到期保留精确 Persisted Phase，新的 Fencing Token 根据 Pending Intent 与实际 OpenResty Slot 对账，安全 Resume。`productionOperations` 只有在该 Engine 和 Production-like Gate 交付后才为 true。

Phase 17 保持 Version 5 Schema 不变，为既有 `server-migration` Operation 增加唯一的 Typed State-machine Engine。`./site provision` 与 `./site migrate-server` 仍只通过独立 Control API 创建同一 SQLite Operation；Target 只接受 Stable Inventory/SSH Identity，Active Migration 独占 Infrastructure-operation Window。Engine 逐步记录 Provision、Physical Replication、Abort Gate、Candidate Smoke、Final WAL、Control-state Transfer、Promotion、Application/Origin Cutover、Post-switch Verify 与 Non-writing Rollback Evidence。Disposable Production-foundation Adapter 执行完整非生产演练；Production Target/SSH/DDNS Binding 不由默认配置自动激活，仍需独立 Owner 授权。

`control-api` 与 `deploy-agent` 通过 setgid/最小组写权限共享同一个 Host-local Store；各自使用 restrictive umask，不获得彼此的业务 Credential。SQLite Snapshot 执行 WAL Checkpoint + `VACUUM INTO`，验证 Schema/Integrity/Environment/Active-Previous SHA/Audit Digest，经 age 加密并复制到主 Backup Target 与独立 R2。R2 的 read-back-verified `latest.json` 允许在本地 SQLite 全损时发现最新 Artifact。显式 Break-glass 仅替换到达路径，仍向同一 Store 写 Audit/Operation 并由同一 Agent/Engine 执行。

Operation State Machine 是 `queued -> claimed -> running -> completed|failed`；Claimed Lease 到期可重新排队并增加 Fencing Token。Recovery 的 Running Lease 到期进入 `needs-attention/reconcile-required`；Deployment 则进入 `needs-attention` 并保留最后的精确 Phase，由 Phase 14 Reconciler 对账。Heartbeat 只能由匹配 Owner/Fencing Token 的未过期 Lease 续期，旧 Token 不能 Start、Heartbeat 或 Finish。

Local/Test OpenResty 在选择 Web Upstream 前直接把 `/api/ops/*` 路由到 `control-api`，隐藏 Upstream Cache Header 后强制单一 `Cache-Control: no-store`，并设置 Cache Bypass、Method/Rate-limit Test Boundary。当前 Baseline 可创建/查询 Application Job、验证 Owner Dataset Write，以及创建/查询 Infrastructure/Backup/Restore/Deploy/Rollback Operation；长时间工作不在 Request 内 Inline 执行。Deployment 由独立 Agent 完成 Inactive Lifecycle、Migration、Smoke、Atomic Cutover 与 Rollback。

### Phase 5 application-job execution baseline

Phase 5 保留 Phase 4 HTTP/Store 分流，并让 `content-worker` 执行 `content_sync`：

- Claim 只选择 `queued`/到期 `retry_wait` 的 Content Job，并使用 `FOR UPDATE SKIP LOCKED` 防止并发重复执行；
- Claim 记录 Worker、开始时间、Lease Expiry 与递增 Attempt；过期 Claim 转入 Retry 或在达到 Limit 后失败；
- Progress 与 Completion/Failure 必须匹配当前 Worker Claim，完成后清除 Lease；
- 瞬时 GitHub Read Failure 可重试；Frontmatter/AST/Route Collision/Identity 歧义属于确定性失败，不进行无意义重试；
- `ingestion_runs`、Document Snapshot 和 Alias 均留在 PostgreSQL，SQLite Schema/Scope 没有变化；
- `content-worker` 仍无 Docker Socket、OpenResty Admin、Host Shell 或 Control-state SQLite Write。

Translation/Search/Cache Job 仍只创建/查询，不在 Phase 5 提前执行。Phase 5 Content Handler 只调用标明替换阶段的零成本 Typed Hook。

### Phase 9 translation-job execution baseline

Phase 9 在同一 PostgreSQL Application-job 边界上实现 Translation Operation：

- `POST /api/ops/translations` 创建 Job；`GET /api/ops/translations/status` 与 `GET /api/ops/translations/:id` 查询状态；`POST /api/ops/translations/:id/cancel` 请求取消；
- Estimate、Execute、Read、Cancel 使用独立 Capability；Payload、Scope、Budget、Force 和两种显式 Confirmation 都经过 Zod Validation；
- `control-api` 只在事务中创建配对的 `operational_jobs`/`translation_jobs` Row 并快速返回，不持有 Provider Credential、不执行翻译；
- `content-worker` 使用 PostgreSQL Claim/Lease/Attempt/Progress 执行 Segment-level Work，在每次 Provider Request 前重新读取累计 Cost 并执行 Budget Hard Stop；
- 已完成 Segment、待重验证 Document、Usage 与 Provider/Model Audit 持久化，因此 Provider Failure 或 Revalidation Failure 可恢复而不重复已记录的付费请求；
- Translation Job 从未进入 SQLite Recovery Store；PostgreSQL 不可用时 Endpoint 安全返回不可用。

Manual GitHub Workflow 和本地 `./site translate` 都调用该 Control API。Workflow 仅获得 Translation Capability 的短期 OIDC Identity，不获得 Database、Provider 或 Host Credential。

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
