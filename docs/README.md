# 文档索引

本目录包含 Website V2 的规范性架构、开发、运维、迁移和决策记录。

## 规范优先级

文档发生冲突时，按以下顺序处理：

1. 最新已批准 ADR
2. 架构文档
3. 规格文档
4. 运维/开发指南
5. 示例和说明性内容

`AGENTS.md` 约束 Coding Agent 的行为，并且必须反映这些决策。

## 从这里开始

完整设计介绍请阅读：

```text
docs/architecture/system-design.md
```

然后阅读：

```text
docs/architecture/overview.md
docs/architecture/network-and-origin.md
docs/architecture/control-plane-and-jobs.md
```

开始实施前阅读：

```text
docs/planning/current-state.md
docs/planning/implementation-plan.md
```

`current-state.md` 是新会话的简洁交接入口；实施计划定义 Phase 0–18 的执行顺序、硬 Gate、Commit/停止规则和 Accepted ADR Coverage。两者都不替代规范或 ADR。

## 目录

- `specification/` — 系统必须实现什么
- `architecture/` — 系统如何设计
- `development/` — 工程师和 Agent 如何进行本地开发
- `operations/` — 生产系统如何部署、翻译与恢复
- `migration/` — 从旧 Nuxt 实现迁移到 V2
- `planning/` — 阶段化实施顺序、依赖、Gate 与进度
- `decisions/` — 不可随意重写的架构决策记录

## Phase 0 Legacy Baseline

- `migration/legacy-discovery-baseline.md` — Legacy Feature/Content/Integration Inventory 与 Compatibility Matrix。
- `migration/legacy-route-and-pinyin-fixtures.md` — Public Route、Pinyin、Alias 与 Static Archive Fixture。
- `migration/legacy-risk-register.md` — Legacy Migration Risk 与 Owner Blocker。
- `planning/phase-0-traceability.md` — Architecture、Requirement、Acceptance Criteria 与 ADR 到实施 Phase 的追踪。
- `migration/phase-0-verification-report.md` — Phase 0 实际检查结果与 Owner Exit Gate 状态。

## Phase 1 Engineering Baseline

- `development/phase-1-engineering-baseline.md` — 锁定 Toolchain、质量命令、CI/Placeholder、Source Boundary 与 Renovate Policy。
- `development/phase-1-verification-report.md` — Phase 1 实际安装、质量 Gate、Clean Checkout 与 Exit 状态。

## Phase 2 Hermetic Local Platform

- `development/phase-2-hermetic-local-platform.md` — Compose 拓扑、镜像 Digest、CLI 生命周期、SQLite/Fake Boundary 与 Disposable Test Contract。
- `development/phase-2-verification-report.md` — Phase 2 Clean Start、重复测试、失败清理、Stop/Restart、Safe Reset 与隔离 Gate 证据。

## Phase 3 Persistence Foundation

- `development/phase-3-persistence-foundation.md` — PostgreSQL/Drizzle Schema、Migration Policy、Role、Seed、PgBouncer 与 SQLite Boundary。
- `development/phase-3-verification-report.md` — Clean/Previous/Repeat Migration、Role、Validation、Integration 与质量 Gate 证据。

## Phase 4 Independent Control Plane

- `development/phase-4-independent-control-plane.md` — 独立 Control API、Authentication/Authorization、PostgreSQL/SQLite 状态分流与权限边界。
- `development/phase-4-verification-report.md` — Routing、Security、Crash/Lease、PostgreSQL-down、Next-down 与权限 Gate 证据。

## Phase 5 One-way Content Ingestion

- `development/phase-5-one-way-content-ingestion.md` — GitHub GET-only Snapshot、Markdown/Route/Identity、Transactional Apply、Job Claim/Retry 与 Deferred Hook Contract。
- `development/phase-5-verification-report.md` — Directionality、Pinyin、Idempotency、Add/Modify/Delete/Move、Collision、Retry/Concurrency 与质量 Gate 证据。

## Phase 6 zh-CN Website Vertical Slice

- `development/phase-6-zh-cn-vertical-slice.md` — App Router/RSC、Runtime Markdown、Legacy Route、Asset、Cache/Revalidation 与 Public Health Contract。
- `development/phase-6-verification-report.md` — zh-CN Critical E2E、311 条 ROS2 Route、Secret Boundary、Side-effect Retry 与质量 Gate 证据。

## Phase 7 Deterministic Locales

- `development/phase-7-deterministic-locales.md` — 四 Locale Route/UI、OpenCC 物化、Glossary 与受保护 Markdown Contract。
- `development/phase-7-verification-report.md` — Locale、转换、Fallback、Route 与完整质量 Gate 证据。

## Phase 8 Translation Memory

- `development/phase-8-translation-memory.md` — Semantic Block、Hash/Context Identity、Document Mapping、Mixed Fallback、Targeted Patch 与零成本边界。
- `development/phase-8-verification-report.md` — Segmentation、Reuse/Pending/Stale、AST、安全 Backfill、E2E 与 Migration Gate 证据。

## Current implementation handoff

- `planning/current-state.md` — 已完成 Phase、实际能力、Stub/Fake、已知限制、Legacy 回查规则与下一 Phase Prerequisite。
