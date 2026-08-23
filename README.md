# TungChiaHui Website V2 — 工程文档

> 状态：架构基线  
> 基线日期：2026-08-23  
> 目的：在不继承旧实现技术债的前提下，将个人网站重建为一个可长期维护、生产级的 Next.js 系统。

本仓库是一个**全新的实现**，不是在 Nuxt 项目中原地迁移。

旧 Nuxt 仓库只作为只读的行为与视觉参考。现有 URL 和重要的用户可见行为应在可行范围内保留，但新系统必须遵循本文档规定的架构。

## 用一句话概括最终架构

**GitHub 是 zh-CN Markdown 的权威编写源；PostgreSQL 是生产运行时的内容/搜索/翻译存储；AList S3 用于静态资源与备份制品；Next.js 通过 OpenResty 采用完整 Blue-Green Deployment；独立 `control-api` 通过 `www.tungchiahui.cn/api/ops/*` 提供不依赖 Next.js Slot 的生产控制，并以 PostgreSQL-independent 的最小恢复状态支撑 Deploy/Restore；`ddns.tungchiahui.cn` 是 DNS-only/DDNS 的源站身份，家庭公网数字 IP 永远不是持久的应用或 CI 配置。**

## 核心原则

1. **GitHub 是 zh-CN Markdown 内容的 Source of Truth。**
2. **GitHub → PostgreSQL 的内容同步是单向的。除非未来 ADR 明确引入 CMS 工作流，否则生产环境永远不会向 GitHub commit、push、创建 PR 或回写内容。**
3. **PostgreSQL 是生产运行时内容存储。**
4. **S3-compatible storage 用于静态/二进制资源和备份，而不是文章 Markdown。**
5. **在 TypeScript 本身适合作为原生格式的地方，应用源码仅使用 TypeScript/TSX。**
6. **生产应用部署采用完整 Blue-Green Deployment。**
7. **数据库 Schema 变更采用向后兼容的 Expand/Contract Migration。**
8. **本地开发必须可以用一条命令复现，并使用彼此隔离的本地 PostgreSQL + S3Mock。**
9. **部署、回滚、备份、恢复、Provision、翻译和服务器迁移都通过一个稳定的项目 CLI 暴露。**
10. **备份在完成恢复测试之前不视为有效。**
11. **付费 AI 翻译必须显式触发且受预算约束。内容 push/publish 永远不会隐式消耗 AI Token。**
12. **英文翻译缺失的 Block，在显式完成翻译前回退显示最新的权威 zh-CN Block。**
13. **公网控制操作统一使用 `https://www.tungchiahui.cn/api/ops/*`；不需要单独的 Ops 域名。**
14. **`ddns.tungchiahui.cn` 是生产源站 Hostname。它由 DNS-only/DDNS 管理，可以解析为 IPv4+IPv6，也可以只有 IPv6。**
15. **公网数字 IP 地址不得成为长期的应用、CI、CLI、部署或源站配置。**
16. **内容任务与部署任务分别由不同的最小权限 Worker/Agent 执行。**
17. **Web Application Repository 合并或 Push 到 `main` 后，必须先通过 CI Quality Gates，再自动构建 Git SHA Immutable Image 并通过统一 Deployment Engine 执行 Production Blue-Green Deployment；Content Repository Push 只触发 Content Sync。**
18. **Renovate 负责创建 Dependency Update PR；它不得直接修改 `main`，升级仍须通过 Review 与全部 CI Quality Gates。**
19. **不得仅仅因为这是个人网站，就简化已经确定的工程要求。**

## 网络身份

```text
Users / GitHub Actions / local ./site CLI
                  |
                  v
      https://www.tungchiahui.cn
                  |
               EdgeOne
                  |
                  v
      ddns.tungchiahui.cn:8443
        DNS-only / DDNS origin
                  |
              OpenResty
               /       \
              v         v
    Next Blue/Green   control-api
```

家庭网络可以从：

```text
public IPv4 + public IPv6
```

变化为：

```text
public IPv6 only
```

而无需修改应用代码、GitHub Workflow 或 Operator CLI 配置。只有 DNS/DDNS 的源站可达性会发生变化。

如果将来家庭服务器失去所有可公开访问的入站 IP 连接，同一个源站 Hostname 契约可以重新指向 Relay/Tunnel Ingress，而无需重新设计应用。

## 控制面

运维 API Namespace：

```text
https://www.tungchiahui.cn/api/ops/*
```

示例：

```text
POST /api/ops/content/sync
POST /api/ops/translations
POST /api/ops/deployments
GET  /api/ops/jobs/:id
GET  /api/ops/status
```

OpenResty 在 Blue/Green Application Routing 之前按 Path 分流：普通网站与业务 API 进入 Active Next.js Slot；`/api/ops/*` 直接进入独立 `control-api`。因此 Next.js Blue/Green 全部不可用时，控制面仍有机会提供 Status、Deploy 与 Rollback。

`control-api` 负责 Authentication、Capability Authorization、Zod Validation、Replay/Idempotency Protection、Job Control/Status 与必要 Recovery Control。它不属于 Next.js Blue/Green Slot，也不是万能 Root Service。这些 Endpoint 创建/查询 Job 并快速返回，不在 HTTP Request 内执行长时间任务。

```text
OpenResty /api/ops/* -> control-api
                           |
              +------------+-------------+
              |                          |
              v                          v
 PostgreSQL durable jobs      host-local control-state SQLite
 Content/Translation/Search    Deploy/Rollback/Restore/Recovery
              |                          |
              v                          v
       content-worker                deploy-agent
```

`content-worker` 和 `deploy-agent` 被有意赋予不同权限。

SQLite 只用于单服务器 Control-plane Recovery State，绝不是业务 Production Database。它保存 Active Slot、Rollback Target、Deployment SHA、Recovery Operation、Lock/Lease 与 Audit Record，并通过 Transaction、WAL、同步落盘和受限的明确 Writable Volume 支持 Crash Recovery。Content/Translation/Search Job 继续使用 PostgreSQL。

## 内容发布与翻译

内容 Push 永远不会被翻译阻塞：

```text
git push
   |
   v
content sync
   |
   +--> zh-CN latest -> PostgreSQL -> publish/revalidate
   |
   +--> existing EN block hash hit -> reuse
   |
   +--> missing/changed EN block -> pending
                                   |
                                   v
                        zh-CN fallback on en-US
```

不会自动发起任何 AI Request。

翻译是后续的显式操作：

```bash
./site translate pending --dry-run
./site translate pending --execute --budget-usd 0.50
```

GitHub Actions 的手动 `workflow_dispatch` 可以触发同一个 Translation Job，而不会阻塞正常的 Push/Content Sync Workflow。

## 目标技术栈基线

- Next.js 16.x Active LTS
- Node.js 24 LTS
- TypeScript strict mode
- Tailwind CSS 4
- shadcn/ui + Base UI
- next-intl
- PostgreSQL 18
- PGroonga for multilingual full-text search
- Drizzle ORM + versioned SQL migrations
- Zod 4 for runtime validation
- PgBouncer
- unified / remark / rehype for Markdown processing
- Shiki for code highlighting
- Biome
- Vitest
- Playwright
- pnpm
- Docker Compose
- OpenResty
- SOPS + age
- Ansible
- pgBackRest + WAL/PITR
- Adobe S3Mock for local S3 emulation
- AList S3 for production static assets
- Cloudflare R2 as off-site backup target
- SQLite as host-local control-plane recovery state only
- Renovate for Dependency Update PR automation

实际实现中必须固定 Patch Version 和 Container Digest。Renovate 自动创建可 Review 的 Dependency Update PR 并同步维护 `pnpm-lock.yaml`；所有升级通过现有 CI Quality Gates。Core Major Update 默认不自动 Merge，Security Update 提高优先级，生产仍不默认跟踪 Beta/Canary 或 `latest` Tag。

Production Docker Image 使用 Multi-stage Build、尽量 Minimal 的 Runtime Image 和 Non-root User；Secret 不得 Bake 进 Image。实际可行的 Service 使用 Read-only Root Filesystem，只通过明确的 Writable Volume/tmpfs 写入必要数据，并保持最小 Linux Capability。`content-worker` 不得访问 Docker Socket；只有 `deploy-agent` 获得完成部署所需的最小 Docker/Host 权限。

## 正常生产发布路径

Web Application Repository 的正常发布路径固定为：

```text
push/merge to main
 -> CI Quality Gates
 -> build Git-SHA-tagged immutable image
 -> control-api / shared Deployment Engine
 -> inactive Blue/Green slot
 -> pre-cutover health/ready/smoke
 -> OpenResty cutover
 -> post-cutover public smoke
```

`./site deploy [git-sha-or-release]` 保留为人工触发、重试或指定版本部署入口，并调用完全相同的 Control Plane 与 Deployment Engine。Content Repository 的 Markdown Push 只触发 Content Sync，不触发 Next.js Image Build 或 Blue-Green Deployment。

## 文档地图

### 项目治理

- `AGENTS.md` — Coding Agent 的权威指令。
- `CLAUDE.md` — Claude Code 入口；要求 Claude 遵循项目权威规则。
- `CONTRIBUTING.md` — 贡献流程与质量门禁。
- `SECURITY.md` — 安全要求与漏洞处理。

### 规格

- `docs/specification/project-requirements.md`
- `docs/specification/non-functional-requirements.md`
- `docs/specification/acceptance-criteria.md`

### 架构

- `docs/architecture/system-design.md` — 最终完整架构介绍。
- `docs/architecture/overview.md`
- `docs/architecture/network-and-origin.md`
- `docs/architecture/control-plane-and-jobs.md`
- `docs/architecture/technology-stack.md`
- `docs/architecture/data-model.md`
- `docs/architecture/content-pipeline.md`
- `docs/architecture/internationalization.md`
- `docs/architecture/search.md`
- `docs/architecture/caching.md`

### 开发

- `docs/development/local-development.md`
- `docs/development/testing-strategy.md`
- `docs/development/configuration-and-secrets.md`
- `docs/development/code-quality.md`

### 运维

- `docs/operations/command-interface.md`
- `docs/operations/deployment.md`
- `docs/operations/blue-green-deployment.md`
- `docs/operations/database-migrations.md`
- `docs/operations/translation-operations.md`
- `docs/operations/backup-and-recovery.md`
- `docs/operations/server-migration.md`
- `docs/operations/observability.md`
- `docs/operations/runbook.md`

### 迁移

- `docs/migration/nuxt-to-next.md`

### 架构决策

参见 `docs/decisions/README.md`。

## 稳定的 Operator Interface

Operator 不需要记忆底层 Docker、PostgreSQL、OpenResty、Ansible、Backup 或 Worker 命令。

稳定入口为：

```bash
./site dev
./site test
./site check
./site status
./site translate
./site deploy
./site rollback
./site backup
./site restore
./site provision
./site migrate-server
```

`./site` 背后的实现可以演进。除非明确进行版本化，否则命令契约必须保持稳定。
