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
GET  /api/ops/jobs/:id
GET  /api/ops/status
```

## Request 职责

Control Endpoint 应当：

1. 对调用者进行 Authentication
2. 对请求的 Capability 进行 Authorization
3. 使用 Zod 校验 Payload
4. 应用 Replay/Idempotency Protection
5. 创建或查看 Durable Job State
6. 快速返回

长时间的 Translation、Ingestion、Deployment、Backup 或 Migration 工作不得在普通 HTTP Request 生命周期中同步执行。

## Durable Job

使用 PostgreSQL-backed Job Record 保存运维状态。

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

Worker 安全 Claim Job，例如使用 PostgreSQL Transaction/Locking 语义中的 `FOR UPDATE SKIP LOCKED`。

只要 PostgreSQL 能满足 Durability 和 Throughput 要求，就不需要额外 External Queue。

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

### deploy-agent

可以获得执行以下操作所需的范围受限权限：

- Docker/Compose Deployment
- Inactive Slot Lifecycle
- 已批准的 DB Migration Orchestration
- OpenResty Config Validation/Reload
- Rollback State

它不应持有付费 AI Provider Credential 或宽泛的 Content Editing Permission。

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

生产 Content Worker 可以读取 Canonical GitHub Repository/Commit。

它不得向 GitHub 回写。

如果仓库是 Public，应避免引入不必要的 Write Credential。

## EdgeOne/OpenResty 处理

`/api/ops/*` 是控制面，不是可缓存内容。

要求：

- Cache Bypass
- `Cache-Control: no-store`
- 适合 Control Endpoint 的 WAF/Rate-limit Rule
- Method Restriction
- 创建 Job 前进行严格认证
