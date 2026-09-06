# AGENTS.md

本文件是面向 Coding Agent 的**仓库级权威指令集**。

所有 AI Coding Agent 在修改仓库前都必须阅读并遵守本文件。工具专用指令文件可以增加约束，但不得削弱这里的规则。

## 1. 架构权威

进行架构变更前，阅读：

1. `README.md`
2. `docs/architecture/overview.md`
3. `docs/architecture/technology-stack.md`
4. `docs/decisions/` 中相关 ADR

如果实现便利性与 ADR 冲突，以 ADR 为准，直到新的明确架构决策 Supersede 它。

不得静默替换已经选择的技术，也不得引入平行系统。

## 2. 语言策略

在适合使用 TypeScript 的地方，应用源码和自动化源码必须使用 TypeScript/TSX。

允许保持原生格式的内容继续使用原生格式：

- SQL migrations: `.sql`
- Docker: `Dockerfile`
- Docker Compose: YAML
- OpenResty/Nginx: native config
- Ansible: YAML
- Markdown: `.md`
- shell: 仅在不可避免时使用非常薄的 Bootstrap Wrapper

不得引入 `.js` 或 `.jsx` 应用文件。

### TypeScript 要求

- `strict: true`
- `noUncheckedIndexedAccess: true`
- `exactOptionalPropertyTypes: true`
- `noImplicitOverride: true`
- 不得随意使用 `any`
- 不得使用 `@ts-ignore`
- 优先使用 `unknown` + Validation，而不是 `any`
- 外部数据边界必须进行 Runtime Validation
- Closed Union 必须 Exhaustive Handling
- Shared Domain Type 不得跨层重复定义

如果确实必须例外，需在代码旁和 PR Description 中记录原因。

## 3. 前端策略

使用：

- Next.js App Router
- 默认使用 React Server Components
- 只有交互确实需要时才使用 Client Components
- Tailwind CSS 4
- 使用 Base UI Primitive 的 shadcn/ui
- next-intl

不得引入：

- 第二套 CSS Framework
- CSS-in-JS
- 另一套 Component Framework
- 另一套 i18n Library
- Pages Router
- Component 中硬编码的用户可见 UI 文本

所有可复用的用户可见 UI 文案必须通过 next-intl Message Key。

## 4. 数据策略

### PostgreSQL

PostgreSQL 是运行时内容与结构化数据存储。

使用 Drizzle 做 Schema/Type Integration 和版本化 Migration。

不得引入：

- Prisma
- Sequelize
- TypeORM
- MongoDB
- SQLite 作为业务 Production Runtime Store；唯一例外是 ADR 0015 定义的 host-local Control-plane Recovery State
- Redis 作为持久化
- 使用文件系统持久化业务应用状态；ADR 0015 定义的受限 Recovery-state Volume 不在此列

除非已批准 ADR 改变架构。

### GitHub 内容仓库

zh-CN Markdown 仓库是文章和 Wiki 内容的 Source of Truth。

Runtime Database 是生产环境的 Materialized Representation，而不是 Authoring Source。

Content Sync 必须：

- Deterministic
- Idempotent
- 同一个 Commit 可安全重复执行
- 涉及多条相关 Row 修改时使用 Transaction
- 能够有意识地处理删除与移动

### S3

生产 Asset S3（当前部署选择为 AList）用于：

- 图片
- 附件
- 音乐/静态媒体
- 网站有意镜像的第三方静态资源

生产 Backup S3（当前部署选择为 Cloudflare R2）用于数据库与 Control-state 的加密异地备份制品。

不得在 S3 中存储 Canonical Article Markdown。

## 5. 内容兼容性

不得随意改变：

- 当前 Markdown 目录结构
- 当前 Minimal Frontmatter 理念
- 现有 Public URL Pattern
- 中文转拼音的 Route 行为
- Locale-prefixed Routing

支持的 Locale：

```text
zh-cn
zh-hk
zh-tw
en-us
```

在可以保留原始 Route 的情况下，避免建立 Redirect Map。

Legacy Route 是兼容性要求，而不是实现方式要求。

## 6. 翻译策略

UI i18n 和 Content i18n 是两个独立系统。

### UI

- Source UI Locale: `zh-CN`
- next-intl Message 与应用源码一起存储
- `zh-HK` 和 `zh-TW`: 适用时使用 Deterministic Conversion
- `en-US`: Semantic Translation
- 修改 UI 文案时必须检查所有 Locale Message

### Content

- GitHub 只保存 zh-CN
- PostgreSQL 保存 Runtime Translation
- 英文翻译使用 Semantic-block Incremental Translation
- Translation Memory 为 Block-level
- 未改变的 Block 必须复用
- 必须保持 Markdown AST Structure
- Code Fence、Code、URL、Identifier 和受保护语法不得盲目翻译
- zh-HK / zh-TW 使用基于 OpenCC 的转换，并在需要时增加明确 Exception/Glossary

不得因为一个 Paragraph 改变就重新翻译整个 Document。

## 7. 搜索策略

生产 Full-text Search 必须是 Server-side 且由 PostgreSQL 支撑。

基线 Search Engine 是 PostgreSQL + PGroonga。

不得通过把所有文章正文下载到浏览器后执行 `includes()`，或建立仅 Client-side 的临时 Search Index 来实现生产搜索。

Search 行为必须有自动化 Relevance 和 Locale Test。

## 8. 配置与 Secret

依赖环境的值应进入经过 Validation 的 Configuration。

Secret 永远不得以明文提交。

使用：

- `.env.example` 记录变量名
- `.env.local` 作为本地开发 Override，并 Gitignore
- SOPS + age 加密生产 Secret
- Zod 做 Startup Validation

不应把本应成为 Typed Constant 的代码级 Invariant 放进 Environment Variable。

## 9. 开发环境

`./site dev` 必须始终作为受支持的一键开发入口。

它必须启动或验证：

- Local PostgreSQL
- Local S3Mock
- 所需 Bucket/Resource
- Migration
- Development Seed Data
- Next.js Development Server
- Local `control-api` 与隔离的 Control-state SQLite

开发不得要求生产 Credential。

## 10. 测试

在改动可以视为完成之前，运行适当的 Gate。

最低 Merge Gate：

```text
format/lint
typecheck
unit tests
integration tests
database migration tests
build
E2E tests for affected critical flows
```

Storage Code 还必须通过：

- Local S3Mock Test
- 在适用情况下，针对指定非生产 Bucket 的 Production-compatible AList S3 Contract Test

绝不能对生产资源运行 Destructive Test。

## 11. 数据库 Migration

生产 Migration 必须版本化且可 Review。

Blue-Green Compatibility 是强制要求。

使用 Expand/Contract：

1. 以向后兼容方式 Expand Schema
2. 部署同时兼容新旧 Schema 的代码
3. Migrate/Backfill
4. Verify
5. 在后续 Release 中 Contract 过时 Schema

不得在引入替代结构的同一个 Release 中执行 Destructive Schema Replacement。

## 12. 部署

Deployment 使用 Blue-Green。

Web Application Repository 的正常生产发布路径必须是：

```text
push/merge to main
-> CI Quality Gates
-> Build Git-SHA-tagged Immutable Image
-> Production Blue-Green Deployment
-> Pre-cutover Health/Readiness/Smoke
-> OpenResty Cutover
-> Post-cutover Public Smoke
```

GitHub Actions 与 `./site deploy` 必须调用同一个 Control Plane、Deployment Engine 和 Policy，不得维护两套实现。`./site deploy` 保留用于人工触发、重试和指定版本。Content Repository Push 只执行 Content Sync，不得触发 Next.js Image Build/Blue-Green。

绝不在原地替换 Active Application Container。

一次 Deployment 必须：

1. 确认 Active/Inactive Slot
2. 部署以 Git Commit SHA Tag 的 Immutable Image
3. 应用安全 Migration
4. 启动 Inactive Slot
5. 通过 Health/Readiness Check
6. 通过 Smoke Test
7. 切换 OpenResty Upstream
8. 执行 Post-switch Smoke Test
9. 保留 Previous Slot，以便立即 Rollback

不得使用 `latest` 作为 Deployment Identity。

Production Docker 必须：

- 使用 Multi-stage Build
- Runtime Container 使用 Non-root User 和尽量 Minimal 的 Image
- 不把 Secret Bake 进 Image
- 在实际可行的 Service 上使用 Read-only Root Filesystem
- 只通过明确的 Writable Volume/tmpfs 提供必要写路径
- Drop 不需要的 Linux Capability，并遵守 Least Privilege
- 仅向 `deploy-agent` 授予完成部署所需的最小 Docker/Host 权限

`content-worker` 不得获得 Docker Socket。

## 13. 备份

Backup Command 成功不足以证明可恢复性。

系统必须支持：

- pgBackRest
- WAL Archival
- 配置后的 PITR
- Off-host Copy
- R2 Off-site Replica
- Automated Restore Drill

可能影响 Backup/Restore 行为的变更必须包含 Recovery Validation Plan。

## 14. 可观测性

增加生产功能时必须考虑：

- Structured Log
- 有用的 Error
- Metrics
- 对 Health/Readiness 的影响
- 适用时的 Trace
- Alertability

不得记录 Credential、Access Token、Private Key、Connection String 或敏感 Header。

## 15. 安全

- 最小权限 DB Application Role
- 最小权限 S3 Credential
- 每个 Trust Boundary 校验输入
- Secure Header
- 生产 HTTPS
- 对易滥用 Endpoint 做 Rate Limit
- Secret 不得暴露到 Client Bundle
- Dependency Security Update 不得无限期忽略

## 16. 依赖策略

- 核心基础设施使用 Stable Production Release，而不是 Canary/Beta
- 使用受支持的 LTS Runtime
- Container Image 按 Version/Digest 固定
- 提交 `pnpm-lock.yaml`
- 使用 Renovate 自动创建 Dependency Update PR，并同步维护 `pnpm-lock.yaml`
- Renovate 不得直接写入或绕过 PR 修改 `main`
- 所有 Dependency Update PR 必须通过现有 CI Quality Gates
- Core Major Update 默认不得自动 Merge
- Security Update 提高优先级
- 及时移除未使用依赖

## 17. 旧 Nuxt 仓库

旧 Nuxt 仓库是只读参考资料。

Phase 0 已经把默认 Legacy 知识沉淀在以下仓库内 Artifact：

- `docs/migration/legacy-discovery-baseline.md`
- `docs/migration/legacy-route-and-pinyin-fixtures.md`
- `docs/migration/legacy-risk-register.md`
- `docs/planning/phase-0-traceability.md`

Phase 1–17 开始工作时必须先使用这些 Artifact、相关规范和 Fixture，不得把重新全量扫描旧仓库当作每个 Phase 的默认准备步骤。只有当前仓库无法回答某个具体 Legacy 行为时，才允许对旧仓库做只读、定点的文件或 Commit 检查；新发现的后续实施必需事实应沉淀回 V2 仓库。Phase 18 按计划执行最终 Legacy Delta/Inventory 刷新。

用于理解：

- 现有 Route
- Visual Identity
- 重要 Feature
- Edge Case
- Pinyin Routing
- Content Convention

不得机械移植它的架构。

如果不确定某个 Legacy Feature 是否必须保留，应停止并询问 Owner，而不是静默删除。

## 18. 文档

会改变架构的代码必须更新对应文档，并在适用时创建或 Supersede ADR。

不得明知实现与文档不一致而继续保留这种状态。

每个 `implementation-plan.md` Phase 完成时，Agent 必须自动执行阶段交接沉淀，不等待 Owner 另行提醒：复核聊天/运行过程中产生的后续实施必需事实，更新 `docs/planning/current-state.md` 及最合适的规范、Fixture 或 Test，确保新会话不依赖历史聊天。最终报告必须明确说明“本阶段上下文已沉淀，可以授权/开启下一阶段”；这句话只表示依赖就绪，不构成下一 Phase 授权，Agent 仍须停止。

## 19. 完成定义

Task 不是只要 Happy Path 能跑就算完成。

只有在以下条件满足时才视为完成：

- Code 已类型化并经过 Validation
- Test 适当且通过
- Migration 安全
- Observability 足够
- Security Boundary 得到遵守
- Documentation 为当前状态
- 已理解 Rollback/Recovery 影响

## 20. 控制面与网络身份

生产 Remote Control 必须使用：

```text
https://www.tungchiahui.cn/api/ops/*
```

除非未来 ADR 要求，否则不得引入单独的 Operations Domain。

OpenResty 必须把 `/api/ops/*` 直接路由到独立 `control-api`。该服务不属于 Next.js Blue/Green Slot；不得在 `src/app/api/ops/*` 或其他 Next.js Route Handler 中实现正式 Privileged Control Plane。普通 `/api/search`、`/api/health`、`/api/ready`、`/api/version` 仍属于 Next.js。

`control-api` 负责 Authentication、Capability Authorization、Zod Validation、Idempotency/Replay Protection、Job Control/Status 和必要 Recovery Control，但不得成为无边界的 Root Service。

生产 Origin Identity 是：

```text
ddns.tungchiahui.cn
```

不得在应用、CI、CLI 或正常 Infrastructure Configuration 中持久保存家庭公网数字 IP。

内部使用 Docker Service DNS。

Content Sync、Translation、Search/Reindex 和普通 Application Background Job 继续使用 PostgreSQL-backed Durable Job。

Deploy、Rollback、PostgreSQL Restore/Recovery 和必要 Server Migration/Disaster Recovery 不得把健康的 Production PostgreSQL 当作创建、恢复或查询 Operation 的绝对前置条件。它们使用 ADR 0015 定义的 host-local SQLite Recovery State，且必须实现 Transaction、WAL/同步落盘、Crash Recovery、Lock/Lease、Active/Previous Slot、Current/Last SHA、Operation Status 与 Audit Record。该 SQLite 不是业务 Production Database。

正常操作优先使用 `https://www.tungchiahui.cn/api/ops/*`。当 Control API 本身不可用时，Break-glass Path 只可通过授权的 Host/Inventory Identity 调用同一个 Deployment/Recovery Engine，并留下审计记录；不得另建一套脚本实现。

## 21. 付费 AI 翻译

Content Push/Sync 永远不得隐式产生付费 AI 翻译成本。

Translation Hash Miss 时：

- 将 Segment 标记为 Pending
- 发布最新 zh-CN
- 对该 Pending 的 en-US Block 渲染 zh-CN Fallback
- 等待显式 Translation Job

Public Page Request 永远不得触发付费翻译。

Translation Execution 必须具备 Budget Awareness，并且要求 Server-side Budget Enforcement。

## 22. GitHub 方向性

Canonical Content Flow 是单向的：

```text
GitHub -> PostgreSQL
```

没有已批准 ADR 时，不得增加 Production-to-GitHub 的 Content Write、Commit、Push、PR Creation 或同步。

生产环境可以 Fetch/Read Ingestion 所需的精确 GitHub Commit。

## 23. Worker 权限分离

长时间 Content Work 属于 `content-worker`。

高权限 Deployment Work 属于 `deploy-agent`。

不得为了方便给 `content-worker` Docker Socket、Unrestricted Host Shell 或 OpenResty Administrative Privilege。

`control-api` 不得获得不受限 Host Shell 或完整 Docker Socket 权限；高权限执行仍交给最小权限 `deploy-agent`。只有 `deploy-agent` 可以获得完成部署与恢复所需的受控 Docker/Host Capability。

不得直接在 Public Next.js Request Handler 中执行长时间 Translation/Deployment。
