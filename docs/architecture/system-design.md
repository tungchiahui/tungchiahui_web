# System Design — Website V2

## 1. 设计目标

Website V2 被设计成一个小型但生产级的系统。

目标不是最大化技术数量，而是在成熟标准方案已经存在时避免本可避免的妥协。

系统必须具备：

```text
strongly typed
reproducible
testable
observable
recoverable
rollbackable
migration-ready
domain-addressed rather than IP-bound
safe for AI-assisted development
```

## 2. 公网架构

```text
                  IPv4 users / IPv6 users
                           |
                           v
                        EdgeOne
                           |
          +----------------+----------------+
          |                                 |
www.tungchiahui.cn                  cdn.tungchiahui.cn
          |                                 |
          +----------------+----------------+
                           |
                           v
               ddns.tungchiahui.cn:8443
                  DNS-only/DDNS origin
                           |
                       OpenResty
                  /         |          \
                 /          |           \
        Next Blue/Green   control     AList S3
                          routes
```

`ddns.tungchiahui.cn` 是 Infrastructure Origin Contract。

它可以解析为：

```text
A + AAAA
```

或者未来解析为：

```text
AAAA only
```

而不需要修改应用。

任何持久的应用/CI 配置都不应包含家庭公网数字 IP。

## 3. 应用/Runtime 架构

```text
                       OpenResty
                           |
                 +---------+---------+
                 |                   |
            Next Blue            Next Green
                 |                   |
                 +---------+---------+
                           |
                        PgBouncer
                           |
                     PostgreSQL 18
                     + PGroonga
```

Next.js 提供：

- Public Page
- Locale Routing
- Markdown Rendering
- Full-text Search Endpoint/UI
- Health/Readiness/Version Endpoint
- 经过认证的 `/api/ops/*` Control Endpoint

长时间 Operation 不在 Request 生命周期内执行。

## 4. Job 架构

```text
External trigger
      |
      v
www.tungchiahui.cn/api/ops/*
      |
 auth + Zod validation
      |
      v
PostgreSQL durable job record
      |
      +-----------------------+
      |                       |
      v                       v
content-worker            deploy-agent
```

### content-worker

负责：

- GitHub Content Fetch/Read
- Content Ingestion
- Markdown AST Processing
- OpenCC Conversion
- Translation-memory Operation
- Paid AI Translation Job
- Search-data Refresh
- Content Cache Invalidation/Revalidation

它不会获得 Docker/OpenResty Administrative Permission。

### deploy-agent

负责：

- Immutable Image Deployment
- Blue/Green Orchestration
- Safe DB Migration Orchestration
- OpenResty Upstream Cutover
- Deployment Rollback

除非明确需要，否则它不持有 Content Translation Credential。

## 5. Canonical Content Flow

```text
Local Markdown
     |
   git push
     |
     v
GitHub content repository
  canonical zh-CN
     |
     | notification/trigger
     v
/api/ops/content/sync
     |
     v
content-worker
     |
     | read-only GitHub fetch
     v
PostgreSQL
```

方向被有意设计成单向：

```text
GitHub -> PostgreSQL
```

生产系统不会自动：

- Commit
- Push
- Create PR
- Edit Markdown
- Delete GitHub File

未来如果增加 Web CMS，需要新 ADR。

## 6. 翻译 Flow

发布与付费翻译相互独立。

### Content Push 时

```text
new/changed zh-CN block
        |
        +--> translation hash hit -> reuse English
        |
        +--> translation hash miss -> pending
                                      |
                                      v
                              show zh-CN fallback
```

正常 Content Sync 不会发起任何付费 AI Request。

### 显式翻译

Operator 可以从 Local CLI 触发：

```bash
./site translate pending --dry-run
./site translate pending --execute --budget-usd 0.50
```

或者从专门的 GitHub Actions Manual Workflow 触发。

两者创建同一个 Server-side Translation Job。

Server-side Worker 强制执行 Budget，在可获得时记录实际 Token/Cost Data，写入 Translation，并 Revalidate 受影响页面。

## 7. GitHub Actions 行为

普通 Content Push Workflow：

```text
push
 -> validate
 -> trigger content sync
 -> finish
```

它不会暂停等待翻译。

手动 Translation Workflow：

```text
workflow_dispatch
 -> scope choice
 -> budget
 -> dry-run / execute
 -> trigger translation job
```

Application Deployment Workflow 和本地 `./site deploy` 调用同一套底层 Production Deployment Mechanism。

在可行情况下，GitHub Actions 应使用短期 GitHub OIDC 对 Control-plane Request 进行认证，而不是使用权限宽泛的长期 Production Token。

## 8. Storage 职责

### PostgreSQL

保存：

- Runtime Markdown
- Parsed Metadata
- Computed Route Path
- Translation
- Translation Memory
- Ingestion/Job State
- Full-text Searchable Content

### AList S3

保存：

- Image
- Attachment
- Music
- 选定的 Mirrored Static Library/Asset
- Backup Artifact

### Cloudflare R2

保存独立/异地 Backup Copy。

## 9. 开发

```bash
./site dev
```

启动：

- Local PostgreSQL
- Adobe S3Mock
- Migration
- Seed Data
- Next.js Development Server
- 需要时的 Local content-worker Support

本地开发不得要求 Production Database 或 S3 Credential。

## 10. 部署

Application Code 通过 Immutable Blue/Green Slot 部署。

```text
build Git SHA image
 -> inactive slot
 -> safe migration
 -> health
 -> ready
 -> smoke
 -> OpenResty cutover
 -> post-cutover smoke
```

Rollback 将流量切回此前完好的 Slot。

Content Publication 不会触发 Next.js Rebuild。

## 11. 数据库生命周期

- Drizzle + Versioned Migration
- Expand/Contract Schema Evolution
- PgBouncer Connection Pooling
- pgBackRest Backup
- WAL Archive
- PITR Capability
- Scheduled Restore Drill
- 计划性同 Major Server Migration 使用 Physical Streaming Replication
- 跨 Major Upgrade 使用 Logical Replication 或其他受支持的明确方法

## 12. 服务器迁移

正常 Production Automation 通过 Hostname/Alias 寻址基础设施，而不是使用长期数字 Public IP。

新服务器 Bootstrap 可能临时需要可达的 Bootstrap Address，但完成 Enrollment 后应获得稳定的 Infrastructure Hostname/SSH Inventory Identity。

计划性的同 Major Migration 使用 PostgreSQL Streaming Replication、Promotion、Application Verification 和 Origin Cutover 实现 Near-zero Downtime。

## 13. 未来失去 Public IPv4

不需要改变架构。

```text
ddns.tungchiahui.cn
A + AAAA
```

可以变为：

```text
ddns.tungchiahui.cn
AAAA only
```

EdgeOne 继续作为 IPv4/IPv6 Public Client Ingress，并将流量返回到可达源站。

如果未来完全失去所有 Inbound Public Reachability，可以把 `ddns.tungchiahui.cn` 重新指向 Relay/Tunnel Ingress。应用与自动化继续使用 Domain Contract。

## 14. 有意的非目标

当前架构不需要：

- Kubernetes
- Service Mesh
- Kafka
- Microservice Decomposition
- Always-on Multi-host PostgreSQL HA
- Elasticsearch Cluster

除非存在与之对应的问题，否则这些技术并不会让系统“更完整”。
