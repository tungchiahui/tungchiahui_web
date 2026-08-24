# Website V2 Current Implementation State

> Status: Phase 0–5 completed; Phase 6 not started
> Current Phase: Awaiting Owner authorization for Phase 6
> Handoff audit date: 2026-08-24

本文件是新 Claude Code/Codex 会话的简洁交接入口。它索引当前实际状态和容易遗漏的实施事实，不替代 `AGENTS.md`、Accepted ADR、架构规范或 `implementation-plan.md`。

维护规则：每个 Phase 完成时，Agent 自动复核并沉淀后续实施所需事实；有状态变化时更新本文件，没有变化时也应在最终报告确认已完成交接审计。完成沉淀只表示下一 Phase 依赖可供 Owner 评估，不授权 Agent 自动继续。

## 1. 新会话读取顺序

1. `AGENTS.md`、`README.md`、本文件；
2. `docs/planning/implementation-plan.md` 中的 Current Phase；
3. 当前 Phase 引用的 Architecture、Requirement、Migration 文档和 Accepted ADR；
4. 本文件链接的既有 Verification/Fixture，不依赖历史聊天内容。

## 2. 已完成阶段与证据

| Phase | Focused commit | Durable evidence | Gate status |
| --- | --- | --- | --- |
| 0 — Legacy Discovery | `abd7b7e962a600f1405d5649fae225a46758b168` | Legacy Baseline、Route/Pinyin Fixture、Risk Register、Traceability、Verification | 可靠通过；Owner Decisions O-001–O-007 已关闭 |
| 1 — Engineering Baseline | `f59d49f425c684e13b87397933d064061bb9c673` | `phase-1-engineering-baseline.md` 与 Verification Report | 可靠通过；锁定工具链、CI、Branch Protection、Clean Checkout Gate 已建立 |
| 2 — Hermetic Local Platform | `58ec725f7d5f6b92dad63767a7cc8146446c5c43` | `phase-2-hermetic-local-platform.md` 与 Verification Report | 可靠通过；Clean Start/Test/Restart/Reset/Failure Cleanup/Isolation Gate 已验证 |
| 3 — Persistence Foundation | `feat(db): complete phase 3 persistence foundation` | `phase-3-persistence-foundation.md` 与 Verification Report | 可靠通过；Clean/Previous/Repeat Migration、Role、PgBouncer、Validation Gate 已验证 |
| 4 — Independent Control Plane | `feat(ops): complete phase 4 independent control plane` | `phase-4-independent-control-plane.md` 与 Verification Report | 可靠通过；Auth/Replay、OpenResty、SQLite Crash/Lease、Next-down、PostgreSQL-down 与 Permission Gate 已验证 |
| 5 — One-way Content Ingestion | `feat(content): complete phase 5 one-way ingestion` | `phase-5-one-way-content-ingestion.md` 与 Verification Report | 可靠通过；GET-only、Markdown/Route、Idempotency、Delta/Move/Delete、Collision、Retry/Claim 与 Directionality Gate 已验证 |

`implementation-plan.md` 中 Phase 0–5 的 Checklist 与 Overall Progress 已完成，Phase 6 保持未开始。任何后续 Agent 不得根据本文件自行越过 Owner 授权 Gate。

## 3. Legacy durable baseline

Phase 0 行为证据固定在旧 Nuxt Commit `d33e9ee5f90a266207f9f9658a47031eafdb981a`：

- 237 个 Canonical zh-CN Markdown（4 Blog、233 Wiki），18 个 Wiki 根目录；
- Minimal Frontmatter 只有四种已记录 Shape，Wiki 必须接受 `title`-only；
- Blog 显式 `path` 优先；Wiki 使用已固定的 Pinyin Algorithm；Collision 在写入前使整次 Ingestion 失败；
- Unprefixed Route 保留为 zh-CN Compatibility Surface；批准 Locale 只有 `zh-cn`、`zh-hk`、`zh-tw`、`en-us`；`zh-hant` 移除且不 Redirect；
- 7 个 Wiki Alias 是显式 Allowlist；Phase 5 已实现真实 Document FK、Approval Reference 与 Alias Collision Gate；
- `/about`、`/cv`、`/friend`、`/more`、`/mylogo`、Music、Start、公开 Stats/Page Traffic、`tech-footprint`、`weight-loss` 和完整 `/docs/ros2/**` 均按 Owner 决定保留；
- `tech-footprint`/`weight-loss` 的 PostgreSQL Authority 与 Phase 4 精确 API Payload/Auth/Revision Boundary 已建立；字段级 Shape 已沉淀在 `docs/architecture/data-model.md`；
- GitHub 仍只保存 zh-CN Canonical Markdown；Runtime PostgreSQL 不能反向成为 GitHub Authoring Source。

完整证据：`docs/migration/legacy-discovery-baseline.md`、`legacy-route-and-pinyin-fixtures.md`、`legacy-risk-register.md`、`docs/planning/phase-0-traceability.md`。

Phase 5 没有读取旧仓库；仓库内 Phase 0 Artifact 足以回答全部实现问题。

## 4. 当前仓库实际能力

- Next.js 16.3.2 App Router Skeleton；目前仍不是 Website V2 Public Vertical Slice。
- Node.js `24.19.0`、pnpm `11.23.0`、严格 TypeScript、Tailwind CSS 4、Base UI-based shadcn/ui、next-intl 四 Locale Skeleton。
- `./site check` 执行 Biome、Source Policy、Drizzle Migration Consistency、Typecheck、Renovate Validation 和 Production Build。
- `./site test` 执行 63 个 Unit、Disposable Infrastructure Integration 和 Dedicated PostgreSQL Migration Suite；只有 Phase 6 E2E 仍诚实报告 `NOT_IMPLEMENTED`。
- PostgreSQL `app` Schema 有 8 个 Table；3 个 Checked-in Expand Migration 覆盖 Content/Translation/Job/Ingestion/Alias/Dataset 与 Phase 5 Application-job Claim/Lease/Retry。
- `site_app`、`site_migrator`、`site_content_worker`、`site_control_api`、`site_backup`、`site_replication` NOLOGIN Group Role 与 Grant Boundary 已建立并测试。
- `./site dev` 对 PostgreSQL 直接 Migrate，再经 transaction-mode PgBouncer 使用 Content-worker Role 应用 Deterministic/Idempotent Seed。
- PostgreSQL Application Job Enum 不包含 Deploy/Rollback/Restore/Recovery；这些 Operation 继续严格属于 ADR 0015 SQLite Boundary。
- 独立 `control-api` 提供 Operator/OIDC Auth、Capability、Validation、Replay/Idempotency、PostgreSQL Application Job 与 SQLite Recovery Operation Boundary。
- `GitHubContentSource` 只读精确 Commit Tree/Blob，拒绝 Truncated Tree 和 Blob Hash Drift；没有 Commit/Push/PR/Edit/Delete Path。
- Markdown 经 unified/remark/rehype + YAML/Zod Runtime Validation，接受 Phase 0 Minimal Frontmatter，产生固定 Legacy Pinyin/Route。
- Content Snapshot Transaction 支持 Add/Modify/Soft-delete/安全 Move、Source Hash、Stable Runtime ID、7 条 Allowlist Alias 与 Collision-before-write。
- `content-worker` 对 `content_sync` 实现 `FOR UPDATE SKIP LOCKED` Claim、Lease Expiry、Retry、Attempt Limit、Progress、Failure 与 `ingestion_runs` Audit；同 Commit 重放不重复 Hook。
- Translation Diff、zh-CN Revalidation、Search Refresh 是 Deferred Typed Hook，当前只记录零成本结构化事件；无 AI/Build/Deploy 调用。
- SQLite Control-state Version 2 使用 WAL/FULL/Checkpoint、Transaction、Nonce、Operation State Machine、Lease/Fencing/Heartbeat、Restart Reconciliation 与 Append-only Audit；与 `deploy-agent` Fake 保持 Phase 4 边界，未扩大到 Content Job。
- Local OpenResty 直接分流 `/api/ops/*` 到独立 Control API；Next.js 全停与 PostgreSQL/PgBouncer 停机 Scenario 均在 Disposable Integration 验证。
- Local/Test Container 保持 Read-only Root、Drop-all Capability、`no-new-privileges`，`content-worker`/`control-api` 无 Docker Socket、OpenResty Admin 或 Host Shell。

## 5. 当前 Stub/Fake 与替换责任

| Current boundary | 当前真实含义 | Replacement Phase |
| --- | --- | --- |
| `content_sync` Job | Control API 创建/查询；content-worker 真实 Claim/Retry/执行 | 已在 Phase 5 完成 |
| Translation/Search/Cache Job | 仍只创建/查询；无执行 Handler | Phase 8–10 |
| Translation Diff Hook | Phase 5 Typed zero-cost deferred event | Phase 8 |
| zh-CN Revalidation Hook | Phase 5 Typed deferred event；没有 Public Cache | Phase 6 |
| Search Refresh Hook | Phase 5 Typed deferred event；无 PGroonga Index | Phase 10 |
| GitHub Polling in default local Compose | 为防隐式网络访问而 Idle；Disposable Test 用同一 Worker + in-memory source | 明确配置 Repository 后可启用；Phase 15 绑定 Workflow |
| Owner-managed Dataset | 精确 Payload/Auth/Revision Write Boundary 已有；没有 Public View | Phase 6 |
| Fake Deploy Agent | 独立 Identity/Capability Contract，真实 Operation 禁用 | Phase 14 |
| Fake Translation Provider | Deterministic、Cost 0 | Phase 8/9 |
| E2E Placeholder | `NOT_IMPLEMENTED`，不是通过的 Playwright Suite | Phase 6 |
| S3Mock | Local API Integration，不能证明 AList 完整兼容 | Phase 11 |

## 6. 已知实施限制与踩坑

- Host 默认 RPM 工具链仍是 Node.js `24.18.0`、pnpm `11.19.0`；仓库精确要求 `24.19.0` / `11.23.0`。Phase 5 Gate 使用 Codex bundled Node `24.19.0` 与临时精确 pnpm `11.23.0`，不得放宽 Guard。
- PostgreSQL 18 固定 Image Data Volume 目标是 `/var/lib/postgresql`。
- Migration 直连 PostgreSQL；Application/Seed/Worker Query 走 PgBouncer `pool_mode=transaction`。所有 Worker Transaction 使用 `SET LOCAL ROLE site_content_worker`；不得依赖跨 Transaction Session State 或 Named Prepared Statement。
- Database Role 是 NOLOGIN Group Role；Production Login/Member、Credential 注入和 Rotation 属于 Phase 12。
- `owner_managed_datasets.payload` 在 DB 层只接受 JSON Object，外部写边界复用 `src/control-plane/contracts.ts` 的两个精确 Zod Schema 与 CAS Revision；不得扩张为任意 Blob Store，或把 `revision` 重复放入 Payload。
- Drizzle Applied Hash/Timestamp Gate 会拒绝改写已应用 Migration；后续 Schema 变化必须新增 Migration。
- Phase 5 Migration `0002_phase5_job_claiming` 是 Additive，只有 Claim Support Index 被 Superset Index 替换；不得回改 Migration SQL/Metadata。
- GitHub Tree `truncated=true` 或 Blob SHA Drift 必须失败，不能把缺失 Path 当 Delete。Private Token 必须 Read-only，且不得记录。
- Move Continuity 只在 Source Path、相同 Route 或唯一 Hash 能证明时保持；Hash 歧义必须失败等待 Owner，不得发明 Alias/ID。
- `content_aliases` 只允许 7 条 Phase 0 Allowlist；新增任何 Alias 仍需 Owner 单项批准。
- Test Compose 使用随机宿主端口；Container Restart 后必须重新解析 Published Port。
- PgBouncer 会拒绝未允许的 Startup Parameter；Control API 使用 Client-side Query Timeout，不发送 `statement_timeout` Startup Parameter。
- OpenResty 代理 `/api/ops/*` 时隐藏 Upstream `Cache-Control` 再写入单一 `no-store`；Next Upstream 不可用时使用 2 秒 Proxy Timeout。
- Phase 5 验证后 Disposable Compose Project/Volume/Network 已清理；没有执行 Production、GitHub、AList、DNS、付费 AI 或旧站操作。

## 7. Phase 6 开始前 Prerequisite

- Owner 明确授权 Phase 6；本文件本身不是授权。
- Worktree 干净，Phase 0–5 Focused Commit 可见；先报告任何来源不明的改动。
- 阅读 Phase 6 计划、Architecture Overview、Caching、Migration Guide、Acceptance Criteria、Phase 0 Route/Feature/SEO Artifact，以及 Phase 5 Content/Verification Artifact。
- Public Page 只能读取 PostgreSQL Runtime Content；不得绕过 Phase 5 回到 Build-time 文件扫描或 GitHub Hot-path Read。
- 实现 unprefixed zh-CN 与 Locale-prefixed zh-CN App Router、Blog/Wiki/Home/Special Page Vertical Slice、Runtime Markdown Render、Asset Boundary、Health/Ready/Version 和真实 Revalidation Hook。
- 继续保持 `/api/ops/*` 独立于 Next.js；不得提前实现 Phase 7 Locale Conversion、Phase 8 Translation Memory、Phase 10 Search 或 Production Deploy。
- 用 Phase 0 Exact URL/Pinyin/Alias/SEO Fixture 和 Phase 5 Materialized Route 做真实 App Router E2E；E2E Placeholder 必须在本阶段被替换。

当前没有 Phase 6 依赖 Blocker；唯一环境注意项仍是解析精确 Node.js/pnpm 工具链。

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描旧仓库。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有仓库内证据无法回答一个明确、具体的 Legacy 行为时，才定点只读检查并把后续必需事实沉淀回 V2。Phase 18 再按 Gate 从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。
