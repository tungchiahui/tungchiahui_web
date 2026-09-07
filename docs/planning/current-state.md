# Website V2 Current Implementation State

> Status: Phase 0–17 completed
> Current Phase: Phase 18 in progress — V2 public cutover active; recovery/stabilization gates pending
> Handoff audit date: 2026-09-07

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
| 12 — Production Foundation | `feat(infra): complete phase 12 production foundation` | Ansible、Hardened Compose、SOPS/age、OpenResty、DB Login Boundary 与 Verification | PASS；idempotent provision、IPv4/IPv6、Next/PostgreSQL-down control route、privilege separation |
| 13 — Tested Recovery | `feat(recovery): complete phase 13 tested recovery` | pgBackRest、WAL/PITR、Remote 副本、Control-state、PG-independent/Break-glass Recovery 与 Verification | PASS；disposable restore/PITR、S3、PG-down、SQLite continuity gates；Phase 18 ADR 0018 恢复双副本 Policy |
| 14 — Shared Blue-Green Deployment | `feat(deploy): complete phase 14 blue-green engine` | Shared Engine、SQLite V5、Migration/Smoke、Atomic OpenResty、Rollback 与 Verification | PASS；Production-like blue-green/failure/crash/PG-down/no-rebuild rollback gates |
| 15 — GitHub OIDC Deployment Automation | `feat(ci): complete phase 15 oidc deployment automation` | Quality/Deploy/Content/Translation Workflows、OIDC Policy、Registry Digest Pull 与 Verification | PASS；workflow boundary、claims、supply-chain、concurrency、Production-like shared-engine gates |
| 16 — Observability、Security、Production Readiness | `feat(ops): complete phase 16 production readiness` | Structured Telemetry、Read-only Observability Agent、Security/Rotation/Runbook、Gap 与 Verification Report | PASS；alert lifecycle、failure diagnosis、load、secret/SBOM/Critical scan、full regression gates |
| 17 — Planned PostgreSQL / Server Migration Readiness | `feat(ops): complete phase 17 migration readiness` | Shared Migration Engine、Same-major Physical Streaming、Control-state Transfer、AAAA-only Cutover、Runbook 与 Verification | PASS；idempotent target provision、final WAL、controlled promotion、no-data-loss、safe abort/non-writing rollback gates |

`implementation-plan.md` 中 Phase 0–17 的 Checklist 与 Overall Progress 已完成。Owner 已在
2026-09-06 明确授权 Phase 18；当前只执行 Phase 18。Production Provision、初始业务 Migration、
Owner 执行的 1Panel/EdgeOne Public Cutover 与最终 Canonical Content Sync 已完成；Fresh Backup、
Restore Drill、完整 Compatibility/Public Smoke 与 Stabilization/Rollback-window Gate 尚未完成。

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
- Phase 12 新增 digest/Git-SHA-pinned Production Image、Next Standalone Runtime、Ansible Inventory/Role/Playbook、Hardened Compose、SOPS + age Secret Injection 和 dual-stack OpenResty。Production-like Gate 在临时 Host Root 上两次 Provision，第二次 `changed=0`；实际容器证明 Non-root、Readonly Root、Drop-all Capability、Socket/Network Separation 和无 Secret Layer。
- OpenResty 在 Active Slot 选择前将 `/api/ops/*` 直接送入独立 `control-api` 并强制 `no-store`；IPv4/IPv6 使用同一配置，两个 Next Slot 全停或 PostgreSQL 停止时仍返回控制面的预期认证响应。Inventory 只保存 Owner 已有的 `Debian` SSH Alias，内部只使用 Docker Service DNS。
- Production 数据库使用不同 `*_login` 身份，经 Hardened One-shot Bootstrap 绑定到 `site_app`、`site_control_api`、`site_content_worker`、`site_migrator` NOLOGIN Group Role；Runtime Service 不共享 PostgreSQL Bootstrap Identity。
- Control-state SQLite 已 Additive 升级到 Version 7：Version 5 保留 Backup/Deployment 状态，Version 6 新增 Provider-neutral `offsite_replica_status`；Version 7 会把升级前仅实际写入 R2 的历史记录标记为 Primary `pending` 且 `valid=false`，防止它们被新双副本策略误判。既有 `primary_replica_status` 与 `offsite_replica_status` 现由 ADR 0018 共同记录双副本状态。一致 Snapshot 执行 WAL Checkpoint + `VACUUM INTO`，记录 Integrity/Schema/Environment/Active-Previous SHA/Audit Digest，经 age 加密后复制到 AList Primary 与 R2 Off-site，并可验证/原子恢复。
- pgBackRest 2.59.1 固定在 PostgreSQL/Recovery Image；Production Policy 为 encrypted Local Repository、Full/Differential/Incremental、WAL/PITR、2 Full/4 Differential/2 Full-range WAL Retention。Phase 11 Evidence 不足以证明 Direct AList Repository，因此 Phase 13 采用逐文件/符号链接 SHA-256 Manifest 的 Local Repository + Verified Sync。
- ADR 0018 是当前 Recovery 权威决策：`ASSET_S3_*` 与 `BACKUP_S3_*` 指向同一 AList Bucket/Pair，Recovery Artifact 固定在根目录 `backups/`；`BACKUP_OFFSITE_S3_*` 指向 R2 整桶副本。只有本地 pgBackRest/WAL 与双端完整读回均通过才把 Backup 标记 `valid=true`；Restore 优先 AList 并在失败时回退 R2。
- `./site backup --environment ... --type ... --reason ...`、`backup status` 与 `restore <id-or-time> --environment ... --confirm ... --reason ...` 使用独立 Control API/SQLite；PostgreSQL Down 时仍可 Create/Query/Claim。Control API Down 时显式 stable-inventory SSH Break-glass 仍写入同一 SQLite/Audit 并由同一 Agent/Lease/Engine 执行。
- Phase 14 在既有 `deploy-agent` 内加入独立过滤的 Deploy/Rollback Claim 与唯一 Shared Engine；Recovery/Restore Claim 保持原边界。Engine 只接受完整 Git SHA + 固定 Digest，逐次校验实际流量 Release 必须匹配 Durable Current 或完整 Pending Intent，拒绝重复部署 Active Release，并执行 Inactive Lifecycle、least-privilege Migration、完整 Pre/Post Smoke、OpenResty Validate/Atomic Rename/HUP 与 no-rebuild Rollback。
- `./site deploy/rollback/status` 和 `/api/ops/deployments|rollbacks|status` 复用同一 SQLite Operation、Capability、Idempotency 与 Engine。Deploy/Rollback 并发互斥但不消耗 Recovery Queue；PostgreSQL Down 时仍可创建/查询/Claim，并在 Migration Dependency 明确失败且保持 Active Slot。
- Production Compose 分离 Blue/Green Image/SHA，加入停止的一次性 `database-migrate` Runner、Deployment-probe Internal Network 和 deployment-owned Dynamic Config Directory。只有 `deploy-agent` 有 Docker/Config Mutation Capability；OpenResty Read-only 观察原子 Rename，其他 Service 仍无 Socket。
- Production Migration Runner 使用 `site_migrator_login`、Advisory Lock、Drizzle Hash/Journal、Expand-only Policy 与 Fresh Off-site Backup Evidence；不持有 Admin Role-bootstrap/Extension Capability。Previous Slot 在显式 Stabilization Window 内保留。
- Phase 15 固化 `quality.yml` 为 PR、Merge Queue 与 `main` 的唯一 Quality Gate；只有成功的同仓库 `main` Push Gate 或经成功 Gate/Main ancestry 验证的显式 SHA 才能 Build/Publish 完整 SHA Tag，并由受保护 `production` Environment、单一 non-cancelling Concurrency Group 和 GitHub OIDC 调用 `./site deploy ... --wait`。
- Control API OIDC 配置现为严格 Policy Array：Deployment、Manual Translation 与 canonical Content + reviewed reusable `job_workflow_ref` 各有独立 Claims/Capability。Workflow 没有 Production DB、AI、Host Login/Root、Origin Registry Pull 或 Docker Socket Credential；所有第三方 Action 固定完整 Commit Digest。
- `deploy-agent` 可从唯一 Approved Registry 按 Manifest Digest 受控 Pull，并验证精确 `RepoDigest` 与 OCI Git Revision；Candidate 单独记录 Manifest Digest，不再与 Docker Local Config ID 混淆。Rollback 只验证已运行 Retained Container，不 Pull/Build。
- `content-sync.yml` 只能被 reusable `workflow_call` 调用，验证完整 Canonical Source Commit 后通过 `./site content sync` 创建 PostgreSQL Job；不 Build/Deploy/Translate。`translation.yml` 保持 typed manual-only OIDC Job Trigger。
- Phase 16 统一 TypeScript JSON Telemetry Envelope、Request ID、错误/敏感字段 Redaction 与 OpenResty 安全 JSON Access Log；日志不包含 Query、Client IP、Authorization、Cookie、Connection String、Private Key 或 Token。Next/OpenResty 同时施加 HSTS、CSP、MIME、Referrer、Permissions、Frame 与 COOP Policy，TLS 只允许 1.2/1.3，Public/Control 使用独立 Rate Zone。
- 独立 `observability-agent` 以只读、无业务 Credential、无 Docker Socket 身份监控 Public/Direct-origin、IPv6、Next、Control、Worker、Deploy Agent、PgBouncer、S3 Representative Object、Host Disk/Inode，以及 PostgreSQL Job 与 SQLite Operation/Backup/WAL/Off-site/Restore Evidence。PostgreSQL Down 时 SQLite Integrity/Audit/Recovery Evidence 仍可观测；Alert 具有 Firing/Noise-suppression/Resolved Lifecycle。
- Production Runtime 使用固定 Alpine Node/OpenResty Digest，移除 Runtime npm/corepack/yarn/gosu；Recovery Image 以固定 Go 1.25.7 Builder 构建，Phase 18 已将 age 更新至 1.3.2。固定 Trivy 0.74.0 对六个 Runtime Image 生成 CycloneDX SBOM 并执行 Critical/Secret Fail-closed Scan；Production npm Audit 与 Repository/Bundle/Image Scan 同属 Gate。
- Production Web Root 保持 Read-only，只有 `/tmp` 与 `/app/.next/cache` 为明确 tmpfs。PostgreSQL 故障演练恢复时必须先等待 PostgreSQL Healthy，再重启 PgBouncer 与 Web Slot，防止失败的 Backend/DNS Pool State 污染 Readiness。
- `./site provision` 与 `./site migrate-server` 通过独立 Control API 创建排他的 `server-migration` SQLite Operation；Stable Target 在 CLI/API/Engine 三层拒绝数字 IP。唯一 Typed Engine 记录 Provision、PostgreSQL 18 Physical Streaming、Abort Gate、Candidate Smoke、Final WAL、Control-state Transfer、Promotion、Application/Origin Cutover、Post-switch Verify 与 Non-writing Rollback Evidence。
- Phase 17 Production-foundation Gate 用同一 Ansible/SOPS/age/Hardened Compose 从零重建第二个 Disposable Target，第二次 Provision `changed=0`；真实 Base Backup/WAL Streaming、Final LSN、Controlled Promotion、三阶段数据 Probe、Target Write、Old-source Stop、SQLite Snapshot/Reconcile 和 AAAA-only Public-like Smoke 全部通过。
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
| Owner Dataset | validated PostgreSQL public read + Phase 4 authorized CAS write；Phase 16 Trust/Privacy Review 为 CONTROLLED | completed in Phase 16 |
| Observability Alert Sink/Production Asset Probe | production-shaped read-only agent、HTTPS-only optional sink 与固定 Representative Object Contract；真实 Webhook/Object 未启用 | Phase 18 authorized activation |
| Shared Deploy/Recovery Agent | Phase 14 Engine + Phase 13 Recovery + Phase 15 OIDC/Registry automation binding；真实 GitHub/Production Trigger 与 Public Cutover 未启用 | Phase 18 authorized activation/cutover |
| Server Migration Platform Binding | Phase 17 typed/audited Engine + complete disposable Adapter；真实 Target Inventory/SSH Secret/DDNS Provider/Primary 未绑定 | Phase 18 Owner-authorized activation only if migration is actually required |
| Fake Translation Provider | isolated deterministic default for Local/Test; production must inject a validated paid adapter | retained permanent test boundary |

## 6. 已知限制与踩坑

- Host default Node/pnpm may differ; repository requires exactly Node `24.19.0` and pnpm `11.23.0`. Do not loosen `./site` guard.
- Phase 12 Infrastructure Gate 自带锁定的 Node/pnpm、Ansible Core、Compose、SOPS 与 age Runner；下载的 Operator Binary 先按提交的 SHA-256 校验。不要改用 Host 漂移版本，也不要删除真实 SOPS/age 验证。
- Managed sandbox blocks `tsx` IPC/local HTTP and Turbopack worker ports. Verification used the exact toolchain with allowed local execution. `build` uses `next build --webpack`; this is still the approved Next.js stack.
- Next Cache serializes `Date`; every cached public document is reparsed with coercion before use. Do not bypass this boundary.
- Local Compose must quote the all-zero development SHA. Next dev explicitly allows only loopback `127.0.0.1` for the disposable browser origin.
- Playwright uses one worker because the suite intentionally shares one mutable Disposable PostgreSQL/cache lifecycle, including a mid-run revalidation mutation。
- `content-worker` side-effect replay depends on Hooks being idempotent. Translation/Search implementations preserve exact-input idempotency and must not turn Public requests into paid/provider calls.
- PostgreSQL migrations are now seven. `0006_phase18_content_aliases` 是低风险 Additive/Relaxation Expand：把 Alias Namespace 从 Wiki-only 扩展到明确的 Blog-or-Wiki，不重写任何 Row，保持旧应用兼容。`0005_phase10_pgroonga_search` 继续新增可重建 `search_documents`、Locale/Type B-tree 与 Multi-column PGroonga Index；不得修改任何已应用 SQL/Metadata。
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

## 7. Phase 18 Activation State

- Owner 已授权 Phase 18 Production Work，同时确定部署操作由 Owner 在服务器执行，Agent 提供逐步命令、验证和诊断；不要使用聊天中出现的明文 Credential 自动登录。
- Start from the focused Phase 17 commit and a clean tracked worktree；`.env.local` remains Owner-owned、Gitignored and must never be staged.
- Phase 18 Final Legacy Delta/Inventory Refresh 已纠正并固化在 `docs/migration/phase-18-legacy-delta.md`：Legacy `feee48b1685e7cab8fed84941bff9e58fc32491c` 相对 Phase 0 有 1 篇 Blog 新增、8 篇 Markdown 修改与 Blog Route Helper 变更；Page/Component/ROS2 Tree 未变化。当前 5 Blog + 233 Wiki 的 238 个 Frontmatter/Route 均有效，Current Legacy/V2 全量 Route 无 Collision/Mismatch。V2 采用当前含日期 Blog Canonical Route，并为 Phase 0 的四条已公开 Blog URL 建立精确兼容 Alias；旧仓库保持只读。
- Legacy GitHub Remote 当前解析为公开的 `tungchiahui/tungchiahui.github.io`。Owner 已明确选择并批准创建独立公开 Canonical Repository `tungchiahui/tungchiahui_content`；其 `main` 激活提交 `db3aad287eabf84b16b44c33957d57c02ae60e9f` 保留过滤后的 126 个 `content/**` 历史提交与当前 238 篇 Markdown，并加入只调用 V2 reusable Content Sync 的 Push/Manual Caller。创建与 Workflow-only Push 均未触发 Production Sync，Legacy Repository 保持只读。
- 为回答 Production Secret 传输边界而执行的定点 Legacy 配置检查确认：旧 Nuxt 以 Gitignored、`0600` 的单一明文 `.env` 注入 Compose，Backup/Instance Export 明确排除真实 `.env`、Token 与 Private Key，并要求另存加密 Secret。V2 保留进程所需的 env 注入形式，但由 Controller 上的 SOPS 密文在内存解密、经 SSH/Ansible 拆分安装到 `/etc/tungchiahui/secrets`；SOPS age Identity 不传服务器，Backup age Identity 仅按恢复职责单独安装。
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
- Content Worker 的 GitHub Token 原为空；当前 238 文件的 Tree + Blob API 读取超过匿名每小时 60 次配额。Owner 提供的 Repository-scoped read-only Credential 已只存入 SOPS 密文并安装到 `content-worker_env`；本地验证返回 GitHub Tree `200` 与 authenticated limit，生产 Secret Provision 首次 `changed=3`、`failed=0`，复跑 `changed=0`、`failed=0`。不得把 Credential 值写入文档、日志或提交说明。
- Production Content Sync Job `70c8366e-4aab-4232-807c-59b515465c27` 已从精确 Commit `db3aad287eabf84b16b44c33957d57c02ae60e9f` 一次完成：`filesSeen=238`、`filesChanged=238`、`filesDeleted=0`。数据库为 238 Active/0 Deleted、5 Blog/233 Wiki、单一 Source Commit；Source-hash Mismatch、重复 Source Path 与重复 Route 均为 0。四 Locale Search Projection 各 238；en-US 有 17,566 Pending/Fallback Block，Translation Job/Provider Request/Cost 均为 0。代表 Blog 四 Locale、Wiki、ROS2 Asset 与中文 Search Public Smoke 返回 `200`，`ROS2_Control` 返回 5 条。
- 首次真实 `./site backup` 暴露 CLI 把内部 `kind` Discriminator 原样发送给 Strict Control API；HTTP 400 发生在 Operation 创建前，R2 未写入。PR #6 / main `7e3d529f4f5bfec4ab358acf7e1aa1e30fbb482e` 现由 Recovery Control Client Runtime-validate 并 Strip 为精确 `backupType/environment/reason` Body，完整 PR Quality Gate 通过；该修复只在 Operator Client，不需重启 Production Service。
- Owner 授权的 Fresh Production Full Backup Operation `d08a0e91-9972-440e-aca1-a2a0e535a529` 已以 `recovery-verified` 完成。Backup `20260907-004052F` 为 `valid=true`、Off-site R2 `fresh`、Manifest SHA-256 `382585ce68b4d918767f53471ee01c2ac3cc9cadeb8b628bf5a1284b6f73aabd`、Repository 52,193,008 bytes、实测 676.565 秒，WAL Max `000000010000000000000028`。Control-state Schema 6 Snapshot `b4bc569c-a5ef-4199-b072-a543da702ed5` 已 age 加密上传并从 `control-state/production/latest.json` 读回验证；完成后 Public Readiness 仍为 PostgreSQL `ready`。
- 生产对象盘点确认 AList Asset Bucket 有 3,680 Object / 449,294,509 bytes，R2 中旧 AList 副本初始有 3,687 Object / 449,229,575 bytes；初始为 3,676 个 Key 同名同大小、AList-only 4、R2-only 11、同 Key Size Mismatch 0。Owner 单独授权后，`./site storage backup assets` 已逐对象做双端 SHA-256：3,676 个内容一致、4 个 R2 缺失对象已补齐并逐一回读验证、0 个内容变化、0 个 AList 不可读，11 个 R2-only 历史对象全部保留；版本化 Manifest 为 `asset-backups/manifests/2026-09-07T01-23-15.639Z-3fdba4017ca75f9f896e7dc3517adcf61a0a21ad4e05df4144b30414662bc222.json`。Asset Backup 不连接 PostgreSQL，不读取/覆盖 V2 的 `database-backups/` 或 `control-state/` 内容，并采用 Copy/Add/Update、永不传播 AList Delete 的语义；任何 R2 孤儿清理需单独 Owner 授权。
- Owner 另行明确授权删除 AList Asset Bucket 中空的 `TEST/` Directory Marker；删除前后对精确 Prefix 的 List 均为 0 个对象，Marker 的精确 S3 Delete 已成功。该操作未触碰 R2，符合 Asset Delete 不传播的 Policy。
- 首次 Provision 的 Docker Hub Pull 暴露真实网络前置条件：OpenClash 首条 `SRC-IP-CIDR,10.0.0.0/24,DIRECT` 使 Origin 的 Registry TLS 直连超时。Owner 已将 DNS Redirect 切到 Firewall Redirect，并以 LAN White List 仅让 `10.0.0.4` 进入 Clash Rule Engine；Registry `/v2/` 随后返回预期 `401`，两个固定第三方 Image Digest 均可解析。临时 Mirror 方案未提交/部署，一次性传输 Archive 已从 Controller 与 Origin 删除。
- 主机磁盘约 69 GiB、当前仅约 19 GiB 可用；Docker Image 约 33.46 GB，其中约 18.58 GB 标记可回收。未确认回滚依赖前不得执行 Prune，Production Preflight 仍需形成容量结论。
- 主机现有 1Panel PostgreSQL 把 `5432` 发布到所有 IPv4/IPv6 Interface；V2 PostgreSQL 不发布 Host Port，不得修改或复用该现有数据库。现有暴露风险需由 Owner 独立处理，不能混入 V2 Cutover。
- Phase 18 首次重新运行 Fail-closed Image Scan 时发现 `age 1.3.1` 所含 `golang.org/x/crypto v0.45.0` 的新 Critical Finding；已按官方 2026-08-29 Stable Release 升级到 `age 1.3.2`，Linux amd64 Archive SHA-256 固定为 `cbe24006683f8eb669266162894b9a522a1af52f2665fbc63a4bb032ed26ac10`。必须以重跑 Trivy 结果作为关闭证据，不得加入 Ignore。
- Owner 曾在 Phase 18 初次 Secret 配置时把生产对象存储简化为 AList Asset 与 R2 Backup，ADR 0017 因此形成单一 Off-site `BACKUP_S3_*`；该中间决策已由后续明确澄清的 ADR 0018 Supersede，保留本条仅用于解释首份 R2-only Backup 的历史状态。
- 首次真实 R2-only Backup 后，Owner 最终澄清 Recovery 拓扑：现有 AList Bucket 是 Primary，数据库/WAL/Control-state 写入其根目录固定 `backups/`，R2 是包含普通 Asset 与该 Recovery Namespace 的完整 Off-site 副本。ADR 0018 Supersede ADR 0017；`BACKUP_S3_*` 改为复用现有 AList 连接，新增 `BACKUP_OFFSITE_S3_*` 指向 R2。Backup 只有双端完整读回均 Fresh 才 Valid，Restore 优先 AList 并回退 R2；整桶 Copy/Add/Update 会把 `backups/` 一并校验到 R2，且不传播 AList Delete。AList 官方 S3 Contract 只有实例级 Access Key/Secret，这是 ADR 记录的 Provider Limitation；固定 Prefix、应用只读接口、Public Prefix Deny、Artifact Encryption 与独立 R2 Credential 是补偿控制。既有 R2 Backup 保留但不满足新双端 Gate；部署新 Recovery Runtime 前只需在 SOPS 中把 AList 现有连接复制到 `BACKUP_S3_*`、把当前 R2 值移到新 Off-site Key，无需新建 AList Bucket。
- ADR 0018 的本地完整回归已通过：145 项 Unit、Production-foundation/Idempotency/Security/Load、Full/Diff/Incr + WAL/PITR Recovery、Control-state age Snapshot、PostgreSQL-down Restore、10 项 Public E2E 与 7 项 PostgreSQL Migration 全部通过。恢复演练会先删除测试 AList Primary Generation 与 Control-state Artifact，再证明 R2 Off-site 自动回退可恢复；Control-state Version 7 Unit Test 证明旧 R2-only 记录升级后会被标记为 Primary `pending`、`valid=false`。
- Owner 批准后，Production 基础组件已用 `93287c38f16bcbe70b1291b82b06e82b23e4ae95` 的 Service/Recovery/PostgreSQL Immutable Image 收敛，Control-state 无损升级到 Schema 7；Shared Deployment Operation `39dab66c-ed9a-406e-bf9e-b0f75f744225` 把同 SHA、Web Digest `sha256:93766646f5d65d62f206c07dcb201daf6a4d6b93cc7df424feed7a0da821828c` 部署到 Green 并达到 `deployment-verified`。Public/Origin Health、Ready、Version、Home、Article、四 Locale、Search、Asset Smoke 全部通过；旧 `a10eace92310f3fc23deb26858c4eeb76821f8dc` Blue Slot 保持 Healthy，Stabilization/Rollback Window 截至 `2026-09-08T03:31:11.903Z`。
- 首次 ADR 0018 Production Full Backup Operation `c126a8b3-1da4-429f-849b-640f4f014e70` 安全失败并记录 `valid=false`：Backup `20260907-034059F` 的 R2 Off-site 为 `fresh`，AList Primary 因 `ListObjectsV2` 对精确 `.../repository/` Prefix 重复返回 3 个虚拟目录标记而被误判 File-count Mismatch。只读审计确认 Manifest 的 2,761 个文件全部存在、缺失 0、真正额外对象 0、56,414,192 bytes 与 Manifest SHA-256 `0f39561ff659589680914a9d06073b5195c128a6ef07b02e80182ef83f7885bb` 完整读回为 `fresh`。Recovery Verification 现只去重并忽略精确 Prefix Marker，仍对未知/缺失 Key 与逐对象 Hash Fail Closed；146 项 Unit、完整 Repository Gate、Production-foundation、双副本/强制 R2 回退 Recovery、10 项 E2E 与 7 项 Migration 已通过。修复尚未重新部署，新的 Production Backup Retry 仍需单独 Owner 授权。
- 初次 Production Provision 需要 Web、Service、Recovery 与 PostgreSQL 四个同 SHA Immutable Image；Phase 18 已补齐受 Quality Gate 约束的 GitHub Build Job，使其以独立 GHCR Repository 发布完整 Image Set，Web Digest 仍是 Shared Blue/Green Engine 的唯一 Release Digest。
- Phase 18 真实首发命令审计发现 Deployment Article Smoke 仍硬编码为仅 Disposable Seed 存在的 `/blog/phase-3-seed`。Production Compose 现要求由 Ansible 显式注入 Article/Asset/Search Smoke Policy，默认文章改为最终 Legacy Audit 已覆盖的 `/blog/2026-09-02-wm-lun-wen-luo-lie`；Disposable Gate 继续显式使用 Seed Route，避免未切流 Candidate 因虚假 Production 前提失败。
- 初次 Push 前 `PRODUCTION_DEPLOYMENT_ENABLED` Repository Actions Variable 必须保持缺失/非 `true`；Quality 成功后只发布候选 Image Set。只有 Production Environment Protection、Origin Provision 与 Pre-cutover Gate 全部成立后才显式启用 Deploy Job，防止 Bootstrap 前产生伪部署。
- Phase 18 Candidate 前完整本机 Gate 已通过：Biome/Source/Workflow/Drizzle/Typecheck/Renovate/Build/Security，29 个 Test File/135 个 Unit Test，Production-foundation（含 Trivy Critical/Secret Scan、Blue/Green/Rollback/IPv4+IPv6/迁机）、单 Off-site S3 Full/Diff/Incr/WAL/PITR/Control-state Restore、Application Integration、10 个 Public E2E 与 7 个 PostgreSQL Migration。全部使用 Disposable Local Target，`productionTraffic=false`。
- 首次 GitHub PR Gate 暴露 Hosted Runner UID 与开发镜像 `node` UID 不同，导致 Test-only Control-state `0700` Bind Mount 无法写入；测试 Compose 覆盖层现显式使用 Runner UID/GID。该修复不改变 Production Container Identity/Permission。
- GitHub Hosted Runner 的首次 Next.js Development Homepage 冷编译可超过 5 秒；Disposable Integration 的初次 Homepage Read Timeout 已调整为 30 秒，后续请求、Production Health/Smoke Policy 与 Production Timeout 均未放宽。
- 在任何真实 Cutover 前重新验证 GitHub `production` Environment/Required Check/Package Permission、Canonical Content Caller、Production Asset Probe/Alert Sink、Fresh Backup/WAL/R2/Restore、Control-state Backup、Target Inventory 与 Public/Origin IPv4/IPv6。
- 若 Phase 18 不需要实际 Server Replacement，不绑定或触发 Migration Platform；若需要，必须先获得真实 Target/Primary/DDNS 的单独授权并复核 `server-migration.md` Abort/Rollback Gate。
- 不得把 Phase 16 Load、Phase 13 Restore 或 Phase 17 Disposable Migration Timing 伪装为 Production SLA/RPO/RTO。

Phase 18 正在执行。真实主机隔离基础、Production 业务 Migration、PgBouncer SCRAM 校准、
专用 Content Egress、最终 Canonical Content Sync 与 Owner 执行的 1Panel/EdgeOne Public Cutover 已完成，
并通过幂等/监听/健康/Ready/版本/内容计数/Hash/Locale/Search/无付费翻译验证。Fresh Backup/WAL/R2、
真实 Restore Drill、完整 Compatibility/Public Smoke、Stabilization Evidence 与 Rollback-window Closure
仍未完成；不得提前勾选 Phase 18 Gate。

## 8. 回查旧 myblog 的规则

Phase 1–17 不重新全量扫描旧仓库。先使用 Phase 0 Inventory、Compatibility Matrix、Fixture、Risk Register 和现有规范。只有仓库内证据无法回答一个明确、具体的 Legacy 行为时，才定点只读检查并把后续必需事实沉淀回 V2。Phase 18 再按 Gate 从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。
