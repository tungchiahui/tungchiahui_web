# 架构概览

## 系统上下文

```text
                 Users / GitHub Actions / ./site CLI
                              |
                              v
                   www.tungchiahui.cn
                              |
                           EdgeOne
                              |
                              v
                 ddns.tungchiahui.cn:8443
                    DNS-only/DDNS origin
                              |
                  Shared-host OpenResty
                       TLS termination
                              |
                  http://127.0.0.1:3100
                              |
                        V2 OpenResty
                    /          |          \
                   /           |           \
        Next.js Blue/Green   control-api   AList S3
                   |       /api/ops/*
                   |          /    \
                   |         v      v
                   | PostgreSQL    control-state SQLite
                   | app jobs      infra recovery ops
                   |      |              |
                   |      v              v
                   | content-worker  deploy-agent
                   |
                PgBouncer
                   |
             PostgreSQL 18
             + PGroonga
                   ^
                   |
           content-worker
                   ^
                   |
        GitHub zh-CN content repo
             read-only fetch


AList Asset S3
├─ images
└─ attachments/media/libs

Local encrypted pgBackRest repository + WAL
          |\
          | \-> AList Primary Backup via BACKUP_S3_*
          |      |
          |      v
          \----> Cloudflare R2 Off-site via BACKUP_OFFSITE_S3_*
```

## 网络身份

### 公共应用/控制入口

```text
https://www.tungchiahui.cn
```

控制操作位于：

```text
/api/ops/*
```

### 公共资源入口

```text
https://cdn.tungchiahui.cn
```

### 生产源站身份

```text
ddns.tungchiahui.cn
```

该名称由 DNS-only/DDNS 管理。

架构不会把正常的应用/CI/Operator 行为持久绑定到家庭公网数字 IP。

## 职责

### GitHub 内容仓库

Authoring Source of Truth。

保存：

- zh-CN Markdown
- 当前 Repository Directory Structure
- Minimal Frontmatter

不保存：

- 作为 Canonical Source 的生成英文 Markdown
- 上传图片
- Runtime Search Index
- Production DB State

同步是单向的：

```text
GitHub -> PostgreSQL
```

生产环境不会把内容回写到 GitHub。

### PostgreSQL

Runtime Structured Store。

保存：

- Source Markdown Text
- Parsed Metadata
- Stable Internal Identity
- Computed Route Path
- Content Hash
- Content Translation
- Translation-memory Segment
- Search-indexed Text
- Ingestion State
- Content/Translation/Search 等 Application Durable Job

### AList S3

Static/Binary Storage。

保存：

- Image
- Attachment
- Music
- Mirrored Static Asset

### Backup S3

加密 Recovery Artifact 位于现有 AList Bucket 的固定 `backups/` Namespace，AList 是 Primary，
Cloudflare R2 是整个 AList Bucket 的 Off-site Replica；两者接口均保持 S3-compatible，R2 使用
独立 Credential。AList v3 的 S3 Credential 是实例级，因此 Asset/Backup 以固定 Prefix、应用
只读接口和 Public Prefix Deny 隔离。Restore 优先 AList，并在 Primary 不可用或校验失败时回退 R2。

### Next.js Blue/Green Application

职责：

- Locale-aware Routing
- UI Rendering
- Markdown Rendering
- Data Access
- Search API/UI
- Cache/Revalidation
- Health/Readiness/Version Endpoint

Next.js 不提供 Privileged `/api/ops/*` Control Plane，也不直接执行长时间 Translation/Deployment Work。

### control-api

OpenResty 直接把 `/api/ops/*` 路由到该独立内部服务。它负责 Authentication/Authorization、Zod Validation、Replay/Idempotency Protection、Job Control/Status 和必要 Recovery Control，不属于任何 Next.js Blue/Green Slot。

Application Job 使用 PostgreSQL；Deploy/Rollback/Restore/Recovery 使用 host-local SQLite 最小恢复状态，从而不把 Next.js 或健康的 Production PostgreSQL 当作基础恢复前置条件。`control-api` 不拥有任意 Host/Docker 权限。

### content-worker

内部、不对公网暴露的 Worker，用于：

- Content Ingestion
- GitHub Read-only Fetch
- Translation Memory
- 显式付费 Translation Job
- OpenCC
- Search Refresh
- Revalidation

### deploy-agent

内部、不对公网暴露的 Operational Agent，用于：

- Blue/Green Deployment
- Migration Orchestration
- OpenResty Cutover
- Rollback
- PostgreSQL Restore/Recovery Orchestration

`deploy-agent` 通过受限的 Control-state Volume 保存 Active/Previous Slot、Deployment SHA、Operation Phase、Lock/Lease 与 Audit Record。只有它获得完成部署/恢复所需的最小 Docker/Host 权限。

### OpenResty

职责：

- Production Reverse Proxy
- Active Blue/Green Upstream Selection
- 适用时的 TLS/Origin Behavior
- Safe Upstream Reload
- Host/Path Routing
- `/api/ops/*` 到独立 `control-api` 的直接 Routing

生产主机已有的 1Panel OpenResty 是共享公网入口，负责 `ddns.tungchiahui.cn:8443` 的 TLS
与静态反向代理。V2 自己的 OpenResty 仅发布到 `127.0.0.1:3100`，继续独立拥有
Blue/Green Upstream Selection 和 Path Ownership；外层代理不直接指向任一 Next.js Slot。

### PgBouncer

在重叠运行的 Blue/Green Application Slot 与 PostgreSQL 之间提供稳定的 PostgreSQL Connection Pooling。

## 数据权威关系

```text
zh-CN Markdown authority  -> GitHub
Runtime content authority -> PostgreSQL materialized state
Static assets authority   -> AList S3
Production backup copy    -> local encrypted repository + AList Primary + R2 Off-site
Application authority     -> Git repository + immutable image
Infrastructure recovery   -> host-local control-state SQLite + immutable artifacts
```

## 付费翻译权威

Content Ingestion 可以识别缺失翻译，但不得隐式消耗付费 AI Token。

只有显式 Translation Job 可以调用付费 AI Provider。

## 有意排除

基线架构不包含：

- Kubernetes
- Service Mesh
- Kafka
- Microservice Decomposition
- Always-on Multi-node PostgreSQL HA
- Elasticsearch Cluster
- Production-to-GitHub Content Writeback

这些不是为了省事而省略；当前问题并不需要它们。
