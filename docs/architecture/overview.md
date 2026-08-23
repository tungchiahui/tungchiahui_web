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
                          OpenResty
                    /          |          \
                   /           |           \
        Next.js Blue/Green   /api/ops/*    AList S3
                   |            |
                   |       PostgreSQL jobs
                   |        /           \
                   |       v             v
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


AList S3
├─ images
├─ attachments/media/libs
└─ database backup artifacts
          |
          v
   Cloudflare R2 replica
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
- Durable Background/Control Job

### AList S3

Static/Binary Storage。

保存：

- Image
- Attachment
- Music
- Mirrored Static Asset
- Backup Artifact

### Next.js

职责：

- Locale-aware Routing
- UI Rendering
- Markdown Rendering
- Data Access
- Search API/UI
- Cache/Revalidation
- Health/Readiness/Version Endpoint
- 经过认证的 `/api/ops/*` Request/Control Surface

Next.js Request Handler 不直接执行长时间 Translation/Deployment Work。

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

### OpenResty

职责：

- Production Reverse Proxy
- Active Blue/Green Upstream Selection
- 适用时的 TLS/Origin Behavior
- Safe Upstream Reload
- Host/Path Routing

### PgBouncer

在重叠运行的 Blue/Green Application Slot 与 PostgreSQL 之间提供稳定的 PostgreSQL Connection Pooling。

## 数据权威关系

```text
zh-CN Markdown authority  -> GitHub
Runtime content authority -> PostgreSQL materialized state
Static assets authority   -> AList S3
Production backup copy    -> backup repository + R2 replica
Application authority     -> Git repository + immutable image
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
