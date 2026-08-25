# Website V2 Current Implementation State

> Status: Phase 0–8 completed; Phase 9 not started
> Current Phase: Awaiting Owner authorization for Phase 9
> Handoff audit date: 2026-08-25

本文件是新 Claude Code/Codex 会话的简洁交接入口。它索引当前实际状态和容易遗漏的实施事实，不替代 `AGENTS.md`、Accepted ADR、架构规范或 `implementation-plan.md`。

维护规则：每个 Phase 完成时，Agent 自动复核并沉淀后续实施所需事实；完成沉淀只表示下一 Phase 依赖可供 Owner 评估，不授权 Agent 自动继续。

## 1. 新会话读取顺序

1. `AGENTS.md`、`README.md`、本文件；
2. `docs/planning/implementation-plan.md` 中的 Current Phase；
3. 当前 Phase 引用的 Architecture、Requirement、Migration 文档和 Accepted ADR；
4. 本文件链接的既有 Verification/Fixture，不依赖历史聊天内容。

## 2. 已完成阶段与证据

| Phase | Focused commit | Durable evidence | Gate status |
| --- | --- | --- | --- |
| 0 — Legacy Discovery | `abd7b7e962a600f1405d5649fae225a46758b168` | Legacy Baseline、Route/Pinyin Fixture、Risk Register、Traceability、Verification | PASS；Owner Decisions O-001–O-007 closed |
| 1 — Engineering Baseline | `f59d49f425c684e13b87397933d064061bb9c673` | Phase 1 Baseline 与 Verification | PASS；toolchain/CI/source policy established |
| 2 — Hermetic Local Platform | `58ec725f7d5f6b92dad63767a7cc8146446c5c43` | Phase 2 Platform 与 Verification | PASS；isolated lifecycle/failure cleanup established |
| 3 — Persistence Foundation | `feat(db): complete phase 3 persistence foundation` | Phase 3 Foundation 与 Verification | PASS；schema/migration/role/PgBouncer gates |
| 4 — Independent Control Plane | `feat(ops): complete phase 4 independent control plane` | Phase 4 Control Plane 与 Verification | PASS；auth/replay/SQLite/Next-down/PostgreSQL-down gates |
| 5 — One-way Content Ingestion | `c2b0b07` | Phase 5 Ingestion 与 Verification | PASS；GET-only/idempotency/delta/route/job gates |
| 6 — zh-CN Vertical Slice | `feat(web): complete phase 6 zh-cn vertical slice` | Phase 6 Vertical Slice 与 Verification | PASS；public E2E/Legacy/Markdown/cache/asset/health gates |
| 7 — Deterministic Locales | `feat(i18n): complete phase 7 deterministic locales` | Phase 7 Deterministic Locales 与 Verification | PASS；four-locale UI/routes/OpenCC materialization/fallback gates |
| 8 — Translation Memory | `feat(i18n): complete phase 8 translation memory` | Phase 8 Translation Memory 与 Verification | PASS；segmentation/reuse/pending/stale/mixed fallback/zero-cost gates |

`implementation-plan.md` 中 Phase 0–8 的 Checklist 与 Overall Progress 已完成，Phase 9 保持未开始。任何后续 Agent 不得根据本文件自行越过 Owner 授权 Gate。

## 3. Legacy durable baseline

- Phase 0 权威 Evidence Commit 仍是 `d33e9ee5f90a266207f9f9658a47031eafdb981a`：237 个 Canonical zh-CN Markdown、18 个 Wiki 根目录、4 条显式 Blog Path、Pinyin 契约、7 条 Alias 和 311 条 ROS2 HTML Route。
- Unprefixed Route 与 `/zh-cn/**` 都是 zh-CN Public Surface；批准 Locale 只有 `zh-cn`、`zh-hk`、`zh-tw`、`en-us`。Phase 7 已证明 `zh-hant` 在 Home/Blog/Wiki Sample 均为 404 且不 Redirect；Phase 18 需继续保留该 Negative Contract。
- Phase 6 只做两个具体的 Legacy 定点只读检查：精确 Footer 备案值；确认当前 clean Legacy HEAD 的 ROS2 Archive 自 Phase 0 Commit 未变化。V2 `public/docs/ros2` 与旧目录 byte-identical（958 files / 311 HTML / 85 MiB）。旧仓库未修改。
- Filing 固定为 `鲁ICP备2025185601号-2`、`鲁公网安备37030302001121号`，公安 Record Code `37030302001121`。
- GitHub 只保存 zh-CN Canonical Markdown；PostgreSQL 是 Runtime Materialization，禁止 Production-to-GitHub Write。

完整证据：`docs/migration/legacy-discovery-baseline.md`、`legacy-route-and-pinyin-fixtures.md`、`legacy-risk-register.md`、`docs/planning/phase-0-traceability.md`。

## 4. 当前仓库实际能力

- Next.js 16.3.2 App Router Public Surface：unprefixed + 四个批准 Locale Prefix 的 Home、Blog/Wiki List/Article、10 个 Special Page、Error/404、content-derived Locale Metadata。Server-rendered Switch 保持同一 Logical Route。
- Server-only PostgreSQL DAL 使用 `site_app`，过滤 Soft-delete，按 Locale 读取 zh-HK/zh-TW `document_translations` 并隔离 Next Cache Key；DB 与 Cache 反序列化边界均执行 Zod Validation。Public Request 不读取 GitHub/File Corpus，也不写 DB。
- Runtime Markdown 使用 unified/remark/GFM/rehype、Raw HTML Drop、Sanitizer、Shiki 与 validated link/image metadata；提供 TOC、Unicode Anchor、Reading Time、Previous/Next。区域转换只处理 mdast Text Source Range，保护 Frontmatter、Code Fence、Inline Code、URL、Identifier 与 Link/Image Destination。
- Tailwind CSS 4、Base UI Primitive、blue/light-dark identity、responsive Header/Footer；Theme、Print、Start bookmark/search 是仅有的交互 Client Components。四个等形 next-intl Catalog 已分别交付 zh-CN Source、en-US Semantic UI 与 reviewed zh-HK/zh-TW UI。
- `content-worker` 在 Canonical Ingestion Transaction 内通过 OpenCC + `2026-08-24.1`/revision 1 Glossary 确定性物化 zh-HK/zh-TW。相同 Snapshot 不重写 Hash/`generated_at`，Glossary Revision 可安全触发派生内容重放；不新增 Migration。
- en-US 已使用顶层 mdast Semantic Block、Normalization Version 1、Source Hash 与 AST/受保护值 Context Fingerprint 建立全局 Translation Memory。Document Ordinal/Offset 只用于当前拼装，不是翻译身份；局部修改保留其他块命中。
- `document_translation_segments` 保存 Current Mapping 与可选 Previous Segment；`TranslationMemoryRepository` 提供 validated old zh-CN + old en-US + new zh-CN Targeted Patch Context 和 Pending/Fallback/Translated/Hit Metric。Superseded、无 Current Reference 的 Pending Row 变 Stale；reviewed/translated Row 保持全局可复用。
- en-US `document_translations` 绑定当前 Canonical Source Hash，并物化 reviewed/translated English + 最新 zh-CN Pending Fallback。Public DAL 拒绝 Source Hash 不匹配的旧行，页面按实际内容暴露 `fallback`、`mixed`、`translated` State；zh-HK/zh-TW 继续显示 `converted`。
- Phase 0/5 exact Blog/Pinyin/approved Alias routes 已由真实 App Router E2E 覆盖；没有默认 Redirect Map。
- 完整 frozen ROS2 Archive 位于 `public/docs/ros2`；Biome/Source Policy 只对该精确第三方输出目录豁免，不放宽应用 `.js/.jsx` 禁令。
- Local S3Mock Seed 写入 deterministic SVG；`/api/assets/**` 是 server-only validated read gateway。Production AList Contract 仍未验证。
- Next Cache 无任意 TTL：Article Route Tag、Content-type List Tag 与 Home/List/Article Path 精确失效。HMAC Endpoint 位于 `/api/internal/revalidate`，不属于 Privileged Ops Control Plane。
- Content materialization 后 Hook 失败会把精确 `side_effects` Payload（含 Translation Metric）存入 PostgreSQL Job Progress；Retry 不再次 Fetch/Materialize。Phase 8 Translation Diff/Materialization 已在 Ingestion Transaction 内完成；Search Hook 继续只记录 Phase 10 deferred event。
- `/api/health` 是 liveness；`/api/ready` 检查 PostgreSQL；`/api/version` 输出 validated Git SHA/development stub；均 `no-store`。
- `./site check` 覆盖 Biome、Source Policy、Drizzle、Typecheck、Renovate 与 webpack Production Build。`./site test` 覆盖 18 files / 76 Unit、Disposable Integration（含双区域 Locale + Translation Memory/Backfill/Targeted Patch/重放）、9 个真实 Playwright E2E 和 4-Migration Dedicated Suite。
- Phase 4 Control API/SQLite Recovery 与 Phase 5 GitHub Ingestion/Worker 权限边界均保持不变；`/api/ops/*` 没有进入 Next.js。

## 5. 当前 Stub/Fake 与替换责任

| Current boundary | 当前真实含义 | Replacement Phase |
| --- | --- | --- |
| zh-CN Web/Cache/Revalidation | Phase 6 production-shaped local implementation | completed in Phase 6 |
| Four-locale UI/Route/OpenCC | Phase 7 production-shaped deterministic implementation | completed in Phase 7 |
| en-US block-level Translation Memory/Fallback | Phase 8 production-shaped local implementation | completed in Phase 8 |
| Translation Diff | Phase 8 transactional zero-cost reconcile | completed in Phase 8 |
| Translation Provider/Dry-run/Budget Execution | fake provider only；no implicit or paid call | Phase 9 |
| Search Refresh/Query | deferred event；no PGroonga public search | Phase 10 |
| S3Mock/Public Asset Gateway | local S3 API evidence only | Phase 11 AList non-production contract |
| GitHub polling default | idle to prevent implicit network; explicit repository enables read-only polling | Phase 15 workflow binding |
| Owner Dataset | validated PostgreSQL public read + Phase 4 authorized CAS write | Phase 16 final trust/privacy review |
| Fake Deploy Agent | health/identity only; no production capability | Phase 14 |
| Fake Translation Provider | isolated deterministic cost 0；not imported by Phase 8 sync/public path | Phase 9 |

## 6. 已知限制与踩坑

- Host default Node/pnpm may differ; repository requires exactly Node `24.19.0` and pnpm `11.23.0`. Do not loosen `./site` guard.
- Managed sandbox blocks `tsx` IPC/local HTTP and Turbopack worker ports. Verification used the exact toolchain with allowed local execution. `build` uses `next build --webpack`; this is still the approved Next.js stack.
- Next Cache serializes `Date`; every cached public document is reparsed with coercion before use. Do not bypass this boundary.
- Local Compose must quote the all-zero development SHA. Next dev explicitly allows only loopback `127.0.0.1` for the disposable browser origin.
- Playwright uses one worker because the suite intentionally shares one mutable Disposable PostgreSQL/cache lifecycle, including a mid-run revalidation mutation。
- `content-worker` side-effect replay depends on Hooks being idempotent. Future Translation/Search implementations must preserve exact-input idempotency and must not turn Public requests into paid/provider calls.
- PostgreSQL migrations are now four. `0003_phase8_translation_memory` is additive Expand：新增 Document-Segment Mapping、nullable Current-source Binding 和零默认 Metric；不得重写已应用 SQL/Metadata。
- Existing Runtime DB 在 Phase 7 应用代码发布后需要一次显式 Content Sync 才会回填区域物化；回填前 Server Renderer 使用相同确定性 Converter 作为只读 View。Public Request 绝不触发 Backfill。
- Phase 8 Migration 不在 Migration-time 猜测/回填旧 English。现有 en-US Row 的 `source_hash` 为 NULL 时 Public DAL 忽略；应用 Phase 8 后必须显式 Content Sync 才会建立 Segment Mapping、Pending 和 Current Mixed Materialization。zh-CN 发布不等待该 Backfill，Public Request 也不写 DB。
- Normalization Version 当前固定为 1。任何改变 Identity/Normalization 的实现必须显式提升版本、提供安全重放/迁移计划，并更新稳定身份与重复 Block Fixture。
- Glossary 任何会改变输出的编辑必须同时提升 `version` 与正整数 `revision`，并更新代表性 Unit/Integration Evidence。
- S3Mock cannot prove AList metadata, ETag, Unicode-key and overwrite compatibility; Phase 11 must run the designated non-production contract before Production Infrastructure.
- Static ROS2 files are frozen third-party generated output. Do not run formatters or source analyzers inside that exact directory; Phase 18 refreshes/diffs from the then-current Legacy HEAD.
- No Production, GitHub write, AList, DNS, paid AI, deploy, backup/restore or old-repository mutation occurred through Phase 8。Phase 8 完全依赖仓库内既有 Fixture，没有重新扫描或定点读取旧仓库。

## 7. Phase 9 开始前 Prerequisite

- Owner must explicitly authorize Phase 9; this handoff is not authorization.
- Start from a clean worktree with the focused Phase 8 commit visible; report unknown changes before editing.
- Read Phase 9 plan plus Translation Operations、Control Plane/Jobs、Internationalization/Data Model/Content Pipeline、Security、Testing Strategy、ADR 0010/0013 and Phase 8 implementation/verification reports.
- Preserve Phase 8 Segment Identity、AST/protected validator、Current-source Binding、Mapping ancestry、Pending/Stale/Reviewed State、Mixed Fallback 和 zero-cost sync/public contracts。
- Provider Request/Response 必须 Zod Validation；Automated Test 默认只使用 Fake/No-cost Provider。未获 Owner 明确付费授权，不得执行真实 Provider Contract/Execute。
- Dry-run 必须零次 Paid Call；每个实际 Request 前由 Server-side `content-worker` 强制 Budget，并保留 Partial/Retry/Audit。CLI、Control API 与 Manual Workflow 必须创建同一 PostgreSQL-backed Job，不得回写 GitHub。
- 不得把 Phase 8 的 Block-level Pipeline 退化为 Whole-document Retranslation，也不得把 AI Credential 给 GitHub Actions、Next.js、Developer Machine 或 `deploy-agent`。

Phase 9 has no dependency blocker. Phase 8 leaves a validated zero-cost data foundation and isolated Fake Provider without granting permission to begin paid execution work.

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描旧仓库。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有仓库内证据无法回答一个明确、具体的 Legacy 行为时，才定点只读检查并把后续必需事实沉淀回 V2。Phase 18 再按 Gate 从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。
