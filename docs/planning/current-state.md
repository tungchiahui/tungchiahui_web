# Website V2 Current Implementation State

> Status: Phase 0–18 completed
> Current Phase: Website V2 Production Completion
> Handoff audit date: 2026-09-13

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
| 9 — Budgeted Translation | `feat(translation): complete phase 9 budgeted execution` | Phase 9 Budgeted Translation 与 Verification | PASS；explicit/dry-run/budget/partial/retry/authz/directionality gates |
| 10 — PostgreSQL + PGroonga Search | `feat(search): complete phase 10 pgroonga search` | Phase 10 Search 与 Verification | PASS；relevance/locale/migration/reindex/cache/client-corpus gates |
| 11 — S3-compatible Asset Contract | `test(storage): complete phase 11 s3 contract` | Generic S3 Adapter、Policy、S3Mock/AList Contract 与 Verification | PASS；8-case AList `TEST` Bucket/CDN evidence and cleanup complete |
| 12 — Production Foundation | `feat(infra): complete phase 12 production foundation` | Ansible、Hardened Compose、OpenResty、DB Login Boundary 与 Verification；原 SOPS/age Secret Path 已由 ADR 0022 Supersede | PASS；idempotent provision、IPv4/IPv6、Next/PostgreSQL-down control route、privilege separation |
| 13 — Tested Recovery | `feat(recovery): complete phase 13 tested recovery` | pgBackRest、WAL/PITR、Remote 副本、Control-state、PG-independent/Break-glass Recovery 与 Verification | PASS；disposable restore/PITR、S3、PG-down、SQLite continuity gates；Phase 18 ADR 0018 恢复双副本 Policy |
| 14 — Shared Blue-Green Deployment | `feat(deploy): complete phase 14 blue-green engine` | Shared Engine、SQLite V5、Migration/Smoke、Atomic OpenResty、Rollback 与 Verification | PASS；Production-like blue-green/failure/crash/PG-down/no-rebuild rollback gates |
| 15 — GitHub OIDC Deployment Automation | `feat(ci): complete phase 15 oidc deployment automation` | Quality/Deploy/Content/Translation Workflows、OIDC Policy、Registry Digest Pull 与 Verification | PASS；workflow boundary、claims、supply-chain、concurrency、Production-like shared-engine gates |
| 16 — Observability、Security、Production Readiness | `feat(ops): complete phase 16 production readiness` | Structured Telemetry、Read-only Observability Agent、Security/Rotation/Runbook、Gap 与 Verification Report | PASS；alert lifecycle、failure diagnosis、load、secret/SBOM/Critical scan、full regression gates |
| 17 — Planned PostgreSQL / Server Migration Readiness | `feat(ops): complete phase 17 migration readiness` | Shared Migration Engine、Same-major Physical Streaming、Control-state Transfer、AAAA-only Cutover、Runbook 与 Verification | PASS；idempotent target provision、final WAL、controlled promotion、no-data-loss、safe abort/non-writing rollback gates |
| 18 — Final Legacy Audit、Production Cutover 与 Rollback Window | `release(v2): complete phase 18 production cutover` | Final Legacy Delta、Compatibility Audit、Production Backup/Restore/Cutover/Stabilization、Completion Report | PASS；Owner 于 2026-09-12 接受最终报告并关闭旧 Nuxt Rollback Window |

`implementation-plan.md` 中 Phase 0–18 的 Checklist、Acceptance Criteria、Exit Gate 与 Overall Progress
均已完成。Website V2 已在 Production 承载 `www.tungchiahui.cn`；旧 Nuxt Repository 始终保持只读，
Owner 于 2026-09-12 接受最终 Compatibility/Operations Report 并关闭旧 Nuxt Rollback Window。V2 的
立即上一版本绿色槽位继续作为正常 Blue/Green Rollback Target 保留。

## 3. Legacy durable baseline

- Phase 0 权威 Evidence Commit 仍是 `d33e9ee5f90a266207f9f9658a47031eafdb981a`：237 个 Canonical zh-CN Markdown、18 个 Wiki 根目录、4 条显式 Blog Path、Pinyin 契约、7 条 Alias 和 311 条 ROS2 HTML Route。
- Unprefixed Route 与 `/zh-cn/**` 都是 zh-CN Public Surface；批准 Locale 只有 `zh-cn`、`zh-hk`、`zh-tw`、`en-us`。Phase 7 已证明 `zh-hant` 在 Home/Blog/Wiki Sample 均为 404 且不 Redirect；Phase 18 需继续保留该 Negative Contract。
- Phase 6 只做两个具体的 Legacy 定点只读检查：精确 Footer 备案值；确认当前 clean Legacy HEAD 的 ROS2 Archive 自 Phase 0 Commit 未变化。V2 `public/docs/ros2` 与旧目录 byte-identical（958 files / 311 HTML / 85 MiB）。旧仓库未修改。
- Filing 固定为 `鲁ICP备2025185601号-2`、`鲁公网安备37030302001121号`，公安 Record Code `37030302001121`。
- GitHub 只保存 zh-CN Canonical Markdown；PostgreSQL 是 Runtime Materialization，禁止 Production-to-GitHub Write。

完整证据：`docs/migration/legacy-discovery-baseline.md`、`legacy-route-and-pinyin-fixtures.md`、`legacy-risk-register.md`、`docs/planning/phase-0-traceability.md`。

## 4. 当前仓库实际能力

- Next.js 16.3.3 App Router Public Surface：unprefixed + 四个批准 Locale Prefix 的 Home、Blog/Wiki List/Article、10 个 Special Page、Error/404、content-derived Locale Metadata。Server-rendered Switch 保持同一 Logical Route。
- Server-only PostgreSQL DAL 使用 `site_app`，过滤 Soft-delete，按 Locale 读取 zh-HK/zh-TW `document_translations` 并隔离 Next Cache Key；DB 与 Cache 反序列化边界均执行 Zod Validation。Public Request 不读取 GitHub/File Corpus，也不写 DB。
- Runtime Markdown 使用 unified/remark/GFM/rehype、Raw HTML Drop、Sanitizer、Shiki 与 validated link/image metadata；提供 TOC、Unicode Anchor、Reading Time、Previous/Next。区域转换只处理 mdast Text Source Range，保护 Frontmatter、Code Fence、Inline Code、URL、Identifier 与 Link/Image Destination。
- Tailwind CSS 4、Base UI Primitive、blue/light-dark identity、responsive Header/Footer；Theme、Print 与 Start bookmark/search 是仅有的交互 Client Components。四个等形 next-intl Catalog 已分别交付 zh-CN Source、en-US Semantic UI 与 reviewed zh-HK/zh-TW UI；Phase 10 Search Form/Result 文案也已进入全部 Catalog。
- `content-worker` 在 Canonical Ingestion Transaction 内通过 OpenCC + `2026-08-24.1`/revision 1 Glossary 确定性物化 zh-HK/zh-TW。相同 Snapshot 不重写 Hash/`generated_at`，Glossary Revision 可安全触发派生内容重放；不新增 Migration。
- en-US 已使用顶层 mdast Semantic Block、Normalization Version 1、Source Hash 与 AST/受保护值 Context Fingerprint 建立全局 Translation Memory。Document Ordinal/Offset 只用于当前拼装，不是翻译身份；局部修改保留其他块命中。
- `document_translation_segments` 保存 Current Mapping 与可选 Previous Segment；`TranslationMemoryRepository` 提供 validated old zh-CN + old en-US + new zh-CN Targeted Patch Context 和 Pending/Fallback/Translated/Hit Metric。Superseded、无 Current Reference 的 Pending Row 变 Stale；reviewed/translated Row 保持全局可复用。
- en-US `document_translations` 绑定当前 Canonical Source Hash，并物化 reviewed/translated English + 最新 zh-CN Pending Fallback。Public DAL 拒绝 Source Hash 不匹配的旧行，页面按实际内容暴露 `fallback`、`mixed`、`translated` State；zh-HK/zh-TW 继续显示 `converted`。
- Phase 0/5 exact Blog/Pinyin/approved Alias routes 已由真实 App Router E2E 覆盖；没有默认 Redirect Map。
- 完整 frozen ROS2 Archive 位于 `public/docs/ros2`；Biome/Source Policy 只对该精确第三方输出目录豁免，不放宽应用 `.js/.jsx` 禁令。
- Local S3Mock Seed 写入 deterministic SVG；`/api/assets/**` 现在复用 server-only Generic S3 Adapter。共享 Contract 在 S3Mock 与 Owner 指定的 AList `TEST` Bucket/CDN 均通过并完成清理；通用 External CLI、Credential Split、Cache/CDN/Object-key Policy 和 Canonical-content-to-S3 Source Policy 已实现。
- Next Cache 无任意 TTL：Article Route Tag、Content-type List Tag 与 Home/List/Article Path 精确失效。HMAC Endpoint 位于 `/api/internal/revalidate`，不属于 Privileged Ops Control Plane。
- Content materialization 后 Hook 失败会把精确 `side_effects` Payload（含 Translation Metric）存入 PostgreSQL Job Progress；Retry 不再次 Fetch/Materialize。Phase 8 Translation Diff/Materialization 已在 Ingestion Transaction 内完成；Phase 10 Search Hook 只按受影响 Document/Locale 刷新 Projection，并保持同一 Durable Retry Contract。
- Phase 9 Translation Job 使用配对的 PostgreSQL `operational_jobs`/`translation_jobs`：Control API 提供 create/read/list/cancel，`content-worker` Claim/Lease/Retry 并逐 Current Semantic Block 执行；没有进入 Control-state SQLite。
- Provider Request/Estimate/Response/Usage 全部 Runtime Validation；Local/Test 固定 Fake Provider。四种 Scope、Force/Execute Confirmation、Dry-run Estimate、逐请求 Server Budget、Partial、Cancellation、Token/Cost/Provider/Model Audit 均已实现。
- Segment Translation 与受影响 Document 的 en-US 重物化在同一 Transaction；精确 Revalidation Intent 先进入 Durable Progress。Provider 或 Revalidation Failure 可恢复，且不重复已持久化的 Provider Request。
- `./site translate`、`/api/ops/translations` 与 Manual `translation.yml` 复用同一 Job Contract。Workflow 使用 Translation-only GitHub OIDC Capability，不获得 DB/AI/Host Credential；CLI 默认稳定 Public Domain，不保存数字公网 IP。
- `app.search_documents` 为四 Locale 可重建 Runtime Projection；PGroonga 多列 Index 覆盖 Title/Heading/Body/Metadata，严格 Locale Filter，Exact Title Boost 与 Field Weight 有确定 Fixture。en-US 只索引 Current-source Materialization，否则索引当前 zh-CN Fallback。
- `/search`、Locale-prefixed Search Page 与 `GET /api/search` 完全 Server-side；Public Result 只含 Title/Locale/Route/Content Type/Snippet/Matched Context/Score，API 与 Edge/OpenResty 使用 `no-store`，Browser Bundle 不包含 Content Corpus。
- Content/Translation Update 精确刷新受影响 Projection 与 Locale Search Tag；Full Reindex 使用 PostgreSQL `search_reindex` Job、`content-worker` Claim/Lease/Retry 与 Per-locale Transaction Lock。Next Search Cache Key 为 normalized Query/Locale/Limit、无任意 TTL。
- `/api/health` 是 liveness；`/api/ready` 检查 PostgreSQL；`/api/version` 输出 validated Git SHA/development stub；均 `no-store`。
- Phase 12 新增 digest/Git-SHA-pinned Production Image、Next Standalone Runtime、Ansible Inventory/Role/Playbook、Hardened Compose 和 dual-stack OpenResty；原 SOPS + age Secret Injection 是历史交付形态，当前生产 Secret Source 已由 ADR 0022 改为部署根目录单一 Host-local 明文 `.env`。Production-like Gate 在临时 Host Root 上两次 Provision，第二次 `changed=0`；实际容器证明 Non-root、Readonly Root、Drop-all Capability、Socket/Network Separation 和无 Secret Layer。
- OpenResty 在 Active Slot 选择前将 `/api/ops/*` 直接送入独立 `control-api` 并强制 `no-store`；IPv4/IPv6 使用同一配置，两个 Next Slot 全停或 PostgreSQL 停止时仍返回控制面的预期认证响应。Inventory 只保存 Owner 已有的 `Debian` SSH Alias，内部只使用 Docker Service DNS。
- Production 数据库使用不同 `*_login` 身份，经 Hardened One-shot Bootstrap 绑定到 `site_app`、`site_control_api`、`site_content_worker`、`site_migrator` NOLOGIN Group Role；Runtime Service 不共享 PostgreSQL Bootstrap Identity。
- Control-state SQLite 已 Additive 升级到 Version 7：Version 5 保留 Backup/Deployment 状态，Version 6 新增 Provider-neutral `offsite_replica_status`；Version 7 会把升级前仅实际写入 R2 的历史记录标记为 Primary `pending` 且 `valid=false`，防止它们被新双副本策略误判。既有 `primary_replica_status` 与 `offsite_replica_status` 现由 ADR 0018 共同记录双副本状态。一致 Snapshot 执行 WAL Checkpoint + `VACUUM INTO`，记录 Integrity/Schema/Environment/Active-Previous SHA/Audit Digest，经 age 加密后复制到 AList Primary 与 R2 Off-site，并可验证/原子恢复。
- pgBackRest 2.59.1 固定在 PostgreSQL/Recovery Image；Production Policy 为 encrypted Local Repository、Full/Differential/Incremental、WAL/PITR、2 Full/4 Differential/2 Full-range WAL Retention。Phase 11 Evidence 不足以证明 Direct AList Repository，因此 Phase 13 采用逐文件/符号链接 SHA-256 Manifest 的 Local Repository + Verified Sync。
- ADR 0018 是当前 Recovery 权威决策：`ASSET_S3_*` 与 `BACKUP_S3_*` 指向同一 AList Bucket/Pair，Recovery Artifact 固定在根目录 `backups/`；`BACKUP_OFFSITE_S3_*` 指向 R2 整桶副本。只有本地 pgBackRest/WAL 与双端完整读回均通过才把 Backup 标记 `valid=true`；Restore 优先 AList 并在失败时回退 R2。
- `./site backup --environment ... --type ... --reason ...`、`backup status` 与 `restore <id-or-time> --environment ... --confirm ... --reason ...` 使用独立 Control API/SQLite；PostgreSQL Down 时仍可 Create/Query/Claim。Control API Down 时显式 stable-inventory SSH Break-glass 仍写入同一 SQLite/Audit 并由同一 Agent/Lease/Engine 执行。
- Phase 14 在既有 `deploy-agent` 内加入独立过滤的 Deploy/Rollback Claim 与唯一 Shared Engine；Recovery/Restore Claim 保持原边界。Engine 只接受完整 Git SHA + 固定 Digest，逐次校验实际流量 Release 必须匹配 Durable Current 或完整 Pending Intent，拒绝重复部署 Active Release，并执行 Inactive Lifecycle、least-privilege Migration、完整 Pre/Post Smoke、OpenResty Validate/Atomic Rename/HUP 与 no-rebuild Rollback。
- `./site deploy/rollback/status` 和 `/api/ops/deployments|rollbacks|status` 复用同一 SQLite Operation、Capability、Idempotency 与 Engine。Deploy/Rollback 并发互斥但不消耗 Recovery Queue；PostgreSQL Down 时仍可创建/查询/Claim，并在 Migration Dependency 明确失败且保持 Active Slot。
- Production Compose 分离 Blue/Green Image/SHA，加入停止的一次性 `database-migrate` Runner、Deployment-probe Internal Network 和 deployment-owned Dynamic Config Directory。只有 `deploy-agent` 有 Docker/Config Mutation Capability；OpenResty Read-only 观察原子 Rename，其他 Service 仍无 Socket。
- Production Migration Runner 使用 `site_migrator_login`、Advisory Lock、Drizzle Hash/Journal、Expand-only Policy 与 Fresh Off-site Backup Evidence；不持有 Admin Role-bootstrap/Extension Capability。每次成功切流后保留立即上一版本用于无重建回滚；ADR 0020 已取消固定时长发布拦截。
- ADR 0022 后 Web Repository 的默认发布路径为单一 `release.yml`：只在 `main` Push 或显式 `workflow_dispatch` 触发，先跑完整 Quality Gate，再 Build/Publish 四个 Git-SHA-tagged Immutable Image，并在 `PRODUCTION_DEPLOYMENT_ENABLED=true` 时由受保护 `production` Environment、单一 non-cancelling Concurrency Group 和 GitHub OIDC 调用 `./site deploy ... --wait`。不再维护独立 `quality.yml` + `deploy.yml` 的双 Action 链。
- Control API OIDC 配置现为严格 Policy Array：Deployment、Manual Translation 与 canonical Content + reviewed reusable `job_workflow_ref` 各有独立 Claims/Capability。Workflow 没有 Production DB、AI、Host Login/Root、Origin Registry Pull 或 Docker Socket Credential；所有第三方 Action 固定完整 Commit Digest。
- `deploy-agent` 可从唯一 Approved Registry 按 Manifest Digest 受控 Pull，并验证精确 `RepoDigest` 与 OCI Git Revision；Candidate 单独记录 Manifest Digest，不再与 Docker Local Config ID 混淆。Rollback 只验证已运行 Retained Container，不 Pull/Build。
- `content-sync.yml` 只能被 reusable `workflow_call` 调用，验证完整 Canonical Source Commit 后通过 `./site content sync` 创建 PostgreSQL Job；不 Build/Deploy/Translate。`translation.yml` 保持 typed manual-only OIDC Job Trigger。
- Phase 16 统一 TypeScript JSON Telemetry Envelope、Request ID、错误/敏感字段 Redaction 与 OpenResty 安全 JSON Access Log；日志不包含 Query、Client IP、Authorization、Cookie、Connection String、Private Key 或 Token。Next/OpenResty 同时施加 HSTS、CSP、MIME、Referrer、Permissions、Frame 与 COOP Policy，TLS 只允许 1.2/1.3，Public/Control 使用独立 Rate Zone。
- 独立 `observability-agent` 以只读、无业务 Credential、无 Docker Socket 身份监控 Public/Direct-origin、IPv6、Next、Control、Worker、Deploy Agent、PgBouncer、S3 Representative Object、Host Disk/Inode，以及 PostgreSQL Job 与 SQLite Operation/Backup/WAL/Off-site/Restore Evidence。PostgreSQL Down 时 SQLite Integrity/Audit/Recovery Evidence 仍可观测；Alert 具有 Firing/Noise-suppression/Resolved Lifecycle。
- Production Runtime 使用固定 Alpine Node/OpenResty Digest，移除 Runtime npm/corepack/yarn/gosu；Recovery Image 以固定 Go 1.25.7 Builder 构建，Phase 18 已将 age 更新至 1.3.2。固定 Trivy 0.74.0 对六个 Runtime Image 生成 CycloneDX SBOM 并执行 Critical/Secret Fail-closed Scan；Production npm Audit 与 Repository/Bundle/Image Scan 同属 Gate。
- Production Web Root 保持 Read-only，只有 `/tmp` 与 `/app/.next/cache` 为明确 tmpfs。PostgreSQL 故障演练恢复时必须先等待 PostgreSQL Healthy，再重启 PgBouncer 与 Web Slot，防止失败的 Backend/DNS Pool State 污染 Readiness。
- `./site provision` 与 `./site migrate-server` 通过独立 Control API 创建排他的 `server-migration` SQLite Operation；Stable Target 在 CLI/API/Engine 三层拒绝数字 IP。唯一 Typed Engine 记录 Provision、PostgreSQL 18 Physical Streaming、Abort Gate、Candidate Smoke、Final WAL、Control-state Transfer、Promotion、Application/Origin Cutover、Post-switch Verify 与 Non-writing Rollback Evidence。
- Production-foundation Gate 用同一 Ansible/Hardened Compose/Host-local `.env` Contract 从零重建 Disposable Target，第二次 Provision `changed=0`；真实 Base Backup/WAL Streaming、Final LSN、Controlled Promotion、三阶段数据 Probe、Target Write、Old-source Stop、SQLite Snapshot/Reconcile 和 AAAA-only Public-like Smoke 全部通过。
- Shared Database Client 监听 PostgreSQL Idle-client Error 并只记录脱敏 Structured Telemetry，避免 PgBouncer/PostgreSQL Down 时未监听 Event 退出 `control-api`；Active Query 仍显式失败。Integration 已证明 `/api/ops/*` SQLite Route 保持可用、PostgreSQL-backed Job 返回不可用。
- `./site check` 覆盖 Biome、Source Policy、Workflow Policy、Drizzle、Typecheck、Renovate 与 webpack Production Build。`./site test` 依次包含 Unit、带真实 Registry Pull/Blue-Green/Rollback/Server Migration 的 Production-foundation、Disposable Recovery Drill、Application Integration/10 个 Playwright E2E 和 7-Migration Dedicated Suite。
- Phase 4 Control API/SQLite Recovery 与 Phase 5 GitHub Ingestion/Worker 权限边界均保持不变；`/api/ops/*` 没有进入 Next.js。

## 5. 当前 Stub/Fake 与替换责任

| Current boundary | 当前真实含义 | Replacement Phase |
| --- | --- | --- |
| zh-CN Web/Cache/Revalidation | Phase 6 production-shaped local implementation | completed in Phase 6 |
| Four-locale UI/Route/OpenCC | Phase 7 production-shaped deterministic implementation | completed in Phase 7 |
| en-US block-level Translation Memory/Fallback | Phase 8 production-shaped local implementation | completed in Phase 8 |
| Translation Diff | Phase 8 transactional zero-cost reconcile | completed in Phase 8 |
| Translation Provider/Dry-run/Budget Execution | validated vendor-neutral adapter + complete Fake/no-cost execution；concrete paid vendor unselected | production provider binding requires explicit non-production contract authorization |
| Search Refresh/Query | production-shaped PostgreSQL Projection、PGroonga Query、Durable Reindex 与精确 Cache Invalidation | completed in Phase 10 |
| Generic S3/Public Asset Gateway | production-shaped generic Adapter plus S3Mock and AList `TEST` Bucket/CDN evidence | completed in Phase 11 |
| GitHub polling default | idle content-worker polling; Phase 15 canonical reusable workflow explicitly creates exact-commit sync jobs | completed in Phase 15 |
| Owner Dataset | Earlier phases implemented persistence and signed CAS only; complete tracker UI and browser owner sessions restored under ADR 0021 | See `docs/development/personal-trackers.md`; production owner login requires separate activation |
| Observability Alert Sink/Production Asset Probe | production-shaped read-only agent、HTTPS-only optional sink 与固定 Representative Object Contract；真实 Webhook/Object 未启用 | Phase 18 authorized activation |
| Shared Deploy/Recovery Agent | Phase 14 Engine + Phase 13 Recovery + Phase 15 OIDC/Registry automation binding；真实 GitHub/Production Trigger 与 Public Cutover 未启用 | Phase 18 authorized activation/cutover |
| Server Migration Platform Binding | Phase 17 typed/audited Engine + complete disposable Adapter；真实 Target Inventory/SSH Secret/DDNS Provider/Primary 未绑定 | Phase 18 Owner-authorized activation only if migration is actually required |
| Fake Translation Provider | isolated deterministic default for Local/Test; production must inject a validated paid adapter | retained permanent test boundary |

## 6. 已知限制与踩坑

- Host default Node/pnpm may differ; repository requires exactly Node `24.19.0` and pnpm `11.23.0`. Do not loosen `./site` guard.
- Production Infrastructure Gate 自带锁定的 Node/pnpm、Ansible Core、Compose 与 age Runner；下载的 Operator Binary 先按提交的 SHA-256 校验。不要改用 Host 漂移版本，也不要删除 Backup/Control-state age Artifact 验证。
- Managed sandbox blocks `tsx` IPC/local HTTP and Turbopack worker ports. Verification used the exact toolchain with allowed local execution. `build` uses `next build --webpack`; this is still the approved Next.js stack.
- Next Cache serializes `Date`; every cached public document is reparsed with coercion before use. Do not bypass this boundary.
- Local Compose must quote the all-zero development SHA. Next dev explicitly allows only loopback `127.0.0.1` for the disposable browser origin.
- Playwright uses one worker because the suite intentionally shares one mutable Disposable PostgreSQL/cache lifecycle, including a mid-run revalidation mutation。
- `content-worker` side-effect replay depends on Hooks being idempotent. Translation/Search implementations preserve exact-input idempotency and must not turn Public requests into paid/provider calls.
- PostgreSQL migrations are now eight. `0007_personal_trackers` adds isolated owner sessions and missing empty tracker datasets; existing rows remain unchanged. `0006_phase18_content_aliases` 是低风险 Additive/Relaxation Expand：把 Alias Namespace 从 Wiki-only 扩展到明确的 Blog-or-Wiki，不重写任何 Row，保持旧应用兼容。`0005_phase10_pgroonga_search` 继续新增可重建 `search_documents`、Locale/Type B-tree 与 Multi-column PGroonga Index；不得修改任何已应用 SQL/Metadata。
- Existing Runtime DB 在 Phase 7 应用代码发布后需要一次显式 Content Sync 才会回填区域物化；回填前 Server Renderer 使用相同确定性 Converter 作为只读 View。Public Request 绝不触发 Backfill。
- Phase 8 Migration 不在 Migration-time 猜测/回填旧 English。现有 en-US Row 的 `source_hash` 为 NULL 时 Public DAL 忽略；应用 Phase 8 后必须显式 Content Sync 才会建立 Segment Mapping、Pending 和 Current Mixed Materialization。zh-CN 发布不等待该 Backfill，Public Request 也不写 DB。
- Normalization Version 当前固定为 1。任何改变 Identity/Normalization 的实现必须显式提升版本、提供安全重放/迁移计划，并更新稳定身份与重复 Block Fixture。
- Glossary 任何会改变输出的编辑必须同时提升 `version` 与正整数 `revision`，并更新代表性 Unit/Integration Evidence。
- S3Mock alone cannot prove AList metadata, ETag, Unicode-key and overwrite compatibility. Phase 11 added the required AList `TEST` Bucket/CDN evidence; behavior-affecting storage changes must rerun both targets.
- Owner clarified that AList Bucket `TEST` is the dedicated production-compatible contract target, not the production asset Bucket. Its CDN mapping is `/TEST`, while S3 keys are Bucket-root relative; no Provider-specific root-prefix configuration exists.
- AList S3 GET/HEAD exposes no usable ETag and normalizes Cache-Control. ETag is therefore optional and never a correctness dependency; the application gateway derives content-addressed immutable or stable-key mutable response policy from validated object keys. Direct CDN is for content-addressed assets and the verified baseline is correct SVG MIME, ETag, `max-age=86400` and anonymous-write denial.
- Filesystem-backed AList synthesizes an empty `tungchiahui-contract/` namespace directory without ETag/Last-Modified. It is not an object and is not removed by S3 DELETE. UUID-flat prefixes prevent per-run directory accumulation; final exact-prefix cleanup was empty.
- Static ROS2 files are frozen third-party generated output. Do not run formatters or source analyzers inside that exact directory; Phase 18 refreshes/diffs from the then-current Legacy HEAD.
- Phase 12 没有执行 Production、GitHub Write、AList、DNS/EdgeOne、付费 AI、Deploy/Cutover、Backup/Restore 或旧仓库操作。Production-like Test 只使用临时本机目录、高端口、自签名证书、临时 age Key 与 Disposable Password；本阶段没有重新扫描或定点读取旧仓库。
- Phase 13 也没有执行 Production、真实 AList/R2、DNS/EdgeOne、付费 AI、Deploy/Cutover 或旧仓库操作。Recovery Gate 只使用临时 PostgreSQL 18、两个独立 S3Mock、随机 Host Root/Key/Credential，并要求 Disposable Target Marker。
- Phase 14 没有执行 Production、Public Cutover、GitHub Write、AList/R2、付费 AI 或旧仓库操作。Deployment Gate 只使用临时 Host Root、高端口、自签名证书、Disposable PostgreSQL 和本地 Docker Image；缺失 Digest 与 PostgreSQL-down Failure Injection 均只作用于 Inactive Slot。
- Phase 15 没有执行 Production、Public Cutover、GitHub Write/Workflow、GHCR Push、GitHub Settings Mutation、AList/R2、付费 AI 或旧仓库操作。Supply-chain Gate 只使用临时 Registry/Host Root/Port/Database/Certificate，并明确输出 `productionTraffic=false`。
- Phase 15 已实现 approved Repository + Manifest Digest Pull/Resolution，但真实 GitHub `production` Environment Protection、`main` Required Check、Package Permission 和 canonical Content Caller 必须在 Phase 18 Activation 前由 Owner 在 GitHub Hosted Settings 中核验；YAML 不可替代这些外部控制。Phase 16 没有借 Production-readiness 测试提前启用真实 Trigger/Cutover。
- Phase 16 没有执行 Production、Public Cutover、GitHub Write/Settings、AList/R2、真实 Alert Webhook/Object、DNS/EdgeOne、付费 AI、真实 Backup/Restore 或旧仓库读取/修改。Infrastructure/Recovery/Load/Security Evidence 全部来自临时本机目录、容器、Registry、S3Mock、证书、Key 与 Disposable Credential，输出明确 `productionTraffic=false`。
- Phase 16 最终单次 Disposable Load 为 Public 80 并发全成功、P50 `322.99 ms`、P95 `508.76 ms`、Pool 80 请求 `186 ms`、Slow Query `247.11 ms`；这些数字不是 SLA 或 Capacity Promise。Production SLA、RPO/RTO 仍为 **Unknown**，必须由后续明确授权的代表性多次测量定义。
- Phase 17 没有执行 Production、真实 Primary/DNS/DDNS/Public Cutover、GitHub Write、AList/R2、付费 AI 或旧仓库读取/修改。完整迁移仅操作临时 Host Root/Port/Certificate/Registry/Credential/age Key 与 Disposable PostgreSQL Volume，最终输出 `productionTraffic=false`。
- Phase 17 最终一次 Disposable Migration 从 Source PostgreSQL Stop 到 Target Application Ready 为 `1036.81 ms`，三阶段 Probe 无丢失且 Old Source Non-writing。该数字不是 Production SLA/RPO/RTO；真实数据量、网络、DNS/DDNS、Storage 和 Operator Coordination 未测，Production SLA/RPO/RTO 仍为 **Unknown**。
- Cross-major 官方证据按 2026-08-27 PostgreSQL 18 文档复核：Physical Streaming 不跨 Major；Logical Replication 默认候选但需单独处理 Schema/DDL、Sequence 和其他限制；`pg_upgrade` 只用于明确 Maintenance Model。ADR 0009 仍适用，没有新增 ADR。
- pgBackRest Repository Generation 是完整 Snapshot 而非增量对象同步；这优先保证可独立验证/恢复，后续优化不得削弱逐对象 Hash 或 Off-site 完整读回有效性条件。
- Disposable Drill 已输出实际 Backup Bytes/Seconds 与 Restore-to-ready Seconds，但小数据集/S3Mock 不代表 Production。Production RPO/RTO 仍未定义，需明确授权的代表性多次演练后才能提出。
- 真实 Translation Provider Contract Test 未运行：Owner 没有提供明确的非生产 Provider Target/Credential/付费授权。此为 Phase 9 Exit Gate 要求的安全分支，不是 S3 缺口；未来启用具体付费翻译 Provider 前必须补做。

## 7. Phase 18 Completion State

- Owner 已授权 Phase 18 Production Work。初始部署由 Owner 按逐步命令执行；后续 Owner 对精确列出的生产操作逐项授权 Agent 代为执行。聊天中出现过的明文 Credential 不得写入仓库、文档、日志或提交说明，也不得超出当次明确授权复用。
- Start from the focused Phase 17 commit and a clean tracked worktree；`.env.local` remains Owner-owned、Gitignored and must never be staged.
- Phase 18 Final Legacy Delta/Inventory Refresh 已纠正并固化在 `docs/migration/phase-18-legacy-delta.md`：Legacy `feee48b1685e7cab8fed84941bff9e58fc32491c` 相对 Phase 0 有 1 篇 Blog 新增、8 篇 Markdown 修改与 Blog Route Helper 变更；Page/Component/ROS2 Tree 未变化。当前 5 Blog + 233 Wiki 的 238 个 Frontmatter/Route 均有效，Current Legacy/V2 全量 Route 无 Collision/Mismatch。V2 采用当前含日期 Blog Canonical Route，并为 Phase 0 的四条已公开 Blog URL 建立精确兼容 Alias；旧仓库保持只读。
- Blog/Wiki 深度兼容阻断修复已按 `docs/migration/phase-18-blog-wiki-compatibility.md` 实现：恢复 Blog 日期/摘要、Wiki 顶层文档卡/层级编号/展开章节、首页最多五个顶层 Wiki 文档、桌面与移动文章导航、按正文最高标题归一且覆盖 CommonMark `h1`–`h6`、正文与 TOC 共享的层级编号、进度/代码复制/点击预览任意位置关闭的图片预览、基于现有 PostgreSQL/PGroonga Projection 的 Blog/Wiki 标题+标题层级+正文检索、独立 Header 放大镜、跟随系统/深色/浅色三态 Theme、可点 Backdrop 关闭的移动主导航、居中且选择后关闭的移动阅读导航、左下双悬浮阅读器控件，以及 Umami 共享数据服务端聚合与仅批准域名加载的生产追踪脚本。Owner 于 2026-09-07 明确删除低价值的 Wiki/CV 打印控件；无历史流量的本地路由不再展示四项零值。2026-09-08 增量把正文编号改为主题蓝并使整个标题支持鼠标/键盘锚点；随后按 Owner 提供的旧站截图定点只读核对 Legacy Blog/Wiki 组件，把代码框改为所有主题一致的深色正文、独立语言栏、自动语言标签和右侧紧凑复制按钮，同时保留 Shiki Token、局部横向滚动和移动端宽度约束。Canonical Fence Corpus 的 C/C++、CMake、Shell、Python、Web、JSON/YAML/XML、SQL、PowerShell、Dart、Lua、Dockerfile、文本/配置等主流语言与历史大小写/拼写别名已有 Shiki Fixture；未知值安全回落为纯文本。宽屏正文中栏扩大且两侧导航移向外缘；简体中文 Development Markdown Fixture 覆盖引用、列表/任务、宽表格、长代码、链接、图片和 `h1`–`h6`；宽表格/代码块限制在正文宽度内独立横向滚动，普通长文本/链接换行，窄屏 E2E 禁止页面级横向溢出。Header 与独立全屏 Start 使用从 Legacy 精确恢复的 favicon。定点旧仓库证据确认当前 Corpus/Legacy 列表没有分类、标签和分页，未虚构 Taxonomy。Owner 视觉验收和其余 Phase 18 Gate 已于最终验收关闭。
- `/more` 与特殊页面/音乐阻断修复已按 `docs/migration/phase-18-special-pages-music-compatibility.md` 在本地实现：恢复完整 More Hub、About/CV/Friend/Logo 内容、三引擎 Start 工作台、真实 Umami Stats、Tech/Weight 公共数据视图与 Owner 签名写入入口，以及 159 首实时歌单、25 首自建 CDN 映射、同步歌词、可展开完整歌单的四行歌词全局播放器、19-rem 迷你播放器和原 Legacy 重连/全球 CDN 故障转移时序。Homepage 已恢复旧站三入口、四标签、六关注方向和各五条最新 Blog/Wiki 的信息架构，并统一为 V2 蓝色视觉；移动文章页不再把播放器强制抬高 5.5rem，窄屏宽度还会为左下阅读浮球留出独立点击区。特殊页面/More/Footer 已统一到 V2 蓝色视觉体系，Footer 恢复 13 个联系方式并只从自建主/全球 CDN 加载 Font Awesome；Start 使用服务端验证缓存的 Bing 最近 8 图并无重复轮换，失败时回落静态背景。生产审计确认 Umami API 返回真实聚合，文章统计失败是边缘层误拦 `/api/traffic` POST；修复精确放行该接口。Footer/Umami 资源阻断来自应用与边缘双 CSP 交集，OpenResty 现隐藏上游 CSP 并作为唯一审核策略来源。Canonical/公共数据位于 PostgreSQL，资源位于 S3/CDN；浏览器只保留主题、播放器收起态与未登录 Start 私人设置，Blob 仅用于即时导出。此历史版本的 Owner 私钥仅在浏览器本地导入和签名；后续 ADR 0021 已将页面替换为密码会话与直接编辑，移除浏览器私钥导入器，写入仍只经过独立 `control-api`。Repository Check、168 项 Unit、Production-foundation/Recovery、11 项 Public E2E、S3Mock/Application Integration 与 7 项 PostgreSQL Migration Gate 已通过，Local Stack 为 Healthy；Owner 本地验收在该检查点仍待完成，最终已于 2026-09-12 接受。
- 2026-09-08 Production Browser 复核确认 Umami Share Origin 发送 `frame-ancestors 'self'`，跨域 iframe 必然被浏览器拒绝；Stats 改用固定外链入口，站内服务端聚合与公开指标面板继续保留。
- Owner 于 2026-09-08 批准 ADR 0020，移除固定 24 小时 Deployment Stabilization Block。新 Cutover 清空兼容保留的 `stabilization_until`，连续发布仍以同一 Inactive Slot、完整 Pre/Post Smoke、并发互斥、审计和立即上一版本无重建回滚运行。变更已通过 168 项 Unit、Production-foundation Blue/Green/No-rebuild Rollback、双副本 Recovery、11 项 Public E2E、Application Integration、7 项 Migration、Build 与 Security Gate；Phase 18 的线上观察和旧 Nuxt Rollback-window 验收已于 2026-09-12 关闭。
- Legacy GitHub Remote 当前解析为公开的 `tungchiahui/tungchiahui.github.io`。Owner 已明确选择并批准创建独立公开 Canonical Repository `tungchiahui/tungchiahui_content`；其 `main` 激活提交 `db3aad287eabf84b16b44c33957d57c02ae60e9f` 保留过滤后的 126 个 `content/**` 历史提交与当前 238 篇 Markdown，并加入只调用 V2 reusable Content Sync 的 Push/Manual Caller。创建与 Workflow-only Push 均未触发 Production Sync，Legacy Repository 保持只读。
- 为回答 Production Secret 传输边界而执行的定点 Legacy 配置检查确认：旧 Nuxt 以 Gitignored、`0600` 的单一明文 `.env` 注入 Compose，Backup/Instance Export 明确排除真实 `.env`、Token 与 Private Key。ADR 0022 后，V2 也使用部署根目录单一 Host-local 明文 `.env` 作为生产 Secret 手工 Source of Truth；该文件不得进入仓库、Actions、Image、Public 目录或日志，PgBouncer userlist 与 Backup age Identity 只作为派生 runtime 文件从 `.env` base64 字段生成。
- 真实目标为 Debian 13 共享主机 `10.0.0.4`（只用于 Bootstrap，不得进入 Durable Config），已有 1Panel OpenResty 使用 host network，并监听 `80/443/8443/18080`；Docker/Compose 可用。
- ADR 0016 已接受：外层 1Panel 负责公网 TLS/HTTP，V2 只发布 `http://127.0.0.1:3100`，并在内部 V2 OpenResty 保留 Blue/Green 与 `/api/ops/*` 路由；1Panel 不得直连 Slot/Control API。
- Production Ansible Inventory 复用 Owner 已有的稳定 SSH Alias `Debian`，并通过现有的 `tungchiahui` sudo 身份执行可审计 Provisioning；Runtime Service 仍使用 Compose 中彼此隔离的非 root 身份。
- 2026-09-07 已在真实 Debian Origin 完成隔离基础 Provision：首次完整收敛后相同参数重跑 `changed=0`、`failed=0`。9 个长期服务均为 `healthy`，所有容器 `Memory=0`、`NanoCpus=0`，唯一 Host Listener 为 `127.0.0.1:3100`；内部 OpenResty 与 `/api/health` 返回 `200`。未执行 Content Sync、Outer 1Panel Proxy 或 Traffic Cutover。
- Owner 单独授权的初始 Production Database Migration 已应用全部 7 个版本化 Expand Migration，输出 `database_migrations_completed`、`migrationCount=7`；初始空库无需 Fresh Recoverable Backup。该步骤未进行 Content Sync 或流量切换。
- 初次 Migration 后 `/api/ready` 暴露 PgBouncer SCRAM 双跳认证缺陷：Secret 文档中的 URL、明文密码与 PgBouncer Verifier 一致，但旧 Bootstrap 让 PostgreSQL从同一明文生成了不同 Salt 的 Verifier。PR #4 / main `c04741990cf823450273a288d3dd72a9e111e9f5` 已改为在 Bootstrap 前验证身份集合与密码/Verifier，并把 PgBouncer 的同一 Verifier 精确安装到 PostgreSQL；Production-like Gate 新增真实 PgBouncer→PostgreSQL 登录，完整 GitHub Quality Gate 与四镜像发布通过。
- Owner 单独授权后，真实 Origin 已用 `c04741990cf823450273a288d3dd72a9e111e9f5` 四镜像执行 versioned schema-2 Role Reconciliation；首次修复运行 `changed=6`、`failed=0`，相同参数重跑 `changed=0`、`failed=0`。`/api/health`、`/api/ready`、`/api/version` 均返回 `200`，Readiness 报告 PostgreSQL `ready`，Web Slot 为 `blue` 且 SHA 精确匹配；Host 仍只监听 `127.0.0.1:3100`。
- Owner 随后在 1Panel 将 `www.tungchiahui.cn` 反向代理到 `127.0.0.1:3100`，并自行把 DNS/EdgeOne 切到 V2；EdgeOne 以公网标准 443 服务、Origin 使用既有 8443/18080。该 Public Cutover 发生在 Content/Backup Gate 完成前，Owner 明确选择暂不回退旧站；旧 Nuxt Repository/Deployment 仍不得删除或修改，Rollback Window 尚未关闭。
- 首次 Production Content Sync 暴露 `content-worker` 仅连接 `internal: true` Application Network、无法读取 GitHub。PR #5 / main `a10eace92310f3fc23deb26858c4eeb76821f8dc` 为它增加唯一专用 `content-egress`，保持其他 Service 无外部出口；完整 PR/Main Quality Gate 与四镜像发布通过。真实 Provision 首次 `changed=4`、`failed=0`，复跑 `changed=0`、`failed=0`；Public/Origin Version 均为该 SHA，Host 仍只监听 `127.0.0.1:3100`，Production Network Inspection 确认该 Egress Network 只有 `content-worker`。
- 2026-09-07 最终 Legacy Content Refresh 再次只读确认 `/my-blog` 本地/远端 `main` 仍为 `feee48b1685e7cab8fed84941bff9e58fc32491c`；其 5 Blog + 233 Wiki 与 `tungchiahui_content@db3aad287eabf84b16b44c33957d57c02ae60e9f` 的 238 个 tracked Canonical Markdown、Git Tree `a31783bb3ff565a226b5566128b41a2509e1fdfa` 完全相同，因此 Canonical Repository Sync 是幂等 no-op、没有空 Commit/Push。旧仓库未修改，未跟踪 `_i18n` 不属于 Canonical Blog/Wiki。
- Content Worker 的 GitHub Token 原为空；当前 238 文件的 Tree + Blob API 读取超过匿名每小时 60 次配额。Owner 提供的 Repository-scoped read-only Credential 当前应只存入生产 Host-local `.env`，由 Compose 注入 `content-worker`；不得把 Credential 值写入文档、日志、Actions 或提交说明。
- Production Content Sync Job `70c8366e-4aab-4232-807c-59b515465c27` 已从精确 Commit `db3aad287eabf84b16b44c33957d57c02ae60e9f` 一次完成：`filesSeen=238`、`filesChanged=238`、`filesDeleted=0`。数据库为 238 Active/0 Deleted、5 Blog/233 Wiki、单一 Source Commit；Source-hash Mismatch、重复 Source Path 与重复 Route 均为 0。四 Locale Search Projection 各 238；en-US 有 17,566 Pending/Fallback Block，Translation Job/Provider Request/Cost 均为 0。代表 Blog 四 Locale、Wiki、ROS2 Asset 与中文 Search Public Smoke 返回 `200`，`ROS2_Control` 返回 5 条。
- 首次真实 `./site backup` 暴露 CLI 把内部 `kind` Discriminator 原样发送给 Strict Control API；HTTP 400 发生在 Operation 创建前，R2 未写入。PR #6 / main `7e3d529f4f5bfec4ab358acf7e1aa1e30fbb482e` 现由 Recovery Control Client Runtime-validate 并 Strip 为精确 `backupType/environment/reason` Body，完整 PR Quality Gate 通过；该修复只在 Operator Client，不需重启 Production Service。
- Owner 授权的首份 Production Full Backup Operation `d08a0e91-9972-440e-aca1-a2a0e535a529` 已以 `recovery-verified` 完成。Backup `20260907-004052F` 的 R2 Off-site 为 `fresh`、Manifest SHA-256 `382585ce68b4d918767f53471ee01c2ac3cc9cadeb8b628bf5a1284b6f73aabd`、Repository 52,193,008 bytes、实测 676.565 秒，WAL Max `000000010000000000000028`。Control-state Schema 6 Snapshot `b4bc569c-a5ef-4199-b072-a543da702ed5` 已 age 加密上传并从 `control-state/production/latest.json` 读回验证；但 ADR 0018 / Control-state Schema 7 启用双副本后，该历史 R2-only Generation 被正确重新分类为 Primary `pending`、整体 `valid=false`，不能再作为当前 Fresh Recoverable Backup Gate。
- 生产对象盘点确认 AList Asset Bucket 有 3,680 Object / 449,294,509 bytes，R2 中旧 AList 副本初始有 3,687 Object / 449,229,575 bytes；初始为 3,676 个 Key 同名同大小、AList-only 4、R2-only 11、同 Key Size Mismatch 0。Owner 单独授权后，`./site storage backup assets` 已逐对象做双端 SHA-256：3,676 个内容一致、4 个 R2 缺失对象已补齐并逐一回读验证、0 个内容变化、0 个 AList 不可读，11 个 R2-only 历史对象全部保留；版本化 Manifest 为 `asset-backups/manifests/2026-09-07T01-23-15.639Z-3fdba4017ca75f9f896e7dc3517adcf61a0a21ad4e05df4144b30414662bc222.json`。Asset Backup 不连接 PostgreSQL，不读取/覆盖 V2 的 `database-backups/` 或 `control-state/` 内容，并采用 Copy/Add/Update、永不传播 AList Delete 的语义；任何 R2 孤儿清理需单独 Owner 授权。
- Owner 另行明确授权删除 AList Asset Bucket 中空的 `TEST/` Directory Marker；删除前后对精确 Prefix 的 List 均为 0 个对象，Marker 的精确 S3 Delete 已成功。该操作未触碰 R2，符合 Asset Delete 不传播的 Policy。
- 首次 Provision 的 Docker Hub Pull 暴露真实网络前置条件：OpenClash 首条 `SRC-IP-CIDR,10.0.0.0/24,DIRECT` 使 Origin 的 Registry TLS 直连超时。Owner 已将 DNS Redirect 切到 Firewall Redirect，并以 LAN White List 仅让 `10.0.0.4` 进入 Clash Rule Engine；Registry `/v2/` 随后返回预期 `401`，两个固定第三方 Image Digest 均可解析。临时 Mirror 方案未提交/部署，一次性传输 Archive 已从 Controller 与 Origin 删除。
- 主机磁盘约 69 GiB、当前仅约 19 GiB 可用；Docker Image 约 33.46 GB，其中约 18.58 GB 标记可回收。未确认回滚依赖前不得执行 Prune，Production Preflight 仍需形成容量结论。
- 主机现有 1Panel PostgreSQL 把 `5432` 发布到所有 IPv4/IPv6 Interface；V2 PostgreSQL 不发布 Host Port，不得修改或复用该现有数据库。现有暴露风险需由 Owner 独立处理，不能混入 V2 Cutover。
- Phase 18 首次重新运行 Fail-closed Image Scan 时发现 `age 1.3.1` 所含 `golang.org/x/crypto v0.45.0` 的新 Critical Finding；已按官方 2026-08-29 Stable Release 升级到 `age 1.3.2`，Linux amd64 Archive SHA-256 固定为 `cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10`。必须以重跑 Trivy 结果作为关闭证据，不得加入 Ignore。
- Owner 曾在 Phase 18 初次 Secret 配置时把生产对象存储简化为 AList Asset 与 R2 Backup，ADR 0017 因此形成单一 Off-site `BACKUP_S3_*`；该中间决策已由后续明确澄清的 ADR 0018 Supersede，保留本条仅用于解释首份 R2-only Backup 的历史状态。
- 首次真实 R2-only Backup 后，Owner 最终澄清 Recovery 拓扑：现有 AList Bucket 是 Primary，数据库/WAL/Control-state 写入其根目录固定 `backups/`，R2 是包含普通 Asset 与该 Recovery Namespace 的完整 Off-site 副本。ADR 0018 Supersede ADR 0017；`BACKUP_S3_*` 复用现有 AList 连接，`BACKUP_OFFSITE_S3_*` 指向 R2。Backup 只有双端完整读回均 Fresh 才 Valid，Restore 优先 AList 并回退 R2；整桶 Copy/Add/Update 会把 `backups/` 一并校验到 R2，且不传播 AList Delete。AList 官方 S3 Contract 只有实例级 Access Key/Secret，这是 ADR 记录的 Provider Limitation；固定 Prefix、应用只读接口、Public Prefix Deny、Artifact Encryption 与独立 R2 Credential 是补偿控制。既有 R2 Backup 保留但不满足新双端 Gate；ADR 0022 后这些值位于 Host-local `.env`，无需新建 AList Bucket。
- ADR 0018 的本地完整回归已通过：145 项 Unit、Production-foundation/Idempotency/Security/Load、Full/Diff/Incr + WAL/PITR Recovery、Control-state age Snapshot、PostgreSQL-down Restore、10 项 Public E2E 与 7 项 PostgreSQL Migration 全部通过。恢复演练会先删除测试 AList Primary Generation 与 Control-state Artifact，再证明 R2 Off-site 自动回退可恢复；Control-state Version 7 Unit Test 证明旧 R2-only 记录升级后会被标记为 Primary `pending`、`valid=false`。
- Owner 批准后，Production 基础组件已用 `93287c38f16bcbe70b1291b82b06e82b23e4ae95` 的 Service/Recovery/PostgreSQL Immutable Image 收敛，Control-state 无损升级到 Schema 7；Shared Deployment Operation `39dab66c-ed9a-406e-bf9e-b0f75f744225` 把同 SHA、Web Digest `sha256:93766646f5d65d62f206c07dcb201daf6a4d6b93cc7df424feed7a0da821828c` 部署到 Green 并达到 `deployment-verified`。Public/Origin Health、Ready、Version、Home、Article、四 Locale、Search、Asset Smoke 全部通过；旧 `a10eace92310f3fc23deb26858c4eeb76821f8dc` Blue Slot 保持 Healthy，Stabilization/Rollback Window 截至 `2026-09-08T03:31:11.903Z`。
- 首次 ADR 0018 Production Full Backup Operation `c126a8b3-1da4-429f-849b-640f4f014e70` 安全失败并记录 `valid=false`：Backup `20260907-034059F` 的 R2 Off-site 为 `fresh`，AList Primary 因 `ListObjectsV2` 对精确 `.../repository/` Prefix 重复返回 3 个虚拟目录标记而被误判 File-count Mismatch。只读审计确认 Manifest 的 2,761 个文件全部存在、缺失 0、真正额外对象 0、56,414,192 bytes 与 Manifest SHA-256 `0f39561ff659589680914a9d06073b5195c128a6ef07b02e80182ef83f7885bb` 完整读回为 `fresh`。Recovery Verification 现只去重并忽略精确 Prefix Marker，仍对未知/缺失 Key 与逐对象 Hash Fail Closed；146 项 Unit、完整 Repository Gate、Production-foundation、双副本/强制 R2 回退 Recovery、10 项 E2E 与 7 项 Migration 已通过。修复尚未重新部署，新的 Production Backup Retry 仍需单独 Owner 授权。
- PR #9 / main `1643b164198fa2e82c766bfc4992e63f4e100c4e` 已接受 ADR 0019 并实现严格的 Local pgBackRest -> AList PUT/完整读回 -> 从 AList 读取并写 R2/完整读回顺序、默认 8 路有界小对象并发、分阶段耗时、Off-site-only Retry、每日 03:05 Asia/Hong_Kong 幂等调度（周日 Full、其余日期 Differential）和成功 Backup 后的 pgBackRest Retention Expire。远端 Generation 不隐式删除，AList Delete 也不传播到 R2。148 项 Unit、完整 Repository/Production-foundation/Recovery/E2E/Migration Gate、PR/Main Quality 与四镜像 Build 均通过；仅扩大一个会在 GitHub Hosted Runner 偶发超过 5 秒但最终断言全通过的 Deployment Engine Unit Test Timeout 到 10 秒，Production Timeout 未放宽。
- Owner 对“只替换 deploy-agent、运行一次全量备份、启用 03:05 Timer”三项精确授权后，Production `deploy-agent` 已单独替换为 Recovery Image `ghcr.io/tungchiahui/tungchiahui_web-recovery:1643b164198fa2e82c766bfc4992e63f4e100c4e` / `sha256:78f7750e24a0d5229da0fdd8b4fdc00a9b265b2f5bc92276c99bbfcad8eaa29b` 并保持 Healthy；替换前后除该容器外的所有容器 ID 完全相同，Web、PostgreSQL、内部/1Panel OpenResty 均未重启，Public Version 仍为 Green `93287c38f16bcbe70b1291b82b06e82b23e4ae95`。
- Fresh Production Full Backup Operation `d6ba900a-03c9-48a7-921b-30d745d94345` 已以 `recovery-verified` 完成。Backup `20260907-090610F` 为 `valid=true`，AList Primary 与 R2 Off-site 均 `fresh`，2,757 Files / 56,475,808 bytes，Manifest SHA-256 `862c80a9ef088267d8f0f38915e456c682b0d78cfafb893d6e9047b6890f9625`，WAL Max `000000010000000000000035`，整体 887.986 秒。AList Transfer/Verify/Total 分别为 195.395/266.930/462.326 秒；R2 Transfer/Verify/Total 分别为 328.273/91.285/419.558 秒。Operation 只有在双副本和最新 Control-state age Artifact 均复制验证后才完成；完成后 Incomplete Operation 为 0，Public Ready/Search/Headers/Version 继续通过。
- `/etc/systemd/system/tungchiahui-backup.service` 与 `.timer` 已按版本化 Ansible Contract 安装并启用。Timer 为 `active (waiting)` / `enabled`，首次触发为 `2026-09-08 03:05:00 Asia/Hong_Kong`，启用时未补跑重复 Backup；`Persistent=true`、`AccuracySec=1min`、`RandomizedDelaySec=0`。Scheduler 的 Sunday Full / Monday-Saturday Differential 与每日稳定 Idempotency Key 已由 Unit/Production-foundation Test 覆盖。
- Timer 启用后的真实 Observability Snapshot 显示 Public/Origin/Control/Worker/Deploy-agent/Web/PgBouncer 均 Healthy、IPv6 Address Count 1、Control-state Integrity `ok`、Disk Used 77.88%、Fresh Backup 双副本/WAL 均有效，但仍有 4 个 Active Alert：过去 24 小时内 2 个失败 Application Job 触发 `ApplicationJobStuck`，AList Prefix 修复前的 1 个失败 Infrastructure Operation 触发 `InfrastructureOperationStuck`，尚无真实 Production Restore Drill 触发 `RecoveryEvidenceStale`，配置的 `/api/assets/monitoring/health.svg` 返回 404 触发 `AssetStorageUnavailable`。这些都必须在 Stabilization/Exit Gate 前关闭并留下证据；不得把健康探针与 Backup 成功误报为 Alert-free Stabilization。
- Owner 授权后，AList Asset Bucket 已写入精确 `monitoring/health.svg`，311 bytes、SHA-256 `388b1096e50df6dc3b408bce526472795ddb9054e82a68175a9f73f2f7f2825e`，并由现有 Preserve-delete Mirror 顺序复制到 R2：9,204 个 Source Object 中 Copy 1、Unchanged 9,203、Read/Write Failure 0，1,433 个 R2-only Object 保留，Manifest 为 `asset-backups/manifests/2026-09-07T10-00-22.451Z-4033388bd654e78fdfc38945781e07a97a42893dd92b4ce55123250fd7c54399.json`。Public HEAD 返回 200 而 GET 返回 502；生产日志定点定位为 Asset Route 在 Response Stream 被消费前于 `finally` 销毁 S3 Client，导致真实网络 Body `ECONNRESET`。`streamWithCleanup` 修复把 Client 生命周期绑定到完整消费、取消或错误，3 类生命周期 Unit Test 与完整本地 Gate 已通过；该检查点尚未部署，后续 PR #10 部署和最终 Smoke 已关闭告警。
- Owner 授权的真实 Production Restore Drill 已从最新有效 Backup `20260907-090610F` 的 AList Primary Repository 恢复到 Host 上一次性、`network=none`、无端口且不挂载 Production Data 的 PostgreSQL 18.4。Control-state age Snapshot 恢复后 Integrity 为 `ok`，Schema 7、156 条 Audit Event、Active Green/Previous Blue 和 Current/Last SHA 一致；数据库恢复后 7 个 Migration、238 Active Document（5 Blog/233 Wiki）、四 Locale 各 238 个 Search Projection、0 个 Null Route/Hash/Markdown 均符合生产状态，`pg_amcheck --all --install-missing` 检查 866/866 Relations、5,967/5,967 Pages 通过。核心 PostgreSQL Checksum 在一次性副本排除 PGroonga 私有非 PostgreSQL Page 文件后扫描 1,320 Files / 7,613 Blocks、Bad Checksum 0；演练容器和 `/var/lib/tungchiahui/restore-drill.WRpdlH` 已删除，Production PostgreSQL 未停止、未写入且所有 Production Container 继续 Healthy。
- Asset Stream 修复 PR #10 已在 PR Quality Gate 通过后合并为 main `0ff8aa4578068d29d2dd3d5651c2a20fa09ef8bb`；main Quality Gate 再次完整通过并发布四个同 SHA Immutable Image，Web Digest 为 `sha256:0cc65b5f6578a9b7b7fd8fb0eff3299e9f467542d0c8816f35a7ea213ed74a36`。Repository 未启用自动 Production Deployment，镜像发布没有隐式切流。
- Owner 授权该 SHA 的 Blue/Green Deployment 后，旧 Shared Engine 曾在任何 Image Pull、Container Replacement 或 Cutover 前按固定 Stabilization Policy 拒绝请求；该历史失败记录继续保留在 Audit/Observability 中。Owner 于 2026-09-08 判断个人站点的固定 24 小时禁令收益不足并批准 ADR 0020：新引擎允许连续发布，同时保留并发互斥、完整 Gate、审计和立即上一版本回滚；Phase 18 的线上观察期只作为最终验收证据，不再阻止应用发布。
- Restore Drill Timestamp 已登记为 `2026-09-07T10:35:00.000Z`。只对 `tungchiahui-production-observability-agent-1` 执行经过完整 Compose Render Validation 的 `--no-deps --force-recreate`，其余所有 Running Container ID 前后完全相同；新 Agent Healthy，`RecoveryEvidenceStale` 已消失。该检查点仍有 3 个真实 Alert：历史/现有 Failed Application Job、包含上述 Policy Rejection 的 Failed Infrastructure Operation，以及等待 Asset Stream 修复部署的 `AssetStorageUnavailable`；后续部署、24 小时边界修复和最终验收已关闭全部未解释 Critical Alert。
- 初次 Production Provision 需要 Web、Service、Recovery 与 PostgreSQL 四个同 SHA Immutable Image；Phase 18 已补齐受 Quality Gate 约束的 GitHub Build Job，使其以独立 GHCR Repository 发布完整 Image Set，Web Digest 仍是 Shared Blue/Green Engine 的唯一 Release Digest。
- Phase 18 真实首发命令审计发现 Deployment Article Smoke 仍硬编码为仅 Disposable Seed 存在的 `/blog/phase-3-seed`。Production Compose 现要求由 Ansible 显式注入 Article/Asset/Search Smoke Policy，默认文章改为最终 Legacy Audit 已覆盖的 `/blog/2026-09-02-wm-lun-wen-luo-lie`；Disposable Gate 继续显式使用 Seed Route，避免未切流 Candidate 因虚假 Production 前提失败。
- 初次 Push 前 `PRODUCTION_DEPLOYMENT_ENABLED` Repository Actions Variable 必须保持缺失/非 `true`；Quality 成功后只发布候选 Image Set。只有 Production Environment Protection、Origin Provision 与 Pre-cutover Gate 全部成立后才显式启用 Deploy Job，防止 Bootstrap 前产生伪部署。
- Phase 18 Candidate 前完整本机 Gate 已通过：Biome/Source/Workflow/Drizzle/Typecheck/Renovate/Build/Security，29 个 Test File/135 个 Unit Test，Production-foundation（含 Trivy Critical/Secret Scan、Blue/Green/Rollback/IPv4+IPv6/迁机）、单 Off-site S3 Full/Diff/Incr/WAL/PITR/Control-state Restore、Application Integration、10 个 Public E2E 与 7 个 PostgreSQL Migration。全部使用 Disposable Local Target，`productionTraffic=false`。
- 首次 GitHub PR Gate 暴露 Hosted Runner UID 与开发镜像 `node` UID 不同，导致 Test-only Control-state `0700` Bind Mount 无法写入；测试 Compose 覆盖层现显式使用 Runner UID/GID。该修复不改变 Production Container Identity/Permission。
- GitHub Hosted Runner 的首次 Next.js Development Homepage 冷编译可超过 5 秒；Disposable Integration 的初次 Direct Read 使用 30 秒，OpenResty 入口因不同 Host Cache Key 也使用同一有界重试直到首次 200。后续请求、Production Health/Smoke Policy 与 Production Timeout 均未放宽。
- 在任何真实 Cutover 前重新验证 GitHub `production` Environment/Required Check/Package Permission、Canonical Content Caller、Production Asset Probe/Alert Sink、Fresh Backup/WAL/R2/Restore、Control-state Backup、Target Inventory 与 Public/Origin IPv4/IPv6。
- 若 Phase 18 不需要实际 Server Replacement，不绑定或触发 Migration Platform；若需要，必须先获得真实 Target/Primary/DDNS 的单独授权并复核 `server-migration.md` Abort/Rollback Gate。
- 不得把 Phase 16 Load、Phase 13 Restore 或 Phase 17 Disposable Migration Timing 伪装为 Production SLA/RPO/RTO。

Phase 18 已完成。最终 Production Web 为蓝槽 `98d1002f30d4a2191ebb4f9848d7661536a4ea8b`，
Web Digest 为 `sha256:f2cb1c0bf59d82a4ea786f5c7e8c35f5645362b21f6ae0f7ea9d1488d262e993`，
Deployment Operation `5548e323-09dd-42a0-8192-2c5da5931743` 达到 `deployment-verified`；绿色槽位
`fff1af79c4a13b21ba3a2fdf9768554c117814e6` 保持 Healthy，继续提供 V2 无重建即时回滚。

最终 Canonical Content Commit 为 `68b7cf36947cfe390503196e965a7edcb75a0ecf`：238 Active / 0 Deleted，
5 Blog / 233 Wiki，四 Locale Search Projection 各 238；Translation Provider Request 与 Cost 均为 0。
三个历史排队 Content Sync 已顺序处理，其中中间无效 Snapshot `f7f999fde2eea25552d76d6e48fd64b68a9b92bb`
按契约失败，随后最新 Snapshot 成功，Backlog/Running/Expired Lease 均为 0。该记录仅触发有解释、自动过期的
`ApplicationJobStuck` warning；最终 Observability Snapshot 的未解释 Critical Alert 为 0。

每日 03:05 HKT Backup Timer 自 2026-09-07 起连续运行；最终验收时最新有效 Differential Backup
`20260907-090610F_20260911-190514D` 的 AList Primary、R2 Off-site 与 WAL 均为 `fresh`。真实隔离 Restore Drill、
PITR、Control-state Integrity/Audit Continuity、Blue/Green 与 No-rebuild Rollback Rehearsal 均通过。

最终验收发现 2026-09-09 22:43 HKT Docker Daemon 重启后内部 Loopback OpenResty 未恢复，公网入口因此返回
502。2026-09-12 恢复同一容器后，PR #19 / main `9fac07ea1e195db63a30becc02ecb740f3216106`
把该唯一入口改为 `restart: always`；生产 Compose 已与该 Commit 同步，现有容器以零停机方式更新 Restart Policy，
Container ID 与 StartedAt 均未变化。PR 与 `main` 两轮完整 Quality Gate、169 Unit、Production Foundation/
Recovery/Blue-Green、Application Integration、11 E2E、7 Migration、Build 与 Security Gate 全部通过；公开 Home、
Blog、Wiki、Start、More、Music、Stats、四 Locale、代表文章、Search、Asset、Health/Ready/Version 和安全头均通过。

Owner 于 2026-09-12 明确接受最终 Compatibility/Operations Report 并批准关闭旧 Nuxt Rollback Window。
关闭不删除旧仓库、旧数据、Backup、Image 或 V2 Previous Slot；旧 Nuxt 不再是正式 Production Rollback Target。
Owner 于 2026-09-12 完成最终上线后明确启用 `PRODUCTION_DEPLOYMENT_ENABLED`；ADR 0022 后默认路径收敛为 Web Repository 直接 Push
进入 `main`，只有完整 Quality Gate 成功才自动构建精确 SHA 的四个不可变 Image，并通过同一 Shared Deployment
Engine 执行 Blue/Green、Pre/Post Smoke 与受控 Cutover；失败保持当前槽位且不得绕过 Gate。Manual Deploy/Retry 继续
调用同一实现。Canonical Content Repository 的 Push Workflow 与 Production Polling 已启用，Content Push 会自动进入
Content Sync，但不会触发 Next.js Image Build 或 Blue/Green Deployment。
完整最终证据见 `docs/development/phase-18-completion-report.md`。本阶段上下文已沉淀；Phase 18 是本计划最后阶段，
不存在待自动开启的下一 Phase。

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描旧仓库。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有仓库内证据无法回答一个明确、具体的 Legacy 行为时，才定点只读检查并把后续必需事实沉淀回 V2。Phase 18 再按 Gate 从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。

## 9. Personal tracker restoration — 2026-09-12

Owner authorized restoring both `/tech-footprint` and `/weight-loss`, discarding all legacy Blob records, and minimal shared login with editing enabled immediately after authentication. ADR 0021 records the scoped browser-session contract; implementation/activation/acceptance details are in `docs/development/personal-trackers.md`. Technical catalog: 10 stages / 46 tasks / 231 subtasks; weight plan: 35 weekly slots / 18 milestones, with no legacy measurements. PostgreSQL migration 0007 only creates isolated owner sessions and missing empty datasets; existing records are not overwritten. Public reads bypass indefinite data caching. English roadmap/controls and weight copy are translated; Chinese regional copies use OpenCC. PR #22 delivered the feature; PR #23 added the encrypted verifier and restored six omitted R2 off-site fields from a trusted encrypted source whose values hash-matched the running deploy agent; PR #24 added scoped `control-api` reconciliation; PR #25 added scoped versioned migrations and allowed owner-session DELETE through the internal gateway. Their PR and `main` Quality Gates passed. Production now runs Web and `control-api` release `4a44c2d188beef067216d3d6c08c497bd779b6cd`, migration count 8, and both empty datasets at revision 1 after payload-preserving write smoke. ADR 0022 后，后续 scoped reconciliation 应读取 Host-local `.env`，不再依赖 SOPS source。Public smoke proved anonymous read-only behavior, authenticated writes for both datasets, secure session Cookie flags, cross-origin denial, logout and revoked-cookie replay denial; diagnostic sessions were removed afterward. A production-only bind-mount finding showed that atomic host-file replacement plus process reload retained the old OpenResty config inode. The replacement config was validated in a disposable container before a gateway-only recreation restored DELETE, and PR #26 makes that reconciliation durable. No legacy Blob endpoint or data was used. This corrects the earlier Phase 16 row that overstated complete Owner Edit support.

## 10. Deployment simplification — 2026-09-13

Owner 明确保留完整 Blue/Green，但简化日常操作为“本地直接 push `main`”。ADR 0022 已接受：`.github/workflows/release.yml` 是 Web Repository 唯一默认 Release Workflow，按 `resolve-release -> quality-gate -> build-and-publish-immutable-image-set -> shared-control-plane-blue-green-deployment` 顺序运行；`quality.yml` 与 `deploy.yml` 已移除。失败的 Quality/Build 不会产出可部署镜像，失败的 Deploy 不切换 Active Slot。

Production Secret 手工 Source of Truth 改为部署根目录 Host-local `.env`，默认路径 `/etc/tungchiahui/.env`，真实文件必须 `root:root`、`0600`，且只在生产主机和 Owner 明文备份中存在；不得放入仓库、GitHub Actions、Image、Docker Build Context、Public 目录、日志或 PR 文本。ADR 0023 进一步收紧运行时边界：Compose 只把它作为插值输入，各 Service 通过显式 Allowlist 获得自身配置；`deploy-agent` 只用固定 Web Runtime Allowlist 创建新 Slot，不继承旧 Template 的未知变量。修改 `.env` 后，需通过既有 provisioning/reconcile 重启受影响服务再依赖新值。

`./site deploy <sha>` 仍保留为人工重试/指定版本入口；未显式传 `--image-digest` 且没有 `SITE_DEPLOYMENT_IMAGE_DIGEST` 时，会从批准 GHCR Repository 解析 Web Manifest Digest。此任务没有 PostgreSQL/Drizzle schema 变更，因此没有新增数据库 Migration；需要的变更集中在 GitHub Actions、deployment control client、Ansible/Compose secret injection、asset backup env 读取、测试与运维文档。

## 11. Unified accounts and Start datasets — 2026-09-14

Owner and user now share PostgreSQL-backed accounts and browser sessions. Account rows carry the closed `owner | user` role; owner-only writes protect the site-wide technology and weight datasets, while each account receives an isolated `app.start_datasets` row with revision-checked updates. Migration `0008_accounts_and_start_data` removes existing owner accounts and sessions so a new owner can be created explicitly with `./site account create`; development seed creates only the disposable local owner. Anonymous `/start` renders validated defaults and cannot mutate data. The `/start` client no longer stores user content in localStorage. This stage context is recorded and ready for authorization of the next phase.

## 12. Account activation incident and CI repair — 2026-09-14

Historical findings before activation (resolved as recorded in section 13):

- `/api/ops/auth/session` returns HTTP 404. The independent `control-api`, `deploy-agent` and
  stopped `database-migrate` runner still use release `3d0aaacd9b4ee0a98feaaad483d52e21daef8168`.
- Web release `7398339eae359068e51cfb186602b86bd822e273` passed Actions run `34810146007`, but
  Web cutover did not upgrade those independent services. The workflow publishes four images and
  passes only the Web digest to the engine. Do not claim that a Web push updates the account API.
- The production Drizzle journal initially had eight rows, ending at timestamp `1789225384076`
  (0007), while all three 0008 account relations already existed. They are owned by bootstrap role
  `tungchiahui`, and one owner account exists. Earlier manual SQL application did not record 0008
  in the journal. After read-only object/constraint/index/privilege verification, an authorized,
  advisory-locked transaction inserted only the immutable 0008 hash/timestamp into the journal on
  2026-09-14; it did not replay SQL or delete owner/session data. A subsequent advisory-locked
  transaction transferred the three 0008 tables and `account_auth` schema to `site_migrator`,
  because the original manual apply left them owned by the bootstrap role. The production journal now
  has nine rows and matches the checked-in artifact. Do not replay its owner-deletion statements.
- Run `34820479592` for `f2676c6ccc64ee46a731503c82f9425f8fa3ab28` failed in the production
  foundation suite: the service fixture image lacked `SITE_DEPLOYMENT_SHA`, so the new migration
  image guard rejected its empty OCI revision. That run never built or deployed a production image.
- Run `34839727251` for `1a2ed8723d84d193ad4beccff112829999beaa36` reached production deployment but
  failed with `permission denied for table accounts`. The 0008 objects were owned by `tungchiahui`,
  while the migration runner correctly uses `site_migrator`; ownership was repaired transactionally
  after verifying the schema. Independent service reconciliation was still required before retrying.

The local CI repair supplies the same service/recovery SHA build arguments as release.yml,
recreates a verified migration runner by immutable image ID, and scopes account-relation validation
to migration targets that include 0008. Regression coverage rejects missing/empty/wrong image
revisions despite misleading container labels, checks immutable runner recreation, permits the
historical schema fixture and rejects missing latest-schema relations with an otherwise valid journal.

At that point the remaining production work was to activate the reviewed independent service and
deployment-agent images through the existing scoped provisioning mechanisms; then verify account
login/logout, per-account isolation, owner tracker writes and signed Operator status. Preserve the
existing owner and both Web slots. No production mutation or push is part of this CI-repair checkout.

The scoped provisioning path was corrected after the failed run: it now force-recreates the stopped
`database-migrate` runner before executing reviewed migrations, then reconciles both `control-api`
and `deploy-agent` in the same Compose project while leaving Web slots untouched. This closes the
known stale-runner/agent gap in the activation procedure; production still requires an authorized
scoped reconciliation and post-activation account smoke before activation can be declared complete.
The image guard is a rejection mechanism, not automatic service release coordination. Do not mark
login or future cross-service deployment alignment as fixed until those rollout gaps are resolved.

Local verification for this CI repair passed using Node 24.19.0 and pnpm 11.23.0: `./site check`
(Biome, source/workflow policy, Drizzle, typecheck, Renovate, production build, static security),
191 unit tests across 38 files, production foundation/blue-green/rollback/IPv4+IPv6/server migration
and image Critical/Secret scans, full/differential/incremental backup and PITR/recovery tests,
disposable integration with seven S3Mock cases and 12 E2E tests, and the nine-migration suite with
historical upgrade and missing-relation regression coverage. All test processes exited zero and
used disposable local targets. Biome retains six pre-existing unused-state warnings in
`bookmark-workspace.tsx`. This local result does not change the failed GitHub run or activate production.

## 13. Deployment retry incident resolved — 2026-09-15

Production release `89c17113ce89e9d54f3ab21abdb1d30a8aedcf30` was deployed by the existing signed
Operator API and shared deployment engine. Operation `9088f683-39db-4d72-98f4-b3ab24ff92e3`
completed as `deployment-verified` at 12:43:31 UTC. Public `/api/version` reports this SHA on Green;
the previous Blue container remains healthy. Control API and deploy-agent use the same release,
the migration journal has nine rows, and public owner login, Start read and logout returned HTTP 200.

Repeated GitHub attempts were returning operation `ab3d46f8-e619-4b7b-b301-c43b985fae9a`, created
and failed at 12:09:30 UTC. They did not execute Docker again. The fixed release-only idempotency
key kept replaying the original socket EACCES after its group was repaired. The client now includes
GitHub run ID/attempt, or a UUID for each explicit operator invocation. Regression coverage verifies
same-attempt deduplication and that a new attempt can be claimed without rewriting failed history.
Run `34934142023` remains failed because its historical checkout uses the old client; do not claim
that the later successful Operator deployment changed that Actions result.

The host Docker socket group is 989, obtained from its actual metadata. Earlier manual reconciliation
incorrectly supplied 999. The read-only socket mount is restored; Docker API access and a full
deployment succeeded with that mount. Changing it to read-write was unnecessary. Earlier claims
that the old service caused HTTP 554 were not established; the available log only proved a 554
response. Similarly, `./site provision` only queued a server-migration operation and was not a working
scoped Ansible upgrade path. That unused operation was closed with an audit record.

This retry fix does not implement automatic independent-service release coordination. The prepared
migration runner must still match the next release SHA before deployment; ordinary Web push alone
does not reconcile control-api/deploy-agent. Keep the existing scoped Ansible path and inspect actual
operation timestamps/status before diagnosing a rerun. No new database migration is needed.

Local verification of the retry fix passed with Node 24.19.0 / pnpm 11.23.0: full `./site check`
and `./site test` exited zero, including 194 unit tests in 38 files, real Docker/Ansible foundation
and blue-green/rollback/server-migration tests, recovery/PITR drills, integration/S3Mock, 12 E2E
tests and the nine-migration suite. Six existing Biome warnings remain in bookmark-workspace.tsx.
Temporary diagnostic env copies were removed from the production host; the canonical `.env`
remains root:root 0600. The retry change is committed locally only, not pushed or activated in the
historical GitHub workflow. 本阶段上下文已沉淀，可以授权/开启下一阶段。

## 14. Automatic target migration image selection — 2026-09-15

The shared Docker deployment adapter now validates the target Web Digest, reads the Service Digest
bound into that Web Image Label, resolves the paired approved `-service@<digest>` image, pulls it
when absent locally, verifies its OCI SHA and service repository digest, and pins its immutable
image ID for runner creation. Validation runs in preflight before replacing either
Web slot or discarding the retained rollback target. Docker HTTP 200 progress-stream errors fail
closed without exposing registry response text. Migration policy/backup/lock/journal checks still
run inside the target image; this change adds no SQL migration and does not replay 0008.

Regression tests include a stopped runner with an older OCI revision, a missing target service
image, an incorrectly labeled target image, explicit registry pull of the correct image, account
preservation and successful cutover/rollback. The old fixture had pre-aligned all service images,
which could not expose this production release-skew bug. Unit tests also verify HTTP/stream pull
failures, registry credential handling, immutable runner identity and retained rollback state.

The production agent remains `89c17113` until explicit activation of the reviewed new recovery
image. Merely pushing the new code cannot update that agent. The ordered bootstrap is documented
in `docs/operations/deployment.md`: pause automatic deployment before the authorized push, pass
Quality/build, reconcile the exact published service/recovery images with the existing scoped
Ansible path, verify independent services and unchanged Web slots, then restore automatic deploy
and deploy through the corrected shared client. Do not repeat the earlier incomplete provisioning
or unverified environment reconstruction. Normal later releases automatically align migrations;
independent API/agent changes still require scoped rollout. No production operation or push was
performed while implementing this fix.

Final local validation passed with Node 24.19.0 / pnpm 11.23.0: `./site check` and `./site test`
both exited zero, including 204 unit tests in 38 files, real Docker/Ansible deployment and migration
image failure/upgrade tests, blue-green/rollback/server-migration, image security scans,
backup/PITR/recovery, application integration/S3Mock, 12 E2E tests and the nine-migration suite.
The final deployment assertions were also rerun independently (28 tests passed). Six existing
Biome warnings in bookmark-workspace.tsx remain; no new warning was added. The implementation is
committed on main only; there is no new GitHub Actions result until an authorized push/dispatch.
本阶段上下文已沉淀，可以授权/开启下一阶段。

## 15. Protected GitHub OIDC mismatch diagnostics — 2026-09-20

Runs `35042695623` and `35047154653` did not build or deploy the diagnostic change: the first failed
Biome formatting and the second failed TypeScript because an optional `AuthenticationError.details`
property was assigned a possibly undefined constructor argument under
`exactOptionalPropertyTypes`. The implementation now assigns the property only when details exist.
It also fixes the deeper propagation defect: policy-specific mismatch details were previously caught
and discarded while iterating the configured policies, so the outer HTTP audit still received a
generic denial. Authentication now retains only the closest strict-policy mismatch and carries its
allowlisted five GitHub identity claims into the protected SQLite Control Audit. The client response
remains only `github_oidc_policy_denied`; JWTs, Authorization/Cookie headers, arbitrary claims and
Secrets are excluded from the audit and ordinary telemetry.

Historical run `34977257435` is not evidence that push OIDC succeeded because its Deploy Job was
skipped. Push run `35041813617` did complete the protected deployment job and deployed Web
`28b8c9569cdfc08618e37b631bce74e130cb9caf`; manual run `34983703885` reached the same job and was
denied. Public `/api/version` identifies only the Green Web slot and cannot identify the separately
provisioned `control-api`. A normal Web deployment does not activate this diagnostic. After the exact
reviewed service image is published, production evidence still requires Owner-authorized scoped
`control-api` reconciliation, followed by one new `workflow_dispatch` and authorized inspection of
the protected audit. Until those actual values are obtained, repository, `refs/heads/main`,
`production` Environment and reviewed workflow identity remain unchanged. No migration is added and
`0008_accounts_and_start_data` must not be replayed.

Unit coverage verifies details and no-details authentication errors, closest-policy propagation into
Control Audit, generic client responses, and negative leakage checks for the JWT, Authorization,
Cookie, passthrough Secret claim and Secret values. No production reconciliation, host-local `.env`
change, policy relaxation or historical operation rewrite is part of this repository change. Final
local validation with Node 24.19.0 / pnpm 11.23.0 passed `check:biome` (only the six existing
`bookmark-workspace.tsx` warnings), TypeScript, 205 unit tests, five repeated personal-tracker E2E
runs, full `./site check`, and full `./site test`: production foundation/blue-green/migration-image
and workflow policy, recovery/PITR, disposable S3Mock/application integration with 12 E2E tests,
and all nine migrations. 本阶段上下文已沉淀，可以授权/开启下一阶段。

## 16. Deployment simplification hardening — 2026-09-20

A focused review found that ADR 0022 simplified the operator source of truth but accidentally widened
runtime privilege: almost every container received the complete host `.env`, and new Web slots kept
arbitrary environment entries from their template container. ADR 0023 keeps the single host-local
source while restoring service-scoped injection. Compose now uses `--env-file` only for interpolation;
every runtime declares an explicit environment Allowlist, and the deploy adapter constructs Web Slot
environment only from the reviewed Web keys. Removed or unrelated values cannot survive through the
template. No production Secret value was read or changed while implementing this correction.

The same review closed three release-consistency defects. The Web Image now carries the exact Service
Image Digest, so migration preflight selects `-service@<digest>` after validating the Web RepoDigest;
a moved SHA Tag can no longer change the runner. The scoped independent-service reconciliation now
updates `control-api`, `content-worker`, `observability-agent` and `deploy-agent` as one reviewed unit.
Content revalidation and Web readiness checks go through an internal-only OpenResty listener that uses
the active-slot configuration, while the public listener still hides `/api/internal/*`.

Production rollout preflight additionally found that newly created Web containers inherited the
template Slot's image-derived OCI labels even while running the requested new image digest. Runtime
identity and `/api/version` remained correct, but Docker inspection could show a stale revision. The
deployment adapter now overlays labels from the validated target image on the template's Compose
labels and then sets the target service name, so revision and paired-service metadata remain truthful.

`release.yml` now rejects an automatic Push Release that is no longer the current `origin/main`, and
its final fail-closed job prevents a skipped deployment from appearing as a complete release. Workflow
policy tests validate job structure as well as critical command fragments. The GitHub OIDC policy stays
strict and unchanged; actual five-claim evidence is still required before any policy adjustment. The
GitHub `production` Environment now permits deployments only from the `main` branch; repository branch
protection remains unchanged because the direct-to-`main` release model has no pre-push check to require.

These changes alter independent service/recovery images and production Compose topology. They are not
active merely because a Web image is deployed. The reviewed Image Set must first be published with
automatic deployment suspended, then an Owner-authorized scoped reconciliation must activate the full
independent-service unit while proving Web container IDs and traffic remain unchanged. Only afterward
may automatic deployment be restored and a fresh dispatch collect protected OIDC audit evidence. No
production host operation, host-local `.env` mutation, Secret rotation, OIDC relaxation, migration
replay or historical operation rewrite is authorized by this repository state.

Final local validation used the pinned Node 24.19.0 and pnpm 11.23.0. `check:biome` passed with only
the six pre-existing unused-state warnings in `bookmark-workspace.tsx`; typecheck, 212 unit tests,
workflow policy, Drizzle, Production Build and static security passed. The requested personal-tracker
spec passed five consecutive Chromium repetitions after starting the supported local stack. Full
`./site test` passed production foundation/Ansible/blue-green/digest binding/image scans, full/diff/incr
backup plus WAL/PITR and off-site fallback, seven S3Mock contract cases, 12 E2E flows and all nine
migrations. The local stack was stopped afterward with data preserved. The initial direct Playwright
attempt reached no server and failed only with connection-refused before assertions; the correctly
provisioned rerun is the functional result. 本阶段上下文已沉淀，可以授权/开启下一阶段。

## 17. Scoped reconciliation retry convergence — 2026-09-20

The authorized production bootstrap exposed three retry/diagnostic defects without changing Web traffic.
The first scoped attempt copied the reviewed Compose/OpenResty topology and then stopped before any
migration because the production Docker daemon timed out during a GHCR TLS handshake. Ansible did
not flush the notified OpenResty handler on the failed play. The next idempotent attempt saw the file
already present, so no new notification was emitted; the independent services became healthy at
`1d740bd06cbf662400a031cfee8fa36478878475`, but the running gateway still lacked the internal-only
revalidation listener. Both Web container IDs and public `f2f82369` blue traffic remained unchanged.

Scoped reconciliation now compares the current Compose/OpenResty fingerprint with a success marker,
schedules missing convergence, and flushes it before migration or independent-service replacement.
The marker is written only after validated gateway recreation, making a failed attempt self-healing
while keeping a successful repeat at zero changes. Migration-runner preparation and the final
independent-service Compose convergence use bounded retries for transient registry/network failures;
the journaled migration command itself is not blindly retried. Tests assert the ordering, retry
bounds and four-service unit. No production `.env`, Secret, OIDC policy, historical operation or
database migration was changed, and 0008 was not replayed.

Dispatch run `35495890407` passed Quality and image publication, reached the reconciled control-api,
and was rejected after approximately 15 seconds. The control-api remained healthy with zero restarts
and recorded a generic authentication denial, while the public edge converted the slow 401 into a
non-JSON 554. The protected audit contained no claim mismatch details because verification never
reached the policy comparison: direct production-host probes to GitHub's OIDC discovery/JWKS host
timed out, and host DNS resolved that name through an unroutable proxy/fake-IP path. Therefore this
run is not evidence of any `repository`, `ref`, `environment`, `workflow_ref` or `job_workflow_ref`
difference, and OIDC policy remains unchanged.

Authentication now preserves non-policy failures across the multi-policy loop instead of always
relabeling them as `github_oidc_policy_denied`. A remote JWKS network/timeout failure becomes the
generic `github_oidc_verification_unavailable` service response; only a token that passed signature,
issuer, audience and claim-shape verification can create allowlisted mismatch details. Unit tests
cover the availability classification, invalid-token preservation, useful policy diagnostics and
negative Token/Header/Cookie/Secret leakage. Production OIDC remains blocked on an Owner-controlled
outbound DNS/proxy correction; no host network, `.env` or Secret change was attempted.

## 18. Single-env runtime convergence and parallel release — 2026-09-22

Owner approved implementing the deployment-simplification and single-`.env` corrections after a
read-only comparison with `sdutvinci_web` and the live origin. The canonical production file remains
`/etc/tungchiahui/.env`, `root:root`, `0600`; copying the other site's user-owned placement would
weaken this repository's recovery/control-plane boundary. Owner-managed non-secret policy now lives
beside the Secret values in that one file. Ansible inventory/defaults retain only bootstrap, host
facts, dynamic container identities and exact release images, so it can no longer silently override
polling or other policy after `.env` validation.

The strict schema rejects duplicate and unknown keys. `./site production doctor` checks file and
derived-secret metadata/content plus every running service against the Compose environment Allowlist,
reporting only service/key/problem type. Separate export/restore commands create a validated age-
encrypted off-host recovery copy with a Recipient that must differ from the production backup key;
both commands refuse overwrite. ADR 0024 records these controls and requires a one-time two-slot
runtime convergence because legacy containers are not fixed merely by installing new Compose.

`release.yml` preserves every merge gate but runs five independent quality groups in parallel behind
the stable fail-closed `quality-gate`. PostgreSQL, Recovery and Service images build in parallel with
Buildx/GitHub cache; Web then binds the exact Service Digest, and a manifest aggregation job validates
all four digests before the existing OIDC shared-control-plane deployment. No `latest`, server polling,
production credential in Actions, or gate relaxation was introduced. Exact duration remains dependent
on hosted-runner cold start and the slowest full gate; five minutes is not treated as a safety promise.

本阶段上下文已沉淀，可以授权/开启下一阶段。
