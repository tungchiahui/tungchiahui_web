# Website V2 Current Implementation State

> Status: Phase 0–2 completed; Phase 3 not started
> Current Phase: Awaiting Owner authorization for Phase 3
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
| 0 — Legacy Discovery | `abd7b7e962a600f1405d5649fae225a46758b168` | `docs/migration/legacy-discovery-baseline.md`、Route/Pinyin Fixture、Risk Register、Traceability、Phase 0 Verification | 可靠通过；Owner Decisions O-001–O-007 已关闭 |
| 1 — Engineering Baseline | `f59d49f425c684e13b87397933d064061bb9c673` | `docs/development/phase-1-engineering-baseline.md` 与 Verification Report | 可靠通过；锁定工具链、CI、Branch Protection、Clean Checkout Gate 已建立 |
| 2 — Hermetic Local Platform | `58ec725f7d5f6b92dad63767a7cc8146446c5c43` | `docs/development/phase-2-hermetic-local-platform.md` 与 Verification Report | 可靠通过；Clean Start/Test/Restart/Reset/Failure Cleanup/Isolation Gate 已验证 |

`implementation-plan.md` 中 Phase 0、1、2 的 Checklist 与 Overall Progress 已完成，Phase 3 保持未开始。任何后续 Agent 不得根据本文件自行越过 Owner 授权 Gate。

## 3. Legacy durable baseline

Phase 0 的行为证据固定在旧 Nuxt Commit `d33e9ee5f90a266207f9f9658a47031eafdb981a`：

- 237 个 Canonical zh-CN Markdown（4 Blog、233 Wiki），18 个 Wiki 根目录；
- Minimal Frontmatter 只有已记录的四种 Shape，Wiki 必须接受 `title`-only；
- Blog 显式 `path` 优先且必须原样保留 `!`、`_` 等字符；Wiki 使用已固定的 Pinyin Algorithm；
- Unprefixed Route 保留为 zh-CN Compatibility Surface；批准的 Locale 只有 `zh-cn`、`zh-hk`、`zh-tw`、`en-us`；`zh-hant` 直接移除且不 Redirect；
- 7 个 Wiki Alias 是显式 Allowlist，不是扩张 Redirect Map 的许可；Pinyin Collision 必须在写入前使整次 Ingestion 失败并等待 Owner 修改 Source；
- `/about`、`/cv`、`/friend`、`/more`、`/mylogo`、Music、Start、公开 Stats/Page Traffic、`tech-footprint`、`weight-loss` 及完整 `/docs/ros2/**` 均按 Owner 决定保留；
- `tech-footprint`/`weight-loss` 的 V2 数据进入 PostgreSQL；自动迁移不可靠时 Owner 允许手工迁移；
- Legacy Page/Article 使用 Locale-aware、Content-derived Title/Description，Blog 还输出 OG Title/Description；没有统一 Canonical/Sitemap/Robots/Twitter/OG Image 契约。V2 可改进 Metadata，但必须保持 Exact Route/Locale 内容身份；
- GitHub 只保存 zh-CN Canonical Markdown；ignored `content/_i18n`、旧 EdgeOne Blob、Nuxt Client Search 和 Static Pages 架构都不是 V2 权威实现。

完整证据与 Fixture：

- `docs/migration/legacy-discovery-baseline.md`
- `docs/migration/legacy-route-and-pinyin-fixtures.md`
- `docs/migration/legacy-risk-register.md`
- `docs/planning/phase-0-traceability.md`

交接审计时旧仓库 HEAD 为 `155c39874fef1d1de4587d1dc5dacb2c42756a38`。从 Phase 0 Evidence Commit 到该 HEAD 的定点 Diff 只涉及 `.nvmrc`、`package.json`、`package-lock.json`，没有 Legacy Content/Route/Feature 变化。

## 4. 当前仓库实际能力

- Next.js 16.3.2 App Router Skeleton；目前只有工程基线页面，不是 Website V2 Vertical Slice。
- Node.js `24.19.0`、pnpm `11.23.0`、严格 TypeScript、Tailwind CSS 4、Base UI-based shadcn/ui、next-intl 四 Locale Skeleton。
- `./site check` 统一执行 Biome、Source Policy、Typecheck、Renovate Validation 和 Production Build。
- `./site test` 执行真实 Unit + Disposable Infrastructure Integration；Migration/E2E 仍诚实报告 `NOT_IMPLEMENTED`。
- `./site dev` 提供 PostgreSQL 18 + PGroonga、PgBouncer、Adobe S3Mock、Next.js Dev、Local `control-api`、Control-state SQLite 和 Fake Deploy Agent。
- `./site dev stop` 保留 Development Data；只有 `./site dev reset --environment local --confirm RESET-LOCAL-DATA` 删除精确显示的 Local Target。
- 每次 Integration Test 使用唯一 Compose Project、动态 Loopback Port、Disposable Volume/Bucket/SQLite Directory，并在成功或失败后清理。
- `main` Branch Protection 在本次交接只读复核时仍严格要求 `quality-gate`，Admin Enforcement 开启，Force Push/Deletion 关闭。

## 5. 当前 Stub/Fake 与替换责任

| Current boundary | 当前真实含义 | Replacement Phase |
| --- | --- | --- |
| Next.js 首页与 UI | 工程 Skeleton，不代表 Legacy 页面已迁移 | Phase 6；Locale UI 在 Phase 7 |
| Migration Hook | 只创建 PGroonga Extension，报告零 Migration，并拒绝提前出现的 `drizzle/*.sql` | Phase 3 必须用真实 Runner、Migration/Seed Gate 原子替换 |
| Migration Test Placeholder | `NOT_IMPLEMENTED`，不是通过的 Migration Suite | Phase 3 |
| E2E Placeholder | `NOT_IMPLEMENTED`，不是通过的 Playwright Critical-flow Suite | Phase 6 |
| Local `control-api` | 仅 Health/只读 Status 与最小 SQLite 初始化；无正式 Auth/Job/Recovery Operation | Phase 4 建立正式边界；Phase 13/14 完成 Recovery/Deployment 能力 |
| Fake Deploy Agent | 只报告 Capability，所有真实 Operation 禁用 | Phase 4 定义 Identity/Capability；Phase 14 接入真实共享 Deployment Engine |
| Fake Translation Provider | Deterministic、Cost 0；Automated Test 默认继续使用 Fake | Phase 8 建 Translation Memory/Fallback；Phase 9 才允许显式、预算受控付费执行 |
| S3Mock | Local API Integration，不能证明 AList 完整兼容 | Phase 11 使用授权的非生产 Bucket 跑 AList Contract Suite |
| `tungchiahui-web-local:phase2` | Local Dev/Test Image，不是 Production Image/Identity | Phase 12/16 建立并验证 Production Container Baseline |

## 6. 已知实施限制与踩坑

- Host 当前 RPM 工具链是 Node.js `24.18.0`、npm `11.16.0`，Codex 默认 pnpm 是 `11.19.0`；仓库精确要求 Node.js `24.19.0`、pnpm `11.23.0`。Phase 1/2 Gate 使用精确锁定版本通过，但新会话在直接运行 `./site` 前必须先确认实际 PATH 满足精确版本。
- PostgreSQL 18 固定 Image 的 Data Volume 目标是 `/var/lib/postgresql`。
- Compose Network 有意不设 `internal: true`；Loopback Host Port、Local Docker Context Guard、受限 Environment 和 Forbidden-target Guard 是当前经过验证的隔离组合。
- Development `web` Service 因 Next.js Dev/`.next` 写入需求不使用 Read-only Root；这不代表 Production Hardening 已完成。
- Phase 3 添加首个 SQL Migration 前，必须同步替换 Phase 2 的零 Migration 拒绝 Hook 和 Migration Placeholder，否则 `./site dev` 会按设计失败。
- Phase 2 验证结束后已执行 Safe Reset；本次交接审计时没有遗留 `tungchiahui_*` Container、Volume 或 Network。需要开发数据时重新运行 `./site dev`。

## 7. Phase 3 开始前 Prerequisite

- Owner 明确授权 Phase 3；本文件本身不是授权。
- Worktree 干净，Phase 0–2 三个 Focused Commit 可见；先报告任何来源不明的改动。
- Node.js/pnpm 与仓库精确版本一致，Docker 使用本机 `unix://` 或 `npipe://` Context。
- 阅读 Phase 3 计划、ADR 0002/0006/0008/0015、`docs/architecture/data-model.md`、`docs/operations/database-migrations.md` 和 Phase 0 Content/Route Fixture。
- Schema 必须表达已批准的 Runtime Content/Translation/Ingestion/Application Job，同时把 ADR 0015 SQLite Recovery State 排除在业务 PostgreSQL Schema 外。
- Alias 只能表达已批准的 7 个 Legacy Alias 或经过 Owner 单项审批的新例外；不得用 Alias 掩盖 Route/Pinyin Drift。
- 不在 Phase 3 实现 Content Fetch、Paid Translation、Search Ranking、Website Feature 或 Deployment Operation。

当前没有 Phase 3 依赖 Blocker；唯一环境注意项是新会话必须解析精确 Node.js/pnpm 工具链。

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描 `/home/tungchiahui/UserFolder/MySource/my-blog`。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有当前仓库无法回答一个明确、具体的 Legacy 行为时，才：

1. 保持旧仓库只读；
2. 定点读取对应文件或 Commit Diff，不运行会生成/格式化文件的命令；
3. 记录所用 Legacy Commit；
4. 如果新事实会影响后续实现，把它沉淀回 V2 文档/Fixture/Test；
5. 无法分类的用户可见行为询问 Owner，不自行删除或决定。

Phase 18 按计划从当时最新 Legacy HEAD 执行最终全量 Delta、Route/Feature/Content Audit。
