# Website V2 分阶段实施计划

> Status: In progress — Phase 0–13 complete
> Current Phase: Awaiting Owner authorization for Phase 14
> Execution Model: Hard-gated, one Phase at a time
> Scope: 从新的 Next.js V2 Repository 基线推进到替换旧 Nuxt Production Site

本文档只定义实施顺序、依赖、完成条件和 Agent 执行纪律。架构、技术栈与运维契约仍以最新 Accepted ADR、`AGENTS.md` 和对应规范文档为准；这里不复制或重新解释它们。

## Overall Progress

- [x] Phase 0 — Legacy Discovery 与实施基线
- [x] Phase 1 — Next.js 工程与质量基线
- [x] Phase 2 — Hermetic Local Development Platform
- [x] Phase 3 — PostgreSQL、Drizzle 与持久化基础
- [x] Phase 4 — 独立 Control Plane 与 Job Boundary
- [x] Phase 5 — GitHub 单向 Content Ingestion
- [x] Phase 6 — zh-CN Website Vertical Slice
- [x] Phase 7 — UI i18n 与 zh-HK/zh-TW
- [x] Phase 8 — Translation Memory 与 en-US Fallback
- [x] Phase 9 — 显式付费 AI Translation
- [x] Phase 10 — PGroonga Search 与 Cache Correctness
- [x] Phase 11 — S3-compatible Asset Contract（AList Evidence）
- [x] Phase 12 — Production Infrastructure、Ansible 与 Container Hardening
- [x] Phase 13 — Backup、PITR 与 PostgreSQL-independent Recovery
- [ ] Phase 14 — Shared Deployment Engine 与 Full Blue-Green
- [ ] Phase 15 — GitHub Actions OIDC 与 `main` 自动部署
- [ ] Phase 16 — Observability、Security 与 Production Readiness
- [ ] Phase 17 — Planned PostgreSQL / Server Migration Readiness
- [ ] Phase 18 — Final Legacy Audit、Production Cutover 与 Rollback Window

## 使用方法与硬性执行协议

1. Coding Agent 一次只能执行一个 Phase。默认严格按 Phase 编号推进。
2. 当前 Phase 的所有 Task、Tests、Acceptance Criteria 和 Exit Gate 未全部通过前，不得正式进入下一 Phase。
3. 完成当前 Phase 后，Agent 必须更新本文件中的对应 Checklist 与 Overall Progress，创建一个聚焦且可回滚的 Phase Commit，然后停止并向 Owner 报告。
4. 报告至少包含：Commit SHA、实际改动、通过的 Gate、未解决风险、Rollback/Recovery 影响和下一 Phase 的依赖状态。
5. 未经 Owner 明确要求，Agent 不得自动继续下一 Phase，也不得仅因后续能力“顺手”而大规模提前实现。
6. 只允许为验证当前 Phase 创建必要的最小 Stub、Fake 或 Interface；必须显式标注其替换 Phase，不得让临时实现成为隐藏 Production Path。
7. “可并行”只表示依赖图允许多个团队并行。单个 Claude Code/Codex 会话仍默认只聚焦 Current Phase；只有 Owner 明确授权时才可并行执行。
8. Phase Commit 只能包含本阶段 Scope、必要文档同步和计划状态更新。遇到不相关 Dirty Worktree 时必须保留并隔离；无法安全隔离时停止并询问 Owner。
9. 不得提交未通过 Gate 的 Phase，也不得以“后续补测”替代当前阶段的必需验证。
10. 开始每个 Phase 前，重新阅读该 Phase 引用的规范与适用 ADR；如果发现新冲突，停止实施并报告，不得静默选择。
11. 所有 Production、Destructive Test、付费 AI、AList 非生产 Bucket、GitHub OIDC、DNS/EdgeOne 或 Server 操作仍需满足对应权限、安全与显式触发要求。
12. Phase 18 之前不得替换旧 Nuxt Production Site；旧仓库始终只读。
13. 开始新 Phase 时先阅读 `docs/planning/current-state.md`。每个 Phase 完成后必须自动执行上下文沉淀审计，不等待 Owner 提醒；已完成能力、Stub/Fake、Blocker、踩坑或后续 Prerequisite 有变化时，同步更新该交接入口及最合适的规范/Fixture/Test。最终报告必须明确说明“本阶段上下文已沉淀，可以授权/开启下一阶段”，然后停止；该说明不构成下一 Phase 授权。
14. Phase 1–17 默认使用 Phase 0 已提交的 Legacy Inventory、Compatibility Matrix、Fixture 与 Traceability，不重复全量扫描旧仓库。仅当仓库内证据无法回答一个具体 Legacy 行为时，才定点只读检查对应文件；Phase 18 再按 Gate 做最终全量 Delta/Inventory 刷新。

### Phase 完成与 Commit 规则

- Phase Commit 在 Exit Gate 全部通过并更新本计划状态后创建。
- Commit Message 使用各 Phase 的建议值；如仓库 Convention 要求调整，只能做语义等价修改。
- Commit 后立即停止；下一 Phase 必须由 Owner 新指令启动。
- 如果 Owner 尚未授权下一 Phase，将 `Current Phase` 改为 `Awaiting Owner authorization for Phase N`，不得把下一 Phase 标记为进行中或完成。

## 规范来源

- Governance：`AGENTS.md`、`CONTRIBUTING.md`、`SECURITY.md`
- Requirements：`docs/specification/`
- Architecture：`docs/architecture/`
- Development：`docs/development/`
- Operations：`docs/operations/`
- Migration：`docs/migration/nuxt-to-next.md`
- Decisions：`docs/decisions/0001`–`0015`

## 依赖关系概览

```text
Core content: 0 -> 1 -> 2 -> 3 -> 4 -> 5 -> 6 -> 7 -> 8 -> 9
Search:                                             8 -> 10
Storage contract:                         (3 + 6) -> 11
Production infra:                    (4 + 6 + 11) -> 12
Production gates: 12 -> 13 Recovery -> 14 Blue-Green -> 15 CI/CD
                  -> 16 Readiness -> 17 Migration Readiness -> 18 Final Cutover
```

Phase 10 在 Phase 8 后可与 Phase 9 技术并行；Phase 11 在 Phase 6 后可与 Phase 7–10 技术并行。默认执行协议仍保持编号顺序，从而让每个 Commit 与 Gate 容易审计。

## 已知开放项与冲突处理

当前规范和 Accepted ADR 之间没有发现必须先 Supersede 才能实施的直接冲突。以下是规范有意保留的实现选择，不得由 Agent 静默决定：

- Operator Authentication：优先采用规范中的非对称 Request Signing；若采用成熟等效机制且改变架构契约，先提交 ADR 给 Owner。
- pgBackRest Repository Path：必须通过 AList Compatibility Test 决定 Direct S3 或 Local Repository + Verified Sync，不按整洁偏好选择。
- RPO/RTO：只能在获得真实 Backup/WAL Measurement 后确定。
- Cross-major PostgreSQL Migration：在执行 Phase 17 时按当期官方支持选择 Logical Replication 或明确的成熟方法；若改变 ADR 0009 的边界，新增 ADR。

任何后续发现的冲突按“最新 Accepted ADR > Architecture > Specification > Operations/Development Guide”处理，但 Agent 必须先报告并等待 Owner，不得直接改写历史 ADR。

---

## Phase 0 — Legacy Discovery 与实施基线

### 目标

建立可审计的 Legacy Feature/Route/Content Inventory、兼容性 Fixture 和需求追踪基线，使后续开发不会静默删除现有用户可见行为。

### 为什么此时实施

Legacy URL、Pinyin、Frontmatter 和功能保留会影响 Schema、Routing、Content Ingestion 与 E2E Fixture。若先写代码再盘点，会把未知兼容性风险扩散到所有后续 Phase。

### Depends On

- 无；这是第一个实施 Phase。

### Blocks

- Phase 1–18，尤其是 Phase 3、5、6 和 18。

### 是否可与其他 Phase 并行

- 否。Inventory 和 Owner 对歧义项的决定是后续设计输入。

### Scope

- 只读盘点旧 Nuxt Repository 的 Route、Page、Feature、Content Convention、Visual Identity、Asset、Integration 与 Deployment Assumption。
- 建立 Architecture/Requirement/ADR 到后续 Phase 的 Traceability。
- 引用：ADR 0001、0006；`docs/migration/nuxt-to-next.md`；Project Requirements。

### Task Checklist

- [x] 确认 V2 与旧 Nuxt Repository 的物理边界，并记录旧仓库只读规则。
- [x] 盘点全部 Public Route、Locale Prefix、Blog/Wiki Route 和 Analytics-sensitive Route。
- [x] 提取 Chinese-to-pinyin Behavior、冲突处理和代表性输入/输出 Fixture。
- [x] 盘点 Page、Component、Visual Identity、Interaction、Search、Edge Function 与 External Integration。
- [x] 盘点现有 Content Directory、Minimal Frontmatter、Metadata、Delete/Move Convention 和 Asset Reference。
- [x] 将 Feature 分类为 MUST KEEP、SHOULD KEEP、MAY REDESIGN、MAY REMOVE。
- [x] 将无法可靠分类的用户可见行为提交 Owner 决定，不自行删除或重做。
- [x] 建立 Legacy Compatibility Matrix、Risk Register 和 Acceptance-to-Phase Traceability Matrix。
- [x] 记录只允许在确实无法保留原 Route 时使用 Alias/Redirect 的例外审批流程。

### 本 Phase 明确不做什么

- 不移植 Nuxt/Vue Code，不创建 Next.js Feature，不修改旧仓库。
- 不决定新的 Public URL、Content Structure 或 Frontmatter Scheme。
- 不执行 Production Crawl、DNS Change 或 Cutover。

### Tests / Verification

- [x] Inventory 覆盖旧站可发现的 Route、Page、Locale、Content Type 和 Asset 类别。
- [x] Pinyin Fixture 包含普通中文、混合 Identifier、重复/冲突、标点和 Legacy Edge Case。
- [x] 随机抽样旧内容文件，确认 Directory/Frontmatter 记录准确。
- [x] Traceability 检查确认全部现有 Acceptance Criteria 已分配到至少一个 Phase。

### Acceptance Criteria

- [x] 每个已知 Legacy Feature 都有分类、证据和目标 Phase。
- [x] 每个必须保留的 Public Route 都有测试 Fixture 或明确验证方法。
- [x] 所有歧义项均已由 Owner 决定或明确标记为 Blocker。
- [x] 没有把旧实现架构误当成 V2 实现要求。

### Exit Gate

- [x] Owner 接受 Legacy Compatibility Matrix 和 Feature 分类。
- [x] Phase 1 所需的版本、Route、Content 与测试输入没有未决 Blocker。
- [x] 创建聚焦 Commit，建议：`docs(v2): complete phase 0 legacy discovery baseline`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 1。

### 本阶段完成后形成的 Artifact / Capability

- Legacy Feature Inventory、Route/Pinyin Fixture、Compatibility Matrix、Risk Register、Traceability Matrix。

### Agent Rules for This Phase

- 旧 Nuxt Repository 只读；任何修改都视为 Gate Failure。
- 只记录证据，不因实现偏好改变 Feature 分类。
- 仅可创建 Discovery/Fixture/Planning Artifact，不创建应用 Stub。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 1 — Next.js 工程与质量基线

### 目标

建立可构建、可测试、严格类型化的 Next.js 16.x 工程骨架、统一 CLI Gate、CI Baseline 和 Renovate Policy。

### 为什么此时实施

所有后续代码都依赖统一的 Runtime、TypeScript、Package、Formatting、Testing 和 Server/Client Boundary；越晚建立，返工和不一致越多。

### Depends On

- Phase 0。

### Blocks

- Phase 2–18。

### 是否可与其他 Phase 并行

- 否；这是全仓库工程基线。

### Scope

- Next.js App Router、Node.js 24 LTS、pnpm、Strict TypeScript、Tailwind CSS 4、shadcn/ui + Base UI、next-intl Skeleton。
- Biome、Vitest、Testing Library、Playwright Skeleton、`./site check`、`./site test`。
- Renovate PR Policy 与基础 GitHub Actions Quality Gates。
- 引用：ADR 0001、0005；Technology Stack；Code Quality；Testing Strategy。

### Task Checklist

- [x] 初始化新的 Next.js 16.x App Router Project，不从 Nuxt 原地迁移。
- [x] 固定 Node.js 24 LTS、pnpm 与所有初始 Dependency Version，提交 `pnpm-lock.yaml`。
- [x] 配置 `strict`、`noUncheckedIndexedAccess`、`exactOptionalPropertyTypes`、`noImplicitOverride`。
- [x] 建立 Server-first Module Boundary，禁止 `.js`/`.jsx` Application Source。
- [x] 配置 Tailwind CSS 4、shadcn/ui Base UI Primitive 和最小 next-intl Skeleton。
- [x] 配置 Biome、Vitest、Testing Library、Playwright 与 Production Build Command。
- [x] 建立 Typed Zod Configuration Boundary 与 `.env.example`，不包含 Secret。
- [x] 实现薄 `./site` Bootstrap Wrapper 和 TypeScript CLI 的 `check`、`test` 基础命令。
- [x] 配置 PR CI Gate：format/lint、typecheck、unit、integration placeholder、migration placeholder、build、affected E2E placeholder。
- [x] 配置 Renovate 仅创建 PR、同步 Lockfile、Security Update 优先、Core Major 不默认 Auto-merge、Stable/LTS Only。

### 本 Phase 明确不做什么

- 不建立业务 Schema、Content Pipeline、Production Docker 或公开页面 Feature。
- 不用 Placeholder 绕过真实 Typecheck/Build；未实现的 Integration Gate 必须明确标记替换 Phase。
- 不配置 Production Secret、OIDC 或自动部署。

### Tests / Verification

- [x] Biome、Typecheck、Unit Skeleton 和 Production Build 在 Clean Checkout 通过。
- [x] Repository 中不存在 `.js`/`.jsx` Application File、`@ts-ignore` 或未记录 `any`。
- [x] Server-only Module 无法从 Client Boundary 导入。
- [x] Renovate Configuration Validation 通过，且没有 Direct-to-`main` Rule。
- [x] `./site check` 与 `./site test` 具有可靠 Exit Code。

### Acceptance Criteria

- [x] Clean Checkout 使用锁定 Toolchain 可重复安装、检查和构建。
- [x] CI Gate 失败会阻止 Merge/后续 Production Workflow。
- [x] 技术栈与 Accepted ADR 完全一致，没有平行 Framework/Tool。

### Exit Gate

- [x] 所有 Phase 1 Test/Verification 与 Acceptance Criteria 通过。
- [x] 临时 Integration/E2E Placeholder 有 Owner、替换 Phase 和不可误判为真实通过的状态。
- [x] 创建聚焦 Commit，建议：`chore(v2): complete phase 1 engineering baseline`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 2。

### 本阶段完成后形成的 Artifact / Capability

- 可构建的 Next.js V2 Skeleton、Strict TypeScript Policy、统一质量命令、PR CI Baseline、Renovate Automation。

### Agent Rules for This Phase

- 不以方便为由引入 JavaScript、第二套 Formatter、CSS、i18n 或 Component Framework。
- 只创建支持工程 Gate 的最小 UI/Route Stub。
- Dependency Upgrade 必须与功能实现分离并通过 PR/CI Policy。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 2 — Hermetic Local Development Platform

### 目标

让 `./site dev` 和 `./site test` 在无 Production Credential 条件下启动/验证隔离的 PostgreSQL、PgBouncer、S3Mock、Local `control-api` 与 Control-state SQLite。

### 为什么此时实施

后续 Schema、Content、Control Plane 和 Storage Work 都需要可复现的本地 Trust Boundary；必须先消除手工拼装环境和误连 Production 的风险。

### Depends On

- Phase 1。

### Blocks

- Phase 3–18。

### 是否可与其他 Phase 并行

- 否；后续 Integration Test 全部依赖此环境。

### Scope

- Docker Compose Development/Test Topology、PostgreSQL 18 + PGroonga、PgBouncer、Adobe S3Mock、Local SQLite State、Fake Deploy Agent。
- `./site dev`、`dev stop`、显式 `dev reset` 和 Disposable Test Project。
- 引用：ADR 0007、0014、0015；Local Development；Testing Strategy。

### Task Checklist

- [x] 定义 Development/Test Compose Project，使用 Docker Service DNS 而非 Container IP。
- [x] 固定 PostgreSQL 18、PGroonga、PgBouncer、Adobe S3Mock Image Version/Digest。
- [x] 实现 `./site dev` 的 Prerequisite、Health Wait、Bucket Init、Migration Hook、Seed Hook 和 Status Output。
- [x] 建立独立 Local `control-api` Skeleton 与专用 Control-state SQLite Directory。
- [x] 提供无 Docker/OpenResty Production Permission 的 Fake Deploy Agent。
- [x] 实现 `./site dev stop` 和需要明确 Environment/Confirmation 的 `./site dev reset`。
- [x] 让 `./site test` 使用唯一 Compose Project、Disposable Volume/Database/Bucket 并保证 Failure Cleanup。
- [x] 配置 Local Fake/No-cost Translation Provider Boundary。
- [x] 增加防误连保护，拒绝在 Local/Test Mode 使用 Production Host、Bucket 或 Credential。

### 本 Phase 明确不做什么

- 不实现 Production Authentication、Deployment、Restore 或真实 AI Call。
- 不持久化业务 State 到 SQLite；SQLite 仅是隔离的 Control-plane Recovery State。
- 不对 AList 或任何 Production Resource 执行 Destructive Test。

### Tests / Verification

- [x] `./site dev` 从 Clean State 一键启动并报告全部 Local Endpoint/Health。
- [x] Stop/Restart Deterministic；普通 Start 不会隐式 Reset Data。
- [x] `./site test` 连续运行两次无 Port、Volume、Database 或 Bucket Collision。
- [x] Failure Injection 后 Test Cleanup 仍执行。
- [x] Local/Test Config 无法解析为 Production Endpoint/Credential。

### Acceptance Criteria

- [x] Local PostgreSQL、S3Mock、Control-state SQLite 与 Production 完全隔离。
- [x] Developer 不需要 Production DB、S3 或 AI Credential。
- [x] 所有后续 Integration Test 有统一 Disposable Infrastructure Entry Point。

### Exit Gate

- [x] 从 Clean Checkout 演示 `./site dev`、`./site test`、Stop/Restart 和 Safe Reset。
- [x] 隔离与 Destructive Guard Test 全部通过。
- [x] 创建聚焦 Commit，建议：`feat(dev): complete phase 2 hermetic local platform`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 3。

### 本阶段完成后形成的 Artifact / Capability

- One-command Local Stack、Disposable Test Stack、S3Mock、Local Control State 和生产资源防误连边界。

### Agent Rules for This Phase

- 不要求或读取 Production Credential。
- Destructive Command 必须先解析并显示精确 Local/Test Target。
- 仅提供 Fake Deployment/Translation Capability，不提前实现 Production Path。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 3 — PostgreSQL、Drizzle 与持久化基础

### 目标

建立 PostgreSQL Runtime Data Model、Drizzle Type Integration、版本化 Expand/Contract Migration、PGroonga Extension 基础和最小权限 Role Boundary。

### 为什么此时实施

Content、Translation、Search 和 Application Job 都依赖稳定 Schema；先定义数据权威与 Migration Gate，才能避免后续 Feature 各自复制 Type 或写不可回滚 Schema。

### Depends On

- Phase 2。

### Blocks

- Phase 4–10、13–18。

### 是否可与其他 Phase 并行

- 否；Schema 与 Shared Domain Type 是后续共同基础。

### Scope

- `documents`、Translation、Segment、Ingestion、Application Job 和必要 Alias 的逻辑 Schema。
- Drizzle、Versioned SQL Migration、PGroonga Enablement、PgBouncer Compatibility、Role Separation。
- 引用：ADR 0002、0006、0008、0015；Data Model；Database Migrations。

### Task Checklist

- [x] 定义唯一 Shared Domain Type 与 Runtime Validation Boundary，禁止跨层重复定义。
- [x] 创建 `documents`、`document_translations`、`translation_segments`、`translation_jobs`、`operational_jobs`、`ingestion_runs` Schema。
- [x] 仅为无法保留原 Route 的最后手段设计 `content_aliases`。
- [x] 配置 Drizzle Schema/Query Type Integration 与 Versioned SQL Migration。
- [x] 建立 PostgreSQL 18 PGroonga Extension Bootstrap；具体 Search Index 留给 Phase 10。
- [x] 定义 Application、Migration、Content Worker、Backup/Replication 的最小权限 Role Boundary。
- [x] 建立 Expand/Contract Migration Metadata 与 Risk/Backup Policy Hook。
- [x] 创建 Deterministic Development Seed 和 Previous-schema Fixture。
- [x] 明确 PostgreSQL Application Job 与 SQLite Infrastructure Operation 的 Schema Boundary。

### 本 Phase 明确不做什么

- 不实现 Content Fetch/Parse、Paid Translation、Search Ranking 或 Deployment Operation。
- 不进行 Destructive Contract Migration。
- 不把 Canonical Markdown 放入 S3 或把业务 Runtime Data 放入 SQLite。

### Tests / Verification

- [x] Empty Database -> Latest Migration 通过。
- [x] Previous Production-like Schema -> Latest Migration 通过。
- [x] Migration 重复执行具有预期的安全行为。
- [x] Role Test 证明 Application Role 不能管理 Extension、Replication 或 Backup。
- [x] PgBouncer Mode 与 Drizzle Query Pattern 兼容。
- [x] Schema/Validation Test 覆盖非法 Locale、Job Type 和 External Payload。

### Acceptance Criteria

- [x] Schema 能表达全部已批准 Runtime Content、Translation、Ingestion 与 Application Job State。
- [x] 每个 Schema Change 可 Review、可复现并符合 Expand/Contract。
- [x] SQLite 例外严格限制在 ADR 0015 的 Recovery State。

### Exit Gate

- [x] Clean/Previous Migration Gate、Role Boundary 和 Typecheck 全部通过。
- [x] Data Model 与 Migration 文档和实现一致。
- [x] 创建聚焦 Commit，建议：`feat(db): complete phase 3 persistence foundation`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 4。

### 本阶段完成后形成的 Artifact / Capability

- Versioned PostgreSQL Schema、Drizzle Repository Foundation、Migration Gate、PGroonga Bootstrap 和最小权限 DB Roles。

### Agent Rules for This Phase

- Schema 变化必须提交 Migration，禁止 Production Push/Convenience Schema Mutation。
- 不得在同一 Release 中进行 Destructive Replacement。
- Shared Domain Type 只定义一次，External Data 必须经 Zod Validation。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 4 — 独立 Control Plane 与 Job Boundary

### 目标

实现不属于 Next.js Slot 的 `control-api`、Authentication/Authorization Boundary、PostgreSQL Application Job 与 SQLite Infrastructure Operation 的分流，以及最小权限 Worker/Agent Contract。

### 为什么此时实施

Content Sync、Translation、Deployment 和 Recovery 都要从同一个稳定 Control Namespace 进入，但必须在具体 Worker/Deployment 功能前固定自依赖与权限边界。

### Depends On

- Phase 3。

### Blocks

- Phase 5、9、12–18。

### 是否可与其他 Phase 并行

- 否；它定义所有长时间 Operation 的入口和 Durable State Boundary。

### Scope

- 独立 TypeScript `control-api` Service；OpenResty Local/Integration Routing；Zod、Capability Authorization、Replay/Idempotency。
- GitHub OIDC Claim Validator 与 Operator Request-signing Baseline。
- PostgreSQL Job Creation/Status 与 SQLite Recovery State Machine/Lock/Audit。
- 引用：ADR 0011、0013、0014、0015；Control Plane and Jobs；Security。

### Task Checklist

- [x] 建立独立 `control-api` Package/Service，确保正式 `/api/ops/*` 不存在于 Next.js Route Handler。
- [x] 定义 Authentication、Capability Authorization、Actor Identity 和 Audit Event Model。
- [x] 实现 Method/Path/Body Hash/Timestamp/Nonce 的 Operator Request-signing Baseline，或先提交等效机制 ADR。
- [x] 实现 GitHub OIDC issuer、audience、repository、ref/environment、workflow Claim Validation。
- [x] 对全部 Control Payload、Header 和 External Claim 使用 Zod Runtime Validation。
- [x] 实现 Replay Window、Nonce Store 和 Idempotency Key Behavior。
- [x] 实现 PostgreSQL-backed Application Job 创建/查询，不在 HTTP Request Inline 执行长任务。
- [x] 实现 SQLite Transaction、WAL/Checkpoint、Versioned Schema、Lock/Lease/Fencing、Audit 和 Restart Reconciliation。
- [x] 实现 PostgreSQL 不可用时仍可启动的 Status/Infrastructure Operation Path。
- [x] 建立 `content-worker`、`deploy-agent`、`control-api` 的独立 Identity/Capability Contract。
- [x] 配置 `/api/ops/*` Cache Bypass、`no-store`、Method Restriction 和 Rate-limit Test Boundary。

### 本 Phase 明确不做什么

- 不执行真实 Content Sync、AI Translation、Docker Deployment、OpenResty Cutover 或 PostgreSQL Restore。
- 不给 `control-api`、`content-worker` Docker Socket 或 Unrestricted Host Shell。
- 不创建单独 Operations Domain，不硬编码家庭公网数字 IP。

### Tests / Verification

- [x] Authentication Failure、Capability Denial、Malformed Payload、Replay 和 Duplicate Idempotency Test 通过。
- [x] OpenResty Test 证明 `/api/ops/*` 到 `control-api`，普通 API 到 Next.js。
- [x] 两个 Next.js Slot 不可用时，Control Status Path 仍工作。
- [x] PostgreSQL 不可用时，SQLite-backed Operation 可创建、查询和恢复；Application Job 安全报告不可用。
- [x] Crash/Restart、Expired Lease、Concurrent Claim、Audit Append 和 Schema Migration Test 通过。
- [x] Permission Test 证明 `control-api` 与 `content-worker` 无 Docker/OpenResty Administrative Access。

### Acceptance Criteria

- [x] `https://www.tungchiahui.cn/api/ops/*` 的实现边界独立于 Next.js Slot。
- [x] 两类 Durable State 不混用且具备清晰的 Failure Behavior。
- [x] 所有 Trust Boundary 均有 Runtime Validation、Authz、Replay Protection 和安全 Audit。

### Exit Gate

- [x] Control-plane Integration/Security/Crash Test 全部通过。
- [x] PostgreSQL-down 和 Next.js-down Scenario 均有可验证结果。
- [x] 创建聚焦 Commit，建议：`feat(ops): complete phase 4 independent control plane`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 5。

### 本阶段完成后形成的 Artifact / Capability

- 独立 Control API、OIDC/Operator Auth Baseline、Job Router、SQLite Recovery State Engine 和权限边界。

### Agent Rules for This Phase

- 不得将 `/api/ops/*` 放入 `src/app/api/ops/*`。
- 不得让 SQLite 承载 Content/Translation/Search Job。
- 高权限行为只定义 Interface/Fake，不提前授予 Host/Docker Capability。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 5 — GitHub 单向 Content Ingestion

### 目标

实现由 `control-api` 触发、`content-worker` 执行的 Deterministic/Idempotent GitHub zh-CN Content Sync，并正确处理新增、修改、删除、移动与 Legacy-compatible Route。

### 为什么此时实施

Schema、Local Infrastructure 和 Control Plane 已稳定，现在可以形成第一条真正的 Authoring-to-Runtime Data Path，而不与 UI、Search 或付费翻译耦合。

### Depends On

- Phase 4。

### Blocks

- Phase 6–10、18。

### 是否可与其他 Phase 并行

- 否；Public Site 与 Translation 都依赖可信 Runtime Content。

### Scope

- Read-only GitHub Fetch、Source Commit Pinning、Frontmatter/Markdown Parse、Identity/Route、Transactional Upsert、Delete/Move、Application Job Claim/Retry、Revalidation Interface。
- 引用：ADR 0002、0006、0012、0013；Content Pipeline；Data Model；Legacy Inventory。

### Task Checklist

- [x] 实现只读 Fetch 指定 Git Commit/File 的 GitHub Adapter，不包含 Write API。
- [x] 使用 unified/remark/rehype 解析 Markdown，并对 Frontmatter/AST 做 Runtime Validation。
- [x] 保持当前 Content Directory 与 Minimal Frontmatter，不强迫作者增加内部 ID。
- [x] 实现 Source Hash、Stable Internal Identity 和 Legacy-compatible Pinyin Route Algorithm。
- [x] 实现新增、修改、删除、移动/重命名 Detection 与 Transactional Apply。
- [x] 实现同一 Commit/Configuration 重放为 No-op 的 Idempotency。
- [x] 实现 PostgreSQL Job Claim、Retry、Failure/Progress 和 `ingestion_runs` Audit。
- [x] 实现翻译 Diff、Search Refresh、Cache Invalidation 的 Typed Interface；未到对应 Phase 只使用最小 Fake。
- [x] 实现 Content Sync 后只发布/revalidate zh-CN，不触发 Application Build/Deployment。
- [x] 从结构上证明 Production Content Code 无 Commit/Push/Open PR/Edit/Delete GitHub Path。

### 本 Phase 明确不做什么

- 不实现 Public Page、Paid Translation、PGroonga Ranking 或 Production Deployment。
- 不把 Markdown 存入 S3，不建立大规模 Redirect Map。
- 不允许 Content Worker 获得 Docker/OpenResty/Host Administrative Permission。

### Tests / Verification

- [x] Representative Legacy Content 与 Frontmatter Fixture 全部导入。
- [x] 同 Commit 重复 Sync 不产生重复 Row、Translation 或 Side Effect。
- [x] Add/Modify/Delete/Move/Rename Integration Test 通过并保留可判断的 Identity Continuity。
- [x] Pinyin/Route Fixture 与 Phase 0 Legacy Behavior 一致。
- [x] Partial Failure 保留此前有效 Runtime Version，Transaction 不留下半成品。
- [x] Directionality Test 证明无 GitHub Write Credential/Capability。
- [x] Sync Test 证明没有 AI Provider Call 和 Next.js Image Build。

### Acceptance Criteria

- [x] GitHub zh-CN Markdown 是唯一 Canonical Authoring Source。
- [x] Runtime PostgreSQL 可由精确 Git Commit Deterministically Materialize。
- [x] Content Push 快速完成且不等待翻译或 Application Deployment。

### Exit Gate

- [x] Ingestion、Idempotency、Move/Delete、Pinyin 和 Directionality Gate 全部通过。
- [x] Legacy Compatibility Matrix 中 Content/Route 项已更新实际结果。
- [x] 创建聚焦 Commit，建议：`feat(content): complete phase 5 one-way ingestion`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 6。

### 本阶段完成后形成的 Artifact / Capability

- GitHub -> PostgreSQL 单向 Content Pipeline、content-worker、Durable Ingestion Job 和 Route Compatibility Engine。

### Agent Rules for This Phase

- GitHub Access 必须 Read-only；不得实现 Production-to-GitHub Path。
- 任何 Legacy 行为歧义必须回到 Owner，不得用 Alias 静默掩盖。
- Translation/Search/Revalidation 只允许最小 Interface/Fake，并标注替换 Phase。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 6 — zh-CN Website Vertical Slice

### 目标

交付从 PostgreSQL Runtime Content 到可用 zh-CN Blog/Wiki 页面、列表、Markdown Rendering、Legacy Route、Asset Loading 和 Health Endpoint 的完整 Public Vertical Slice。

### 为什么此时实施

Content Pipeline 已可信，此时先验证最核心的作者到读者路径，可在多语言、翻译和搜索之前暴露 Routing/Rendering/Data-access 问题。

### Depends On

- Phase 5。

### Blocks

- Phase 7–12、18。

### 是否可与其他 Phase 并行

- 否；后续 Locale、Search 和 Production Smoke 都建立在此 Public Surface 上。

### Scope

- Next.js App Router、React Server Components、zh-CN UI、Blog/Wiki/Homepage、Markdown AST Rendering、Shiki、Cache/Revalidation、CDN Asset Read Boundary。
- `/api/health`、`/api/ready`、`/api/version`。
- 引用：Architecture Overview、Caching、Migration Guide、Acceptance Criteria。

### Task Checklist

- [x] 建立 Locale-prefixed zh-CN Application Layout 和 Server-first Data Access Layer。
- [x] 实现 Homepage、Blog List/Article、Wiki List/Article 与必要 Error/Not-found Page。
- [x] 使用 unified/remark/rehype + Shiki 安全渲染 Runtime Markdown，保护 Code/URL/Identifier。
- [x] 实现 Phase 0/5 确认的 Legacy URL/Pinyin Routing，不默认建立 Redirect Map。
- [x] 使用 Tailwind CSS 4 和 shadcn/ui Base UI Primitive 重建必要 Visual Identity/Interaction。
- [x] 所有可复用用户可见文本使用 next-intl Message Key，即使当前只交付 zh-CN。
- [x] 实现 Asset URL/Metadata Boundary，Local 使用 S3Mock/CDN Fixture。
- [x] 定义 Cache Owner、Key、TTL（如有）与精确 Revalidation Behavior。
- [x] 实现 `/api/health`、`/api/ready`、`/api/version`，并保持它们属于 Next.js。

### 本 Phase 明确不做什么

- 不完成 zh-HK/zh-TW/en-US Content、不实现 Paid Translation 或 Search。
- 不把 Privileged `/api/ops/*` 加入 Next.js。
- 不进行像素级 Nuxt 复制或扩大 Client Component 范围。

### Tests / Verification

- [x] Homepage、Blog/Wiki、Representative Article、Error Page E2E 通过。
- [x] Legacy URL/Pinyin Fixture 在真实 App Router 中通过。
- [x] Markdown Code Fence、Inline Code、Link、Heading、Image 和 Unicode Fixture 正确渲染。
- [x] Server/Client Boundary Test 证明 Server Secret 不进入 Client Bundle。
- [x] Health/Ready/Version 返回正确语义与 Deployment Metadata Stub。
- [x] Content Sync 后受影响 Route 更新，不要求 Application Rebuild。

### Acceptance Criteria

- [x] zh-CN 核心公开网站可以从 PostgreSQL Runtime Content 完整工作。
- [x] 代表性 Legacy Route 与重要用户可见行为保留。
- [x] 缓存失效、Asset Loading 和 Error Behavior 可测试且可观察。

### Exit Gate

- [x] zh-CN Critical E2E、Legacy Route 与 Rendering Gate 全部通过。
- [x] Phase 0 MUST KEEP 的核心 zh-CN Vertical Slice 无未决 Blocker。
- [x] 创建聚焦 Commit，建议：`feat(web): complete phase 6 zh-cn vertical slice`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 7。

### 本阶段完成后形成的 Artifact / Capability

- 可用 zh-CN Website、Runtime Markdown Renderer、Legacy Routing、Cache/Revalidation 和 Public Health Surface。

### Agent Rules for This Phase

- 默认使用 Server Component；只有真实交互需要时才增加 Client Component。
- 用户可见文本不得硬编码，Privileged Ops Route 不得进入 Next.js。
- 只使用 Local/S3Mock Asset Boundary，不提前依赖 Production Credential。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 7 — UI i18n 与 zh-HK/zh-TW

### 目标

完成四 Locale Routing/UI Message 基线，并通过 OpenCC + 明确 Glossary/Exception 生成确定性的 zh-HK/zh-TW Content View。

### 为什么此时实施

Public Route 和 zh-CN Renderer 已稳定，可以在不混入 AI Translation 的情况下先建立确定性的 Locale Contract 与 UI i18n。

### Depends On

- Phase 6。

### Blocks

- Phase 8–10、18。

### 是否可与其他 Phase 并行

- 默认否；技术上 Phase 11 可在独立 Agent 上并行。

### Scope

- next-intl UI Message、`zh-cn`/`zh-hk`/`zh-tw`/`en-us` Prefix、Locale Switch、OpenCC Conversion、Glossary/Exception。
- en-US Content 暂时只使用明确 zh-CN Fallback，完整 Block-level Behavior 留给 Phase 8。
- 引用：Internationalization Architecture；Project Requirements；AGENTS Translation Policy。

### Task Checklist

- [x] 建立四 Locale Message Catalog，以 zh-CN 为 Source UI Locale。
- [x] 为 en-US UI 做 Semantic Translation，为 zh-HK/zh-TW UI 做适用的 Deterministic Conversion/Review。
- [x] 实现 Locale-prefixed Routing、Negotiation Policy 和同一 Logical Document 的 Locale Switch。
- [x] 实现 OpenCC-based zh-HK/zh-TW Content Conversion Pipeline。
- [x] 建立技术术语、姓名、品牌和已知转换例外的 Versioned Glossary/Exception。
- [x] 防止 Code Fence、Inline Code、URL、Identifier 和受保护 Frontmatter 被盲目转换。
- [x] 对 en-US Route 提供明确的全量 zh-CN Fallback Baseline，不触发 AI。
- [x] 为 Fallback/Converted State 提供 UI Metadata/Observability Hook。

### 本 Phase 明确不做什么

- 不实现 Translation Memory、Paid AI 或 Segment-level Mixed English。
- 不维护三份人工 Canonical Article Source。
- 不改变 Phase 0/6 已确定的 Public Route Pattern。

### Tests / Verification

- [x] 四 Locale UI Message Key 完整性和无硬编码文本检查通过。
- [x] Locale Switch 保持同一 Logical Document Route。
- [x] OpenCC Representative Glossary/Exception Test 通过。
- [x] Code/URL/Identifier Protection Test 通过。
- [x] 缺失 en-US Content 不返回 404、不调用 AI，并显示当前 zh-CN。

### Acceptance Criteria

- [x] 全部四 Locale 有稳定 Public Route 与 UI。
- [x] zh-HK/zh-TW Conversion Deterministic、可重放且受 Glossary Test 保护。
- [x] UI i18n 与 Content i18n 的职责没有混合。

### Exit Gate

- [x] Locale E2E、Message Completeness、OpenCC 和 Protected Syntax Gate 全部通过。
- [x] 四 Locale Route Sample 已加入 Regression Suite。
- [x] 创建聚焦 Commit，建议：`feat(i18n): complete phase 7 deterministic locales`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 8。

### 本阶段完成后形成的 Artifact / Capability

- 四 Locale UI/Route、OpenCC zh-HK/zh-TW Materialization、Glossary 与安全 en-US Fallback Baseline。

### Agent Rules for This Phase

- UI 与 Content Translation 必须保持独立 Module/State。
- 任何不确定转换必须进入 Glossary/Exception，不得靠随机修正文案。
- Paid Provider Boundary 仍只允许 Fake Interface。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 8 — Translation Memory 与 en-US Fallback

### 目标

实现 Markdown Semantic-block Segmentation、Hash Reuse、Translation Memory、Pending/State Model 和 Block-level zh-CN Fallback，不产生任何付费请求。

### 为什么此时实施

Locale Contract 已稳定，先把 Incremental Translation Correctness 与 Fallback 做成纯数据能力，再接入付费 Provider，可将成本安全与翻译质量问题解耦。

### Depends On

- Phase 7。

### Blocks

- Phase 9、10、15、18。

### 是否可与其他 Phase 并行

- 否；Phase 9 与英文 Search 都依赖此状态模型。

### Scope

- Semantic AST Block、Source/Context Hash、Translation Segment State、Reuse/Stale/Pending、Materialized en-US Markdown 与 zh-CN Block Fallback。
- 引用：ADR 0010；Content Pipeline；Internationalization；Data Model。

### Task Checklist

- [x] 定义稳定 Semantic Block Boundary、Normalization 和 Context Fingerprint。
- [x] 对 Code Fence、Inline Code、URL、Identifier、Markdown Syntax 和受保护 Frontmatter 做不可翻译标记。
- [x] 实现 Hash Hit Reuse、Hash Miss Pending、Changed/Stale 和 Reviewed-like State Transition。
- [x] 确保 Segment Position 不是 Identity，局部改变不使整篇 Translation 失效。
- [x] 实现已有英文 Block + Pending zh-CN Block 的混合 Materialized en-US Document。
- [x] Content Sync 时只 Diff/Reuse/Mark Pending，绝不调用 Provider。
- [x] 实现 Old zh-CN + Old en-US + New zh-CN 的 Targeted Patch Context Interface，不执行真实翻译。
- [x] 暴露 Pending Count、Fallback State 和 Translation Memory Hit Metric。

### 本 Phase 明确不做什么

- 不调用真实或付费 AI Provider，不实现 Budget Execution。
- 不把生成英文写入 GitHub。
- 不因单个 Pending Block 阻塞 zh-CN Publish 或返回 404。

### Tests / Verification

- [x] Unchanged Block 全局安全复用，局部 Change 只影响对应 Segment。
- [x] Code/URL/Identifier/AST Shape Preservation Test 通过。
- [x] Hash Miss 变 Pending，en-US 只对该 Block 显示最新 zh-CN。
- [x] 旧英文不得伪装成新 zh-CN 的有效 Translation。
- [x] Content Sync/Public Request 的 Provider Call Count 恒为零。
- [x] Re-run Deterministic 且不会重复 Segment/Translation。

### Acceptance Criteria

- [x] Translation Memory 达到 Block-level Incremental Reuse。
- [x] Pending Fallback Correct、可观察且不阻塞发布。
- [x] GitHub 仍只保存 Canonical zh-CN。

### Exit Gate

- [x] Segmentation、Hash Reuse、AST Preservation、Fallback 与 Zero-cost Gate 全部通过。
- [x] Translation State Migration/Backfill 对当前数据安全。
- [x] 创建聚焦 Commit，建议：`feat(i18n): complete phase 8 translation memory`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 9。

### 本阶段完成后形成的 Artifact / Capability

- Block-level Translation Memory、Pending/Stale State、Materialized en-US Fallback 和成本安全数据基础。

### Agent Rules for This Phase

- 任何 Test/Public/Sync Path 都不得触发 Paid Provider。
- 不因实现方便退化为 Whole-document Retranslation。
- 所有 External/AST Input 必须 Validation，并保持 Markdown Structure。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 9 — 显式付费 AI Translation

### 目标

交付可 Dry-run、可显式 Execute、由 Server-side Budget 强制约束的 Translation Operation，以及 CLI、Control API 和 Manual GitHub Workflow。

### 为什么此时实施

Translation Memory 和 Fallback 已证明不会意外消费成本，现在才能安全接入 Provider、Usage/Cost Accounting 与 Partial Completion。

### Depends On

- Phase 8 和 Phase 4。

### Blocks

- Phase 15、16、18。

### 是否可与其他 Phase 并行

- Phase 10 在 Phase 8 后技术上可并行；默认仍先完成本 Phase。

### Scope

- Translation Provider Adapter、Fake/No-cost Provider、Dry-run Estimate、Budget Enforcement、Partial State、`./site translate`、`/api/ops/translations`、Manual Workflow。
- 引用：ADR 0010、0013；Translation Operations；Security；Testing Strategy。

### Task Checklist

- [x] 定义经过 Zod Validation 的 Provider Request/Response Boundary 和 Usage Metadata。
- [x] 保留 Fake/No-cost Provider 作为默认 Automated Test Provider。
- [x] 实现 `pending`、`changed`、`article`、`all` Scope 与显式 Force/Retranslation Confirmation。
- [x] 实现 Dry-run Token/Cost Estimate，保证零次 Paid Call。
- [x] 在每次 Paid Request 前由 `content-worker` 强制检查剩余 Budget。
- [x] 实现 Budget Stop、`partial`、Retry、Cancellation、Actual Token/Cost Record。
- [x] 实现 `./site translate ... --dry-run/--execute --budget-usd` 和 Status Output。
- [x] 实现 `control-api` Translation Job Create/Status，实际工作由 `content-worker` 执行。
- [x] 实现 GitHub Manual `workflow_dispatch` 的 Typed Input 与 OIDC Auth，不将 DB/AI/Host Credential 放入 Workflow。
- [x] Translation 完成后只更新 Runtime State 并精确 Revalidate，不回写 GitHub。

### 本 Phase 明确不做什么

- 不在 Content Push、Public Request 或普通 CI 中自动执行付费翻译。
- 不把 AI Credential 给 GitHub Actions、Next.js Client 或 `deploy-agent`。
- 不绕过 Translation Memory 重新翻译整篇文档。

### Tests / Verification

- [x] Dry-run 与 Public/Content Sync Path 的 Paid Call Count 为零。
- [x] Server-side Budget 在下一请求超限前停止，并保留已完成 Segment。
- [x] Retry/Partial/Failure 不破坏已有 Published Translation。
- [x] Manual Workflow 与 Local CLI 创建相同 Job Contract。
- [x] Capability Test 证明只有授权 Translation Actor 可 Execute。
- [x] Token/Cost/Provider/Model Audit 不包含 Secret。

### Acceptance Criteria

- [x] Paid Translation 只能显式触发并受 Server-side Budget Enforcement。
- [x] Hash Hit 继续复用，Hash Miss/预算未覆盖部分保持 Pending/Fallback。
- [x] GitHub Content Push 和 Public Rendering 成本安全。

### Exit Gate

- [x] Fake Provider 全套测试通过；真实 Provider Contract Test 仅在显式非生产授权下通过。
- [x] Dry-run、Budget、Partial、Authz 和 Directionality Gate 全部通过。
- [x] 创建聚焦 Commit，建议：`feat(translation): complete phase 9 budgeted execution`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 10。

### 本阶段完成后形成的 Artifact / Capability

- 显式可预算 AI Translation、CLI/API/Manual Workflow、Usage Audit 和 Partial Recovery。

### Agent Rules for This Phase

- 未获 Owner 显式授权不得运行真实付费 Execute。
- Automated Test 只能使用 Fake/No-cost Provider。
- 任何 Cost Control 不能仅存在于 Client/Workflow，必须由 Server Worker 强制。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 10 — PGroonga Search 与 Cache Correctness

### 目标

实现 PostgreSQL + PGroonga 的多语言 Server-side Search、可测试 Ranking、Durable Reindex 和精确 Cache Invalidation。

### 为什么此时实施

Canonical、Converted 和 English/Fallback Content State 已明确，可以建立最终 Locale-aware Index，而不依赖临时 Client Index。

### Depends On

- Phase 8；英文已翻译数据可来自 Phase 9，但 Search Engine 不应依赖付费执行完成。

### Blocks

- Phase 14 Smoke Test、Phase 18 Cutover。

### 是否可与其他 Phase 并行

- 可与 Phase 9 技术并行；默认编号顺序执行。

### Scope

- PGroonga Index、Locale Filtering/Ranking、Search API/UI、Snippet、Reindex Job、Cache Key/Invalidation/Observability。
- 引用：Search Architecture；Caching Architecture；ADR 0002；Testing Strategy。

### Task Checklist

- [x] 建立 Title、Heading、Body、Translated/Converted Content 和 Metadata 的 PGroonga Index Migration。
- [x] 实现 Locale Scope/Ranking，防止偶然 Cross-locale Result。
- [x] 实现 Server-side Search Repository/API 与 UI Result Contract。
- [x] 返回 title、route、locale、content_type、snippet、matched context。
- [x] 建立 Exact Title、Heading、Body、中文短语、English Term、Mixed Identifier Ranking Fixture。
- [x] 实现 PostgreSQL-backed Search/Reindex Durable Job 和 `content-worker` Handler。
- [x] Content/Translation Update 后只刷新受影响 Index/Cache。
- [x] 为 Edge/OpenResty/Next Cache 定义 Owner、Key、Invalidation、TTL 和 Metric。

### 本 Phase 明确不做什么

- 不把 Corpus 下载到浏览器执行 `includes()`。
- 不建立平行 JSON Index、Elasticsearch 或 Meilisearch。
- 不让 Search/Reindex Job 进入 SQLite Recovery Store。

### Tests / Verification

- [x] 中文和英文 Query 返回正确 Locale/Route 的相关 Document。
- [x] Ranking Fixture 有确定期望，不依赖人工肉眼判断。
- [x] PGroonga Migration/Index Rebuild 在 Disposable Database 通过。
- [x] Search API 不泄露 Raw Secret/Internal-only Data。
- [x] Reindex Retry/Concurrency/Failure 和 Cache Invalidation Test 通过。
- [x] Browser Bundle 不包含完整 Content Corpus。

### Acceptance Criteria

- [x] Search 完全 Server-side 且由 PostgreSQL + PGroonga 支撑。
- [x] Locale、Ranking、Snippet、Route 与 Reindex Behavior 有自动化测试。
- [x] Cache Correctness 不依赖任意 TTL。

### Exit Gate

- [x] Search Relevance、Locale、Migration、Reindex、Cache Gate 全部通过。
- [x] Representative Search 加入 Production Smoke Candidate List。
- [x] 创建聚焦 Commit，建议：`feat(search): complete phase 10 pgroonga search`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 11。

### 本阶段完成后形成的 Artifact / Capability

- 多语言 PGroonga Search、Search UI/API、Reindex Worker、可证明的 Ranking 与 Cache Invalidation。

### Agent Rules for This Phase

- 不引入第二个 Search Engine 或 Client-only Production Index。
- Ranking 调整必须更新 Fixture/Expected Result。
- Search Job 保持 PostgreSQL-backed，不扩大 Control-state SQLite Scope。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 11 — S3-compatible Asset Contract（AList Evidence）

### 目标

完成 Provider-neutral S3-compatible Asset Boundary、Local S3Mock Integration 与可配置非生产 Bucket Contract Test；并以当前 Production 选型 AList 的非生产 Target 证明 CDN/Metadata/Key Semantics 可用于生产资源。

### 为什么此时实施

Public Asset Read 已在 Phase 6 形成，生产 Infrastructure 前必须用真实非生产 AList 证据验证 Emulator 无法保证的兼容行为。

### Depends On

- Phase 3、6；不依赖 Phase 9/10。

### Blocks

- Phase 12、13、18。

### 是否可与其他 Phase 并行

- 技术上可在 Phase 7–10 期间由独立 Agent 执行；默认仍按编号执行。

### Scope

- Image、Attachment、Music、Mirrored Static Asset 的通用 S3 Adapter、CDN URL、Credential Split、Provider-neutral Contract Suite。
- Backup Repository 的精确 pgBackRest Compatibility Decision 留给 Phase 13，但复用本阶段证据。
- 引用：ADR 0003、0007；Testing Strategy；Security；Project Requirements。

### Task Checklist

- [x] 实现单一 S3-compatible Adapter，不引入第二套 Object-storage Abstraction。
- [x] 定义 Object Key、Content-Type、Cache-Control、Metadata、Public-read/Private-write Policy。
- [x] 在 S3Mock 上实现 PUT/GET/HEAD/DELETE/List/Prefix/Overwrite Contract Suite。
- [x] 覆盖 ETag Expectation、Unicode Key、Missing Key、Representative Object Size。
- [x] 使用通用 `S3_CONTRACT_*` 配置和独立 Non-production Test Credential/Bucket 运行同一 Contract Suite；当前 Exit Evidence Target 为 AList。
- [x] 实现并在 Unit/E2E 验证 CDN URL、Immutable/Mutable Asset Cache Behavior 与应用加载；真实 CDN Contract Evidence 仍属于下方未完成 Verification。
- [x] 隔离 Application Asset、CI Contract Test、Backup Credential。
- [x] 明确 Canonical Article Markdown 永不进入 S3。

### 本 Phase 明确不做什么

- 不对 Production Bucket 执行 Destructive Test。
- 不实现 pgBackRest/PITR，不决定未经测试的 Direct Repository Path。
- 不迁移 Canonical Content 或 Runtime Search/Translation State 到 S3。

### Tests / Verification

- [x] 全部 Contract Case 在 S3Mock 通过。
- [x] 经 Owner 授权后，全部适用 Case 在指定 S3-compatible 非生产 Bucket 通过并清理测试 Object；当前 Production 选型须由 AList 非生产 Target 补齐证据。
- [x] Credential Boundary Test 证明 Application Public-read 不等于 Public-write。
- [x] CDN/Cache Header 和 Unicode/Metadata Behavior 符合应用假设。

### Acceptance Criteria

- [x] 应用依赖的 S3 Behavior 在 Emulator 与当前 Production S3-compatible Implementation（AList）均有证据，代码契约不绑定 Provider。
- [x] Local Test 无 Production Credential，Production Resource 未受影响。
- [x] Static Asset 与 Canonical Article Content 的职责边界保持不变。

### Exit Gate

- [x] S3Mock 与配置的 S3-compatible 非生产 Contract Report 通过；当前阶段 Report 明确记录 AList Target Evidence。
- [x] 所有测试 Object/Credential 使用均已审计和安全清理。
- [x] 创建聚焦 Commit：`test(storage): complete phase 11 s3 contract`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 12。

### 本阶段完成后形成的 Artifact / Capability

- 经真实 Implementation Contract 验证的通用 S3-compatible Asset Layer、AList Evidence、CDN/Cache Contract 和分离 Credential Model。

### Agent Rules for This Phase

- 外部 S3 Contract Test 必须获得明确非生产 Target；当前 AList Evidence Target 不清楚就停止。
- 绝不对 Production Bucket 做 DELETE/Overwrite Contract Test。
- 不因某个 S3-compatible Provider 差异静默增加第二套 Storage Abstraction/System；架构变化先 ADR。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 12 — Production Infrastructure、Ansible 与 Container Hardening

### 目标

交付可从 Code Provision 的 Production-like Host、Hardened Docker/Compose Service、OpenResty Path Routing、SOPS + age Secret 注入和 IPv6-compatible Origin Configuration。

### 为什么此时实施

核心应用、Control Plane 与 Storage Contract 已稳定；此时才能构建真实服务拓扑，避免 Infrastructure 围绕临时 Stub 固化。

### Depends On

- Phase 4、6、11；Phase 1–3 基线持续有效。

### Blocks

- Phase 13–18。

### 是否可与其他 Phase 并行

- 否；后续 Recovery/Deployment 都依赖此 Host/Compose/Privilege Baseline。

### Scope

- Ansible Provision、Docker Compose、OpenResty、Service DNS、SOPS + age、Hardened Image、Host Directory/Permission、`ddns.tungchiahui.cn:8443`、IPv6-only Compatibility。
- 引用：ADR 0011、0013、0014、0015；Deployment；Network and Origin；Security。

### Task Checklist

- [x] 建立 Version-controlled Ansible Inventory/Role/Playbook，以 Hostname/SSH Alias 寻址。
- [x] Provision Docker、OpenResty、PostgreSQL/PgBouncer、Next Blue/Green、`control-api`、Workers/Agent 和 State Directory。
- [x] 为每个 Service 创建 Multi-stage、Pinned、Minimal、Non-root Production Image。
- [x] 对实际可行 Service 启用 Read-only Root Filesystem，只开放明确 Volume/tmpfs。
- [x] Drop 不需要的 Linux Capability、Device、Namespace 和 Network Access。
- [x] 仅为 `deploy-agent` 配置受控最小 Docker/Host Capability；其他 Service 无 Docker Socket。
- [x] 建立 `/var/lib/tungchiahui/control-state` 等明确 Durable Directory、Owner、Mode、Backup Hook。
- [x] 使用 SOPS + age 管理 Production Secret，Runtime 注入且不 Bake 进 Image/Log。
- [x] 配置 OpenResty：普通 Route -> Active Next Slot，`/api/ops/*` -> 独立 `control-api`，AList/CDN Path 按规范处理。
- [x] 配置 `ddns.tungchiahui.cn:8443` Origin，不保存家庭公网数字 IP。
- [x] 验证 A+AAAA 与 AAAA-only Origin Scenario，内部只使用 Docker Service DNS。

### 本 Phase 明确不做什么

- 不执行 Production Cutover，不启用 `main` 自动部署。
- 不授予 `content-worker`/`control-api` Host Shell 或 Docker Socket。
- 不引入 Kubernetes、Service Mesh、Kafka 或 Always-on HA。

### Tests / Verification

- [x] 从 Clean Production-like Host 执行 Ansible Provision 并通过 Idempotency Run。
- [x] Image Inspection 证明 Non-root、无 Secret Layer、无 `latest` Identity。
- [x] Read-only Filesystem/Volume/Capability/Socket Permission Test 通过。
- [x] OpenResty Config Validation、Reload 和 Path-routing Integration Test 通过。
- [x] Next Slots 全挂时 `control-api` Route 仍可达。
- [x] IPv6-only Origin Compatibility Test 不要求修改 App/CI/CLI Config。

### Acceptance Criteria

- [x] 新 Host 可由 Version-controlled Infrastructure + Encrypted Secret 重建。
- [x] Container Hardening 与 Worker Privilege Separation 可由 Test 证明。
- [x] Production Identity 全部使用 Domain/Service Name，而非数字公网 IP。

### Exit Gate

- [x] Ansible、Container Hardening、OpenResty Routing、Secret 和 IPv6 Gate 全部通过。
- [x] Production-like Environment 尚未承载 Public Traffic。
- [x] 创建聚焦 Commit，建议：`feat(infra): complete phase 12 production foundation`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 13。

### 本阶段完成后形成的 Artifact / Capability

- Reproducible Ansible Provisioning、Hardened Compose Topology、独立 Control Route、Encrypted Secret 与 IPv6-ready Origin。

### Agent Rules for This Phase

- 不运行 Production Cutover 或对生产资源做 Destructive Test。
- Secret 不得出现在 Repository、Image Layer、Client Bundle、Command Output 或 Log。
- Privilege 只按声明 Capability 授予，不提供万能 Root Service。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 13 — Backup、PITR 与 PostgreSQL-independent Recovery

### 目标

实现 pgBackRest Base Backup、WAL Archival、PITR、Off-host/R2 Replica、Control-state Backup、PG-down Restore 和复用同一 Engine 的 Break-glass Path，并以 Restore Drill 证明可恢复。

### 为什么此时实施

Production-like Infrastructure 已存在，但在可恢复性经过真实 Drill 前不能开始 Full Deployment/Cutover Automation；Backup Command Success 本身不是 Gate。

### Depends On

- Phase 12、3、4、11。

### Blocks

- Phase 14–18。

### 是否可与其他 Phase 并行

- 否；Phase 14 Deployment Preflight 需要已验证 Backup/Recovery Policy。

### Scope

- pgBackRest Policy、WAL/PITR、Repository Compatibility Decision、AList/R2 Copy、`./site backup/restore`、SQLite Snapshot/Integrity、Recovery Agent、Break-glass、Restore Drill。
- 引用：ADR 0002、0003、0015；Backup and Recovery；Runbook；Security。

### Task Checklist

- [x] 配置 pgBackRest Full/Differential/Incremental Policy、WAL Archive、Retention 和 Integrity Check。
- [x] 使用 Phase 11 证据验证 pgBackRest-to-AList Semantics；决定 Direct S3 或 Local Repository + Verified Sync。
- [x] 实现独立 Cloudflare R2 Off-site Replica 与 Freshness/Failure Report。
- [x] 实现 `./site backup`、`backup status` 的 Environment Identification、Metadata、WAL 与 Replica Validation。
- [x] 实现 `./site restore <backup-or-time>` 的 Target Environment、Confirmation、Lock/Lease 和 Audit。
- [x] 确保 `control-api`/`deploy-agent`/SQLite 在 Production PostgreSQL Down 时可创建、恢复和查询 Restore Operation。
- [x] 实现 Control-state SQLite Consistent Checkpoint/Snapshot、Encrypted Backup、Integrity/Schema/Audit Restore。
- [x] 实现通过稳定 Inventory/SSH Alias 的显式 Break-glass Mode，调用同一 Recovery Engine/State/Audit。
- [x] 建立 Disposable Restore Drill：Backup -> Restore/PITR -> Migration/Version -> Integrity -> Representative App Read。
- [x] 收集真实 Backup/WAL/Restore Measurement；若数据充分再提出 RPO/RTO，否则保留未定义状态。

### 本 Phase 明确不做什么

- 不对 Production 执行 Destructive Restore Drill。
- 不把 Recovery Job 写入待恢复的 Production PostgreSQL。
- 不建立第二套 Break-glass Script、匿名 Recovery Endpoint 或永久 Root Token。

### Tests / Verification

- [x] Full Backup、WAL Archive、PITR 到指定时间点在 Disposable Target 通过。
- [x] Production PostgreSQL 停止时，Restore Operation 仍可 Create/Claim/Resume/Query。
- [x] Control API 不可用时，Break-glass 仍使用同一 Engine、SQLite Lock 和 Audit。
- [x] Crash/Restart、Lease Expiry、Partial Restore、Wrong Environment 和 Confirmation Failure Test 通过。
- [x] R2 Replica 独立性、Freshness 和 Restore Readability 有证据。
- [x] Control-state SQLite Backup/Restore 后 Active/Previous SHA 与 Audit Continuity 正确。

### Acceptance Criteria

- [x] 至少一个真实 Backup 已成功恢复并完成 Integrity/Application Read Check。
- [x] PostgreSQL Failure 不会阻塞基础 Restore/Recovery Control。
- [x] Backup、Control State 与 Off-site Replica 不共享单一故障点。

### Exit Gate

- [x] Restore Drill、PITR、PG-down、Break-glass、R2 和 Control-state Gate 全部通过。
- [x] Recovery Validation Plan、证据和未定义/已测 RPO/RTO 状态已报告 Owner。
- [x] 创建聚焦 Commit，建议：`feat(recovery): complete phase 13 tested recovery`。
- [x] Commit 后停止并向 Owner 报告，不自动进入 Phase 14。

### 本阶段完成后形成的 Artifact / Capability

- 经 Restore Drill 验证的 PostgreSQL/Control-state Backup、PITR、R2 Off-site Copy、PG-independent Restore 与 Break-glass Recovery。

### Agent Rules for This Phase

- 所有 Destructive Target 必须先解析、显示并确认为 Disposable/明确授权 Environment。
- 没有恢复证据的 Backup 不得标记有效。
- Break-glass 不得绕过 Auth、Lock、Audit 或复用第二套逻辑。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 14 — Shared Deployment Engine 与 Full Blue-Green

### 目标

实现 `deploy-agent`、统一 Deployment Engine、Immutable Git-SHA Image、Full Blue-Green、Expand/Contract-aware Migration、Pre/Post Smoke 和无需 Rebuild 的 Rollback。

### 为什么此时实施

只有在 Hardened Infrastructure 与 Tested Recovery 已存在后，才能安全赋予最小 Docker/OpenResty 权限并验证 Cutover/Failure State Machine。

### Depends On

- Phase 13；Public Smoke 依赖 Phase 6–11。

### Blocks

- Phase 15–18。

### 是否可与其他 Phase 并行

- 否；自动部署和最终 Cutover 必须复用本阶段唯一 Engine。

### Scope

- `deploy-agent`、SQLite Deployment Operation、Blue/Green Slot、Health/Ready/Version、Migration Preflight、OpenResty Atomic Cutover、Rollback、`./site deploy/rollback/status`。
- 引用：ADR 0004、0008、0013、0014、0015；Deployment；Blue-Green；Command Interface。

### Task Checklist

- [ ] 实现只接受 Git SHA/固定 Digest 的 Immutable Image Identity，拒绝 `latest`。
- [ ] 实现 Active/Inactive Detection、Target Slot、Previous Rollback Target 和 Stabilization Window。
- [ ] 在 SQLite 持久化 Operation Phase、Current/Last SHA、Digest、Lock/Lease、Actor 和 Audit。
- [ ] 实现统一 Deployment Engine，供 `control-api`、`./site deploy` 和后续 GitHub Actions 调用。
- [ ] 实现 `deploy-agent` 的受控 Docker/Compose、Migration、OpenResty Validate/Reload Capability。
- [ ] 实现 Migration Metadata、Fresh Recoverable Backup Policy、Expand/Contract Compatibility Preflight。
- [ ] 启动 Inactive Slot 并验证 `/api/health`、`/api/ready`、`/api/version`。
- [ ] 执行 Homepage、Article、Locale、Search、Static Asset 的 Pre-cutover Smoke。
- [ ] 原子切换 OpenResty，执行真实 Entry 的 Post-cutover Smoke。
- [ ] Post-cutover Failure 时在 Schema 兼容条件下切回 Previous Slot，不 Rebuild Image。
- [ ] 实现 Restart Reconciliation、Failed Candidate Cleanup、Concurrent Deploy Rejection 和 Evidence Retention。
- [ ] 实现 PostgreSQL Down 时仍可查询状态、创建基础 Deploy/Rollback Operation，并明确依赖失败。

### 本 Phase 明确不做什么

- 不启用 `main` 自动 Production Trigger；留给 Phase 15。
- 不在 Active Container 原地更新，不使用 `latest`。
- 不把 Deployment State 搬回 PostgreSQL，不给 `content-worker` Docker 权限。

### Tests / Verification

- [ ] Inactive Deployment Failure 不影响 Active Slot。
- [ ] Health/Ready/Version 与全部 Pre/Post Smoke Gate 通过。
- [ ] OpenResty Invalid Config 不 Reload、不切流。
- [ ] Rollback 切回保留 Image，过程中不 Rebuild。
- [ ] Blue/Green Schema Overlap 与 Previous-schema Migration Test 通过。
- [ ] Crash 在 Start/Migrate/Pre-switch/Post-switch 各 Phase 后可安全 Reconcile。
- [ ] Permission Test 证明只有 `deploy-agent` 有受控 Docker/OpenResty Capability。

### Acceptance Criteria

- [ ] 手工 `./site deploy <sha>` 与 `rollback` 使用同一可审计 State Machine。
- [ ] Cutover 前后 Smoke、Failure/Abort/Rollback 行为 Deterministic。
- [ ] Previous Slot 在 Rollback Window 内完整保留。

### Exit Gate

- [ ] Production-like Blue-Green、Failure Injection、Crash Recovery、Migration Compatibility 与 Rollback Gate 全部通过。
- [ ] 尚未执行旧站 Production Cutover。
- [ ] 创建聚焦 Commit，建议：`feat(deploy): complete phase 14 blue-green engine`。
- [ ] Commit 后停止并向 Owner 报告，不自动进入 Phase 15。

### 本阶段完成后形成的 Artifact / Capability

- 唯一 Shared Deployment Engine、最小权限 deploy-agent、Full Blue-Green、Atomic Cutover 和 Immediate Rollback。

### Agent Rules for This Phase

- 不允许第二套 CI/Manual Deployment Logic。
- 不对 Production Public Traffic 执行 Cutover，除非 Owner 在 Phase 18 明确授权。
- 任何 Migration 必须满足 Expand/Contract 和 Backup Gate。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 15 — GitHub Actions OIDC 与 `main` 自动部署

### 目标

完成 Web Application Repository `main` 的自动 Production Deployment Pipeline、GitHub OIDC、Immutable Image Supply Chain，并严格分离 Content Push 与 Translation Manual Workflow。

### 为什么此时实施

Deployment Engine 已在 Production-like 环境证明安全，才能让 CI 只做认证与调用，而不是在 Workflow 中复制高权限部署逻辑。

### Depends On

- Phase 14、4、5、9。

### Blocks

- Phase 16–18。

### 是否可与其他 Phase 并行

- 否；它改变面向 Production 的默认 Trigger，需要独立安全审计。

### Scope

- PR/`main` CI Gates、Git-SHA Image Build/Push、OIDC Auth、Environment Protection、Control API Trigger、Content Sync Workflow、Manual Translation Workflow、Renovate Integration。
- 引用：System Design；Deployment；Command Interface；Security；Testing Strategy。

### Task Checklist

- [ ] 固化 PR 与 `main` 的 format/lint、typecheck、unit、integration、migration、build、affected E2E Gate。
- [ ] 仅在 `main` Gates 全部通过后 Build/Publish Git-SHA-tagged、Digest-pinned Immutable Image。
- [ ] 使用 GitHub OIDC 调用 `https://www.tungchiahui.cn/api/ops/deployments`，严格验证全部 Claims。
- [ ] 让 Workflow 与 `./site deploy` 调用同一 Control API、Policy 和 Deployment Engine。
- [ ] 配置 GitHub Environment/Approval/Concurrency/Idempotency，避免重复或并发 Cutover。
- [ ] 确保 Content Repository Push 只 Validate + Trigger Content Sync，不 Build Next.js 或 Blue-Green。
- [ ] 确保 Translation `workflow_dispatch` 使用 Typed Input/OIDC，且不阻塞 Content Push。
- [ ] 确保 Workflow 不持有 Production DB、AI Provider、Host Root 或 Docker Credential。
- [ ] 验证 Renovate PR 走相同 CI Gate，Security Update 优先，Core Major 不默认 Auto-merge。
- [ ] 提供 Manual Retry/指定 SHA Deployment，不建立独立实现。

### 本 Phase 明确不做什么

- 不把所有 Repository Push 都定义为 Application Deploy。
- 不允许 Workflow 直连 Production PostgreSQL/Host/Docker。
- 不绕过 CI Gate、Control API、Pre/Post Smoke 或 Environment Protection。

### Tests / Verification

- [ ] PR Gate Failure 阻止 Merge/Deploy；`main` Gate Failure 阻止 Image/Deployment Trigger。
- [ ] OIDC 错误 issuer/audience/repository/ref/workflow Claim 被拒绝。
- [ ] Duplicate Workflow 通过 Idempotency/Concurrency 不产生双重 Cutover。
- [ ] `main` Happy Path 调用 Shared Engine 完成 Production-like Blue-Green。
- [ ] Content Push Test 证明无 Application Image Build/Blue-Green/AI Call。
- [ ] Manual Translation Workflow 无 DB/AI/Host Credential。

### Acceptance Criteria

- [ ] `main` 是 Web Application Repository 的正常自动发布路径。
- [ ] Human/CI Deployment 完全共享 Engine、Policy、State 和 Audit。
- [ ] Content、Translation 与 Application Trigger Boundary 清晰可测试。

### Exit Gate

- [ ] CI/CD、OIDC、Trigger Separation、Supply-chain 和 Concurrency Gate 全部通过。
- [ ] 自动 Pipeline 只在 Production-like/Staging 验证，未替换旧站。
- [ ] 创建聚焦 Commit，建议：`feat(ci): complete phase 15 oidc deployment automation`。
- [ ] Commit 后停止并向 Owner 报告，不自动进入 Phase 16。

### 本阶段完成后形成的 Artifact / Capability

- OIDC-secured `main` Auto-deploy Pipeline、Immutable Image Supply Chain、Content-only Sync Workflow 和 Manual Translation Workflow。

### Agent Rules for This Phase

- Workflow 只能触发 Control Plane，不得包含平行 Deployment/Recovery 实现。
- 不向 GitHub Secret 添加 DB、AI 或 Host Root Credential。
- 未经 Owner Phase 18 授权，不把 Production Public Traffic 切到 V2。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 16 — Observability、Security 与 Production Readiness

### 目标

对 Application、Control Plane、Worker/Agent、Database、Storage、Backup、Network 和 Host 完成可观测性、安全、性能与 Runbook Hardening，并关闭 Production-readiness Gap。

### 为什么此时实施

所有主要 Runtime/Operation Path 已存在，只有此时才能做端到端 Threat/Failure/Alert/Load Review；该阶段必须在迁机演练和最终 Cutover 前完成。

### Depends On

- Phase 15、13、14。

### Blocks

- Phase 17、18。

### 是否可与其他 Phase 并行

- 否；它是跨全系统的 Production Gate。

### Scope

- Structured Log、Metric、Alert、Health/Readiness、Trace（适用时）、Audit、Secure Header、Rate Limit、Secret/Credential Rotation、Dependency Security、Load/Failure Test、Runbook。
- 引用：Observability；Security；Non-functional Requirements；Runbook；Acceptance Criteria。

### Task Checklist

- [ ] 为 Public/OpenResty/Next.js/Control API/Worker/Agent/PostgreSQL/PgBouncer/S3/Host/Backup 建立安全 Structured Telemetry。
- [ ] 监控 Application Job 与 SQLite Infrastructure Operation，包含 Age、Lease、Stuck、Failure、Budget 和 Audit Continuity。
- [ ] 建立可操作 Alert：Availability、5xx、Latency、Disk、DB、Backup/WAL/R2、Restore Drill、Control State。
- [ ] 分离 Public Path 与 Origin Path Monitoring，支持 IPv6 Direct-origin Check。
- [ ] 配置并测试 HTTPS、HSTS Policy、CSP、X-Content-Type-Options、Referrer/Permissions Policy。
- [ ] 对 Public/Control Endpoint 完成 Runtime Validation、Rate Limit、Method Restriction、Replay/Idempotency 和 Abuse Test。
- [ ] 验证 Runtime/Migration/Backup/S3/AI/Deploy Credential 最小权限和 Rotation Procedure。
- [ ] 扫描 Client Bundle、Image Layer、Log/Response，确认无 Secret/Connection String/Sensitive Header。
- [ ] 执行 Representative Load、Pool Saturation、Slow Query、Cache、Worker Backlog 和 Disk-pressure Test。
- [ ] 更新 Incident、Rollback、Restore、Translation、Origin Connectivity 和 Security Runbook。
- [ ] 对照 Acceptance Criteria 生成 Production Readiness Gap Report。

### 本 Phase 明确不做什么

- 不虚构未测 SLA、RPO/RTO 或性能数字。
- 不通过记录 Sensitive Data 提高可观测性。
- 不以 Public IP Allowlist 代替 Cryptographic Authentication。

### Tests / Verification

- [ ] Alert Injection 能产生可操作 Signal，并验证恢复后 Clear Behavior。
- [ ] Security Header/CSP/Rate Limit/Authz/Replay/Secret Leakage Test 通过。
- [ ] Database/Next.js/Control API/Worker/Storage Failure Scenario 可区分诊断。
- [ ] PostgreSQL Down 时 Recovery Observability 仍可用。
- [ ] Load/Pool/Cache/Backlog 测试结果已记录，无未解释 Critical Bottleneck。
- [ ] Dependency/SBOM/Image/Config Security Scan 无未接受 Critical Finding。

### Acceptance Criteria

- [ ] 每个生产组件都有 Owner、Health、Metric、Log、Alert 和 Runbook Entry。
- [ ] Security Boundary 与 Least Privilege 有自动化/审计证据。
- [ ] Production Readiness Gap 已关闭或由 Owner 明确接受并记录。

### Exit Gate

- [ ] Observability、Security、Load、Secret 和 Runbook Gate 全部通过。
- [ ] Acceptance Criteria Gap Report 没有未授权 Critical Blocker。
- [ ] 创建聚焦 Commit，建议：`feat(ops): complete phase 16 production readiness`。
- [ ] Commit 后停止并向 Owner 报告，不自动进入 Phase 17。

### 本阶段完成后形成的 Artifact / Capability

- End-to-end Observability、安全加固、可操作 Alert/Runbook、性能证据和 Production Readiness Report。

### Agent Rules for This Phase

- Telemetry 不得记录 Secret、Token、Private Key、Connection String、完整 Authorization/Cookie。
- Critical Finding 不得以“个人网站”理由降级或跳过。
- 任何未测数字必须标记 Unknown，不得伪装为 SLA。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 17 — Planned PostgreSQL / Server Migration Readiness

### 目标

证明新服务器可从 Code Provision，并通过同 Major Physical Streaming Replication、受控 Promotion/Origin Cutover、Control-state Transfer 和 IPv6-only Scenario 实现 Near-zero Planned Downtime。

### 为什么此时实施

系统已具备 Backup、Deploy、Observability 和 Hardened Provisioning，才能安全演练未来服务器替换，而不把实验性迁机逻辑带入最终 Cutover。

### Depends On

- Phase 16、12–15。

### Blocks

- Phase 18。

### 是否可与其他 Phase 并行

- 否；这是最终 Production Cutover 前的迁移与恢复成熟度 Gate。

### Scope

- `./site provision`、`./site migrate-server`、Physical Replication、Promotion、Origin Update、Control-state Snapshot/Reconcile、Cross-major Runbook、Abort/Rollback、IPv6-only。
- 引用：ADR 0009、0011、0015；Server Migration；Network and Origin；Backup/Deployment Runbook。

### Task Checklist

- [ ] 使用 Ansible 在新的非生产 Host 从 Code/Encrypted Secret 完成 Provision。
- [ ] 建立稳定 Inventory/SSH Identity；Bootstrap Numeric Address 不进入 Durable Config。
- [ ] 实现/验证 Same-major PostgreSQL Physical Streaming Replication、Lag、Final WAL 和 Controlled Promotion。
- [ ] 实现 `./site migrate-server <inventory-hostname-or-alias>` Orchestration 与 Audit。
- [ ] 在 Target 部署 Application Candidate，执行 Local-to-target Health/Ready/Smoke。
- [ ] 迁移或明确重建 Control-state SQLite，验证 Active/Previous SHA、Lease、Operation Phase 和 Audit Continuity。
- [ ] 实现 DDNS/Origin Hostname Cutover 与 Public Post-switch Test，不硬编码数字 IP。
- [ ] 演练 AAAA-only Target，确认 App/CI/CLI 无需修改。
- [ ] 记录 Replication/Readiness/Backup/Storage/Smoke Abort Criteria 和 Old-host Non-writing Rollback Window。
- [ ] 为 Cross-major 场景记录当期支持的 Logical Replication/Upgrade Decision；若超出 ADR 0009，先新增 ADR。

### 本 Phase 明确不做什么

- 不建立无 Quorum/Fencing 的 Always-on Automatic HA。
- 不把 Temporary Bootstrap Address 变成长期配置。
- 不在未获 Owner 授权时迁移真实 Production Primary。

### Tests / Verification

- [ ] Provision Idempotency 与 Target Hardening Test 通过。
- [ ] Physical Replication Catch-up、Write Quiesce、Promotion、App Reconnect 和 Public-like Cutover 通过。
- [ ] Abort Criteria 在 Promotion 前能安全停止；Rollback Target 保持 Non-writing/可控。
- [ ] Control-state Transfer/Reconcile 与 Recovery Operation Continuity 通过。
- [ ] IPv6-only Origin Test 通过且没有应用/Workflow 配置变化。
- [ ] Cross-major Runbook 引用当期官方支持证据，不假设 Physical Replication。

### Acceptance Criteria

- [ ] 新服务器能从 Version-controlled Infrastructure 重建并接管 Service。
- [ ] Same-major Planned Migration 达到经测量的 Near-zero Downtime 且 No Data Loss。
- [ ] Migration 不要求长期 Standby HA 或永久 Public IPv4。

### Exit Gate

- [ ] 非生产 Server Migration Rehearsal、Abort/Rollback、Control-state 和 IPv6 Gate 全部通过。
- [ ] Migration Evidence/Timing/Risk 已向 Owner 报告。
- [ ] 创建聚焦 Commit，建议：`feat(ops): complete phase 17 migration readiness`。
- [ ] Commit 后停止并向 Owner 报告，不自动进入 Phase 18。

### 本阶段完成后形成的 Artifact / Capability

- Reproducible New-host Provisioning、Planned PostgreSQL/Server Migration、Control-state Transfer、IPv6-only Origin Readiness。

### Agent Rules for This Phase

- 默认只在非生产环境演练；真实 Primary 操作需要 Owner 明确授权。
- Promotion 前任何 Abort Criteria 失败都必须停止，不得强行继续。
- 不引入 Permanent HA 或新的迁移技术栈来扩大 Scope。
- 完成 Exit Gate 后更新本计划、提交 Phase Commit、报告并停止。

---

## Phase 18 — Final Legacy Audit、Production Cutover 与 Rollback Window

### 目标

完成最终 Legacy Compatibility/Acceptance Audit，在 Owner 明确授权下把 Production Traffic 从旧 Nuxt 站切换到 V2，并保留、验证和最终关闭明确的 Rollback Window。

### 为什么此时实施

这是唯一允许替换旧 Production Site 的 Phase；必须在功能、恢复、部署、安全、可观测性和迁机能力全部通过硬 Gate 后执行。

### Depends On

- Phase 0–17 全部完成并由 Owner 接受。

### Blocks

- Website V2 Production Completion。

### 是否可与其他 Phase 并行

- 否。Cutover 是单一受控 Operation。

### Scope

- Refresh Legacy Inventory、Full Content Sync、Route/Feature/Visual Audit、Production Readiness Review、Fresh Backup/Restore Evidence、V2 Candidate、DNS/Upstream Cutover、Public Smoke、Rollback Window、Post-cutover Observation。
- 引用：ADR 0001、0004、0006、0011；Migration Guide；Acceptance Criteria；Deployment/Recovery/Runbook。

### Task Checklist

- [ ] 冻结并刷新 Phase 0 Legacy Inventory，确认旧站自 Phase 0 后新增的 Route/Feature/Content。
- [ ] 执行最终 GitHub Canonical Content Sync，核对 Count、Hash、Delete/Move 和 Translation Pending/Fallback。
- [ ] 对 MUST KEEP/SHOULD KEEP、Visual Identity、Interaction、Search、Locale、Asset 和 Analytics-sensitive Route 做 Final Audit。
- [ ] 运行完整 Quality Gate、Migration Gate、Storage Contract、Restore Drill、Security/Observability 和 Production Smoke Rehearsal。
- [ ] 确认 Fresh Recoverable Backup、WAL/R2、Control-state Backup 和 Previous Nuxt Rollback Plan。
- [ ] 由 Owner 明确批准 Cutover Window、Abort Criteria、Communication 和 Rollback Window。
- [ ] 通过 Shared Deployment Engine 部署 Git-SHA V2 Candidate 到 Inactive Slot。
- [ ] 执行 Pre-cutover Health/Ready/Version/Home/Article/Locale/Search/Asset Smoke。
- [ ] 原子切换 OpenResty/Origin Traffic 到 V2，并执行真实 Public Post-cutover Smoke。
- [ ] 在 Stabilization Window 监控 Error、Latency、DB、Job、Backup、Translation Cost 和 User-visible Regression。
- [ ] 如果任一 Critical Abort Criteria 触发，立即按已验证 Path 回滚，不 Rebuild。
- [ ] Rollback Window 内保留旧 Nuxt Production Capability 为只读/可控状态，不修改旧仓库。
- [ ] 只有在 Owner 接受 Stabilization Evidence 后，关闭旧站 Rollback Window 并记录最终状态。

### 本 Phase 明确不做什么

- 不在 Owner 未明确授权时进行任何 Production Cutover/DNS/Origin Change。
- 不现场编辑 Container、跳过 Gate 或边切流边修复未验证代码。
- 不因 Cutover 完成而自动删除旧数据、Backup、Image 或 Rollback Slot。

### Tests / Verification

- [ ] 全部 Repository Merge Gate 和 Acceptance Criteria 通过。
- [ ] Final Legacy URL/Pinyin/Feature Matrix 无未接受 Regression。
- [ ] Fresh Restore Drill 与 Rollback Rehearsal 通过。
- [ ] Pre-cutover 和真实 Public Post-cutover Smoke 全部通过。
- [ ] Content Push 仍只 Sync；`main` Deploy、Manual Deploy 和 Rollback 仍共享 Engine。
- [ ] Production Telemetry 在 Stabilization Window 无未解释 Critical Alert。

### Acceptance Criteria

- [ ] V2 满足 `docs/specification/acceptance-criteria.md` 全部适用项。
- [ ] 旧 URL、Pinyin、Locale、Content、Search、Asset 和重要 Feature 达到 Owner 接受的兼容水平。
- [ ] Production Cutover 可观察、可恢复、可立即 Rollback，且无数据丢失。
- [ ] Rollback Window 的关闭由 Owner 明确批准并留下证据。

### Exit Gate

- [ ] Owner 批准 Cutover，所有 Preflight/Backup/Restore/Smoke Gate 通过。
- [ ] V2 已稳定承载 Production Traffic，Stabilization Window 完成。
- [ ] Owner 接受 Final Compatibility/Operations Report 和 Rollback Window 关闭。
- [ ] 创建聚焦 Commit，建议：`release(v2): complete phase 18 production cutover`。
- [ ] Commit 后停止并提交最终 Website V2 Completion Report。

### 本阶段完成后形成的 Artifact / Capability

- 正式 Website V2 Production Service、完整兼容性/验收证据、可审计 Cutover 与已管理 Rollback Window。

### Agent Rules for This Phase

- 所有 Production/Destructive Action 必须逐项获得 Owner 明确授权并解析精确 Target。
- 任一 Critical Gate/Abort Criteria 失败立即停止或按 Runbook Rollback。
- 旧 Nuxt Repository 始终只读；Rollback 保留的是已知良好部署，不是继续开发旧架构。
- 完成 Exit Gate 后更新本计划、提交 Release Commit、报告并停止。

---

## 核心能力 Coverage Audit

| 核心能力 | 主要 Phase | Gate 位置 |
| --- | --- | --- |
| Legacy Nuxt Discovery / Migration Inventory | 0、18 | Phase 0 Inventory；Phase 18 Final Audit |
| Legacy URL / Pinyin Compatibility | 0、5、6、18 | Fixture、Ingestion、E2E、Final Audit |
| Next.js Engineering Baseline / Strict TypeScript | 1 | Build/Typecheck Gate |
| Renovate | 1、15 | Config Validation；CI/PR Policy |
| Docker Production Hardening | 12、16 | Image/Permission/Security Gate |
| Local PostgreSQL / S3Mock | 2 | Hermetic Dev/Test Gate |
| PostgreSQL Schema / Drizzle Migrations | 3 | Clean/Previous/Overlap Migration Gate |
| GitHub zh-CN One-way Content Sync | 5、15 | Directionality/Trigger Separation Gate |
| Content Ingestion Pipeline / content-worker | 5 | Idempotency/Move/Delete Gate |
| zh-CN Website Baseline | 6 | Public Vertical-slice E2E |
| next-intl UI i18n | 1、7 | Message/Locale E2E |
| OpenCC zh-HK / zh-TW | 7 | Glossary/Protected Syntax Gate |
| Translation Memory / en-US Fallback | 8 | Hash/AST/Fallback/Zero-cost Gate |
| Explicit Paid AI / Dry-run / Budget | 9 | Cost/Authz/Partial Gate |
| PGroonga Search | 10 | Relevance/Locale/Reindex Gate |
| AList S3 Contract Test | 11 | S3Mock + Non-production AList Report |
| Independent control-api | 4、12 | Routing/Failure/Hardening Gate |
| deploy-agent | 13、14 | Recovery/Deployment Permission Gate |
| GitHub Actions OIDC | 4、15 | Claim-validation/Workflow Gate |
| `main` Automatic Production Deployment | 15 | Full Pipeline Gate |
| Full Blue-Green | 14 | Failure/Cutover/Rollback Gate |
| PG-independent Recovery / Break-glass | 4、13、14 | PG-down/Crash/Restore Gate |
| pgBackRest / WAL / PITR / Restore Drill | 13、18 | Recovery Drill/Fresh Pre-cutover Drill |
| Observability / Security Hardening | 16 | Production Readiness Gate |
| Ansible Provisioning | 12、17 | Clean Host/Idempotency Gate |
| IPv6-only Origin Compatibility | 12、17 | AAAA-only Origin/Migration Gate |
| Planned PostgreSQL / Server Migration | 17 | Non-production Migration Rehearsal |
| Final Legacy Compatibility Audit | 18 | Cutover Preflight |
| Production Cutover / Rollback Window | 18 | Owner-approved Final Exit Gate |

## Accepted ADR Coverage Audit

| ADR | Decision Coverage | Implemented / Verified In |
| --- | --- | --- |
| ADR 0001 | 新 Next.js V2 Repository；旧 Nuxt 只读参考 | Phase 0、1、18 |
| ADR 0002 | PostgreSQL Runtime Content Store | Phase 3、5、8、10、13 |
| ADR 0003 | AList S3 Asset/Backup Artifact；R2 Replica | Phase 11、13 |
| ADR 0004 | Full Blue-Green、Immutable Image、Rollback | Phase 14、18 |
| ADR 0005 | TypeScript/TSX Application/Automation Source | Phase 1，并由每阶段 Gate 持续验证 |
| ADR 0006 | GitHub zh-CN Canonical Content | Phase 0、5、8、18 |
| ADR 0007 | Hermetic PostgreSQL/S3Mock Local Environment | Phase 2、3、11 |
| ADR 0008 | Expand/Contract Migration | Phase 3、14、18 |
| ADR 0009 | Near-zero Planned DB Server Migration | Phase 17 |
| ADR 0010 | Explicit Budgeted AI Translation | Phase 8、9、15 |
| ADR 0011 | Domain-addressed Control Plane/DDNS Origin | Phase 4、12、15、17 |
| ADR 0012 | GitHub -> PostgreSQL One-way Sync | Phase 5、15、18 |
| ADR 0013 | content-worker / deploy-agent Privilege Separation | Phase 4、5、9、12–14、16 |
| ADR 0014 | Control API 独立于 Next.js Slot | Phase 4、12、14、16 |
| ADR 0015 | PostgreSQL-independent SQLite Recovery State | Phase 4、12–14、17 |

Coverage Audit 结论：当前 15 份 Accepted ADR 均至少映射到一个实施 Phase 和一个明确 Verification/Exit Gate；没有 Accepted ADR 被遗漏或被本计划 Supersede。

## Dependency Cycle Audit

- Content 主链：Schema -> Control Trigger -> Ingestion -> Public Rendering -> Locale -> Translation -> Search，无反向依赖。
- Production 主链：Provision/Hardening -> Tested Recovery -> Shared Blue-Green Engine -> CI/OIDC Trigger -> Readiness -> Migration Rehearsal -> Cutover，无循环依赖。
- Deployment/Restore State 使用 SQLite，避免对 Production PostgreSQL 的 Recovery Cycle。
- `/api/ops/*` 使用独立 `control-api`，避免对被管理 Next.js Slot 的 Control Cycle。
- Phase 9 与 Phase 10、Phase 11 与 Phase 7–10 的技术并行不改变 Hard Gate；默认编号执行不会形成 Commit 或 Ownership Cycle。

## 最终完成定义

只有 Phase 0–18 全部 Exit Gate 通过、对应 Phase Commit 存在、Owner 接受 Phase 18 Stabilization/Compatibility Report，并明确关闭 Rollback Window 后，Website V2 才可标记为完成。
