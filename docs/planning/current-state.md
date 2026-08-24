# Website V2 Current Implementation State

> Status: Phase 0–7 completed; Phase 8 not started
> Current Phase: Awaiting Owner authorization for Phase 8
> Handoff audit date: 2026-08-24

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

`implementation-plan.md` 中 Phase 0–7 的 Checklist 与 Overall Progress 已完成，Phase 8 保持未开始。任何后续 Agent 不得根据本文件自行越过 Owner 授权 Gate。

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
- en-US Phase 7 Contract 是完整最新 zh-CN Fallback：Public DAL 有意忽略已有 en-US Materialization，页面显示 `fallback` State，且不导入或调用 AI Provider。zh-HK/zh-TW 显示 `converted` State，均有 Data Attribute Observability Hook。
- Phase 0/5 exact Blog/Pinyin/approved Alias routes 已由真实 App Router E2E 覆盖；没有默认 Redirect Map。
- 完整 frozen ROS2 Archive 位于 `public/docs/ros2`；Biome/Source Policy 只对该精确第三方输出目录豁免，不放宽应用 `.js/.jsx` 禁令。
- Local S3Mock Seed 写入 deterministic SVG；`/api/assets/**` 是 server-only validated read gateway。Production AList Contract 仍未验证。
- Next Cache 无任意 TTL：Article Route Tag、Content-type List Tag 与 Home/List/Article Path 精确失效。HMAC Endpoint 位于 `/api/internal/revalidate`，不属于 Privileged Ops Control Plane。
- Content materialization 后 Hook 失败会把精确 `side_effects` Payload 存入 PostgreSQL Job Progress；Retry 不再次 Fetch/Materialize。Translation/Search Hook 仍只记录 Phase 8/10 deferred event。
- `/api/health` 是 liveness；`/api/ready` 检查 PostgreSQL；`/api/version` 输出 validated Git SHA/development stub；均 `no-store`。
- `./site check` 覆盖 Biome、Source Policy、Drizzle、Typecheck、Renovate 与 webpack Production Build。`./site test` 覆盖 72 Unit、Disposable Integration（含双 Locale PostgreSQL 物化/保护语法/幂等重放）、9 个真实 Playwright E2E 和 3-Migration Dedicated Suite。
- Phase 4 Control API/SQLite Recovery 与 Phase 5 GitHub Ingestion/Worker 权限边界均保持不变；`/api/ops/*` 没有进入 Next.js。

## 5. 当前 Stub/Fake 与替换责任

| Current boundary | 当前真实含义 | Replacement Phase |
| --- | --- | --- |
| zh-CN Web/Cache/Revalidation | Phase 6 production-shaped local implementation | completed in Phase 6 |
| Four-locale UI/Route/OpenCC | Phase 7 production-shaped deterministic implementation | completed in Phase 7 |
| en-US full-document zh-CN fallback | safe baseline；deliberately ignores existing English rows | Phase 8 block-level Translation Memory |
| Translation Diff/Execution | zero-cost deferred event；no provider call | Phase 8/9 |
| Search Refresh/Query | deferred event；no PGroonga public search | Phase 10 |
| S3Mock/Public Asset Gateway | local S3 API evidence only | Phase 11 AList non-production contract |
| GitHub polling default | idle to prevent implicit network; explicit repository enables read-only polling | Phase 15 workflow binding |
| Owner Dataset | validated PostgreSQL public read + Phase 4 authorized CAS write | Phase 16 final trust/privacy review |
| Fake Deploy Agent | health/identity only; no production capability | Phase 14 |
| Fake Translation Provider | deterministic cost 0 | Phase 8/9 |

## 6. 已知限制与踩坑

- Host default Node/pnpm may differ; repository requires exactly Node `24.19.0` and pnpm `11.23.0`. Do not loosen `./site` guard.
- Managed sandbox blocks `tsx` IPC/local HTTP and Turbopack worker ports. Verification used the exact toolchain with allowed local execution. `build` uses `next build --webpack`; this is still the approved Next.js stack.
- Next Cache serializes `Date`; every cached public document is reparsed with coercion before use. Do not bypass this boundary.
- Local Compose must quote the all-zero development SHA. Next dev explicitly allows only loopback `127.0.0.1` for the disposable browser origin.
- Playwright uses one worker because the suite intentionally shares one mutable Disposable PostgreSQL/cache lifecycle, including a mid-run revalidation mutation。
- `content-worker` side-effect replay depends on Hooks being idempotent. Future Translation/Search implementations must preserve exact-input idempotency and must not turn Public requests into paid/provider calls.
- PostgreSQL migrations remain at three; Phase 7 reuses the existing `document_translations` table and adds no schema. New schema work must create a new Expand migration and never rewrite applied SQL/metadata.
- Existing Runtime DB 在 Phase 7 应用代码发布后需要一次显式 Content Sync 才会回填区域物化；回填前 Server Renderer 使用相同确定性 Converter 作为只读 View。Public Request 绝不触发 Backfill。
- Glossary 任何会改变输出的编辑必须同时提升 `version` 与正整数 `revision`，并更新代表性 Unit/Integration Evidence。
- S3Mock cannot prove AList metadata, ETag, Unicode-key and overwrite compatibility; Phase 11 must run the designated non-production contract before Production Infrastructure.
- Static ROS2 files are frozen third-party generated output. Do not run formatters or source analyzers inside that exact directory; Phase 18 refreshes/diffs from the then-current Legacy HEAD.
- No Production, GitHub write, AList, DNS, paid AI, deploy, backup/restore or old-repository mutation occurred through Phase 7。Phase 7 完全依赖仓库内 Phase 0 Fixture，没有重新扫描或定点读取旧仓库。

## 7. Phase 8 开始前 Prerequisite

- Owner must explicitly authorize Phase 8; this handoff is not authorization.
- Start from a clean worktree with the focused Phase 7 commit visible; report unknown changes before editing.
- Read Phase 8 plan plus Internationalization/Data Model/Content Pipeline Architecture, Translation Operations, project requirements/acceptance criteria, ADR 0002/0006/0010/0012/0013 and Phase 7 implementation/verification reports.
- Preserve Phase 7 route, catalog, `contentLocaleState`, versioned glossary, protected Markdown and deterministic regional materialization contracts.
- Replace the en-US whole-document fallback only through Semantic-block Segmentation, Source/Context Hash, Translation Memory and mixed current-zh-CN Fallback. Existing Phase 3 en-US Seed is not evidence that this behavior exists.
- Phase 8 remains zero-cost: no public request, content push, sync, build or implicit job may call a paid provider. Provider execution and budget enforcement remain Phase 9.
- Define safe Backfill/Migration for current rows, keep GitHub -> PostgreSQL one-way direction, and preserve content-worker/deploy-agent privilege separation.

Phase 8 has no dependency blocker. Phase 7 leaves explicit deferred hooks and a safe en-US fallback baseline without granting permission to begin it.

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描旧仓库。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有仓库内证据无法回答一个明确、具体的 Legacy 行为时，才定点只读检查并把后续必需事实沉淀回 V2。Phase 18 再按 Gate 从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。
