# Website V2 Current Implementation State

> Status: Phase 0–3 completed; Phase 4 not started
> Current Phase: Awaiting Owner authorization for Phase 4
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

`implementation-plan.md` 中 Phase 0–3 的 Checklist 与 Overall Progress 已完成，Phase 4 保持未开始。任何后续 Agent 不得根据本文件自行越过 Owner 授权 Gate。

## 3. Legacy durable baseline

Phase 0 行为证据固定在旧 Nuxt Commit `d33e9ee5f90a266207f9f9658a47031eafdb981a`：

- 237 个 Canonical zh-CN Markdown（4 Blog、233 Wiki），18 个 Wiki 根目录；
- Minimal Frontmatter 只有四种已记录 Shape，Wiki 必须接受 `title`-only；
- Blog 显式 `path` 优先；Wiki 使用已固定的 Pinyin Algorithm；Collision 在写入前使整次 Ingestion 失败；
- Unprefixed Route 保留为 zh-CN Compatibility Surface；批准 Locale 只有 `zh-cn`、`zh-hk`、`zh-tw`、`en-us`；`zh-hant` 移除且不 Redirect；
- 7 个 Wiki Alias 是显式 Allowlist；Phase 3 Seed 没有提前写入 Alias；
- `/about`、`/cv`、`/friend`、`/more`、`/mylogo`、Music、Start、公开 Stats/Page Traffic、`tech-footprint`、`weight-loss` 和完整 `/docs/ros2/**` 均按 Owner 决定保留；
- `tech-footprint`/`weight-loss` 的 PostgreSQL Authority 已在 Phase 3 建立，具体 API Payload/Auth Boundary 留给 Phase 4；
- GitHub 仍只保存 zh-CN Canonical Markdown；Runtime PostgreSQL 不能反向成为 GitHub Authoring Source。

完整证据：`docs/migration/legacy-discovery-baseline.md`、`legacy-route-and-pinyin-fixtures.md`、`legacy-risk-register.md`、`docs/planning/phase-0-traceability.md`。

## 4. 当前仓库实际能力

- Next.js 16.3.2 App Router Skeleton；目前仍不是 Website V2 Vertical Slice。
- Node.js `24.19.0`、pnpm `11.23.0`、严格 TypeScript、Tailwind CSS 4、Base UI-based shadcn/ui、next-intl 四 Locale Skeleton。
- `./site check` 执行 Biome、Source Policy、Drizzle Migration Consistency、Typecheck、Renovate Validation 和 Production Build。
- `./site test` 执行真实 Unit、Disposable Infrastructure Integration 和 Dedicated PostgreSQL Migration Suite；只有 Phase 6 E2E 仍诚实报告 `NOT_IMPLEMENTED`。
- PostgreSQL `app` Schema 有 8 个 Table，覆盖 Document、Translation、Segment、Application/Translation Job、Ingestion、Approved Alias 与 Owner-managed Dataset。
- 两个 Checked-in Expand Migration 由 Policy/Advisory Lock/Applied Hash Gate 执行；PGroonga 只 Bootstrap Extension，Phase 10 才增加 Search Index。
- `site_app`、`site_migrator`、`site_content_worker`、`site_backup`、`site_replication` NOLOGIN Group Role 与 Grant Boundary 已建立并测试。
- `./site dev` 对 PostgreSQL 直接 Migrate，再经 transaction-mode PgBouncer 使用 Content-worker Role 应用 Deterministic/Idempotent Seed。
- PostgreSQL Application Job Enum 不包含 Deploy/Rollback/Restore/Recovery；这些 Operation 继续严格属于 ADR 0015 SQLite Boundary。
- Local `control-api`、Fake Deploy Agent、Fake Translation Provider 与 S3Mock 仍保持 Phase 2 的隔离能力。

## 5. 当前 Stub/Fake 与替换责任

| Current boundary | 当前真实含义 | Replacement Phase |
| --- | --- | --- |
| PostgreSQL Repository | 只有 Typed Client、Migration、Seed 与 Gate；没有 Content Fetch/Job Claim API | Phase 4 建 Application Job Repository；Phase 5 建 Content Repository/Ingestion |
| Owner-managed Dataset | 只限制批准 Key、JSON Object、Revision/Actor；没有具体 Payload/Auth API | Phase 4 定义 Trust Boundary；Phase 6 交付 Public View |
| `content_aliases` | Schema 已有 approval reference，Seed 为空 | Phase 5 只写入 7 个批准 Legacy Alias 并关联真实 Document |
| PGroonga | Extension 已启用，无 Search Index/Ranking | Phase 10 |
| Migration Policy | Runner 已强制 Metadata/Backup/Contract Gate；尚未接 Deployment SQLite Operation | Phase 14 接 Shared Deployment Engine |
| Local `control-api` | 仅 Health/只读 Status 与最小 SQLite 初始化；无正式 Auth/Job/Recovery Operation | Phase 4；Phase 13/14 完成 Recovery/Deployment |
| Fake Deploy Agent | 只报告 Capability，真实 Operation 禁用 | Phase 4 定义 Identity/Capability；Phase 14 接真实 Engine |
| Fake Translation Provider | Deterministic、Cost 0 | Phase 8 建 Memory/Fallback；Phase 9 才允许显式预算付费执行 |
| E2E Placeholder | `NOT_IMPLEMENTED`，不是通过的 Playwright Suite | Phase 6 |
| S3Mock | Local API Integration，不能证明 AList 完整兼容 | Phase 11 |

## 6. 已知实施限制与踩坑

- Host 默认 RPM 工具链仍是 Node.js `24.18.0`、pnpm `11.19.0`；仓库精确要求 `24.19.0` / `11.23.0`。Phase 3 Gate 使用 Codex bundled Node `24.19.0` 与临时精确 pnpm `11.23.0`，不得放宽 Guard。
- PostgreSQL 18 固定 Image Data Volume 目标是 `/var/lib/postgresql`。
- Migration 直连 PostgreSQL；Application/Seed Query 走 PgBouncer `pool_mode=transaction`。不得在 pooled query 依赖跨 Transaction Session State 或 Named Prepared Statement。
- Database Role 是 NOLOGIN Group Role；Production Login/Member、Credential 注入和 Rotation 属于 Phase 12，不得把 Local Dummy Credential 复制到生产。
- `owner_managed_datasets.payload` 在 DB 层只接受 JSON Object；Phase 4 必须在外部写边界增加每个 Dataset 的精确 Zod Schema，不能把它扩张为任意 Blob Store。
- Drizzle Applied Hash/Timestamp Gate 会拒绝改写已应用 Migration；Schema 改动必须新增 Migration。
- Phase 3 验证后 Disposable Compose Project/Volume/Network 已清理；没有执行 Production、AList、GitHub OIDC、DNS 或旧站操作。

## 7. Phase 4 开始前 Prerequisite

- Owner 明确授权 Phase 4；本文件本身不是授权。
- Worktree 干净，Phase 0–3 Focused Commit 可见；先报告任何来源不明的改动。
- 阅读 Phase 4 计划、ADR 0011/0013/0014/0015、Control Plane and Jobs、Security，以及 Phase 3 Persistence/Verification Artifact。
- 复用 `operational_jobs` 作为 Content/Translation/Search Application Job；不得为这些 Job 使用 SQLite。
- SQLite 仅实现 Deploy/Rollback/Restore/Recovery 必要 Operation，并保持 PostgreSQL-down 可用。
- `/api/ops/*` 必须继续属于独立 `control-api`，不得在 Next.js Route Handler 建正式 Privileged Control Plane。
- Phase 4 可以建立 Repository/Auth/Replay/Idempotency/SQLite State Machine，但不执行真实 Content Sync、AI、Docker Deployment、OpenResty Cutover 或 PostgreSQL Restore。

当前没有 Phase 4 依赖 Blocker；唯一环境注意项仍是解析精确 Node.js/pnpm 工具链。

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描旧仓库。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有仓库内证据无法回答一个明确、具体的 Legacy 行为时，才定点只读检查并把后续必需事实沉淀回 V2。Phase 18 再按 Gate 从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。
