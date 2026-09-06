# Phase 0 Architecture / Requirement / ADR Traceability

> Status: Owner accepted Phase 0 traceability baseline
> Source baseline: repository documents as of V2 commit `5da0ea9b6b87c9790cbc9db59b4c9e988934ca4e`

本文件证明 Phase 0 已把当前 Architecture、Requirement、Acceptance Criteria 与 Accepted ADR 分配到后续实施 Phase。这里的 Phase Mapping 不改变原规范，也不表示对应能力已经实现。

## 1. Project Requirement Traceability

| Requirement area | Normative source | Target Phase | Verification / Exit evidence |
| --- | --- | --- | --- |
| Canonical zh-CN Markdown、Directory、Minimal Frontmatter | `project-requirements.md` Content | 0、5、18 | Phase 0 Inventory；Phase 5 Import/Directionality；Phase 18 Final Audit |
| Deterministic Add/Update/Delete/Move | Content | 3、5、18 | Schema/identity；Transactional ingestion；Final content reconciliation |
| Legacy URL 与 Pinyin | Routing | 0、5、6、18 | Route/Pinyin Fixture；Ingestion Route；App Router E2E；Final URL Diff |
| 四个 approved Locale Prefix | Routing / i18n | 7、18 | Phase 7 four-locale/negative-route E2E PASS；Final locale audit |
| UI next-intl 与 Content i18n 分离 | i18n | 1、7、8 | Phase 7 catalog/content-module boundary PASS；Translation Memory |
| Block-level English Translation | i18n | 8、9 | Segment/hash/fallback；budgeted execution |
| OpenCC zh-HK/zh-TW | i18n | 7 | Phase 7 glossary/protected syntax/PostgreSQL materialization/replay PASS |
| PostgreSQL + PGroonga Server Search | Search | 3、10 | PGroonga bootstrap；relevance/locale/reindex gate |
| AList S3 Asset / CDN | Static Asset | 6、11 | Asset boundary；S3Mock + AList non-production contract |
| One-command Local Development | Operations | 1、2 | CLI baseline；hermetic dev/test demonstration |
| Stable Operator CLI | Operations | 1、2、9、13、14、17 | Command-specific contract and integration gates |
| Blue-Green / Immutable / Rollback | Operations | 3、12–15、18 | overlap schema；infra；recovery；shared engine；CI/CD；cutover |
| Backup / Tested Recovery / PITR | Operations | 12、13、16、18 | infra hook；restore drill；alerts/runbook；fresh final drill |
| Server Provision / Migration | Operations | 12、17 | Ansible idempotency；non-production migration rehearsal |
| Hardened Container / Renovate | Operations | 1、12、15、16 | policy/config；image permissions；CI; security scan |
| Independent `/api/ops/*` Control Plane | Control | 4、12、14–16 | route/failure tests；OpenResty；shared engine；OIDC；hardening |
| DDNS/IPv6/Public-IP independence | Network | 4、12、17 | config rejection；AAAA-only infra/migration tests |
| PostgreSQL Job vs SQLite Recovery State | Recovery | 3、4、13、14、17 | schema boundary；crash tests；restore；deploy state；migration continuity |
| Explicit paid Translation + Server Budget | Translation | 5、8、9、15 | zero-call sync；pending/fallback；budget tests；workflow separation |
| GitHub -> PostgreSQL only | Directionality | 5、15、18 | adapter/capability test；workflow split；final audit |
| content-worker / deploy-agent separation | Privilege | 4、5、9、12–14、16 | identity/capability and permission tests |

## 2. Architecture Document Traceability

| Architecture source | Decision surface | Primary implementation Phase | Verification Phase |
| --- | --- | --- | --- |
| `system-design.md` | End-to-end topology and authority | 1–15 | 16–18 |
| `overview.md` | Component responsibilities and data authority | 3–15 | 16、18 |
| `technology-stack.md` | Approved stable stack and prohibited parallels | 1、2、3、7、10–13 | Each phase gate；16 |
| `network-and-origin.md` | Public/control/origin identity, IPv6 | 4、12、15、17 | 16–18 |
| `control-plane-and-jobs.md` | Path ownership, two durable state classes, auth | 4、12–15 | 16、17 |
| `data-model.md` | Content/translation/job logical schema | 3、5、8–10 | 13、14、18 |
| `content-pipeline.md` | Deterministic one-way ingestion and zero-cost publish | 5、8、9 | 10、15、18 |
| `internationalization.md` | Locale/UI/content/fallback split | 7、8、9 | 10、18 |
| `search.md` | PostgreSQL + PGroonga server search | 3、10 | 16、18 |
| `caching.md` | Owner/key/invalidation/TTL/observability | 6、10 | 14、16、18 |

## 3. Accepted ADR Traceability

Discovery 时的全部 15 份 ADR 均为 `Status: Accepted`。Phase 18 根据真实生产主机
Inventory 新增并接受 ADR 0016 与 0017；它们不改写 Phase 0 结论，追加映射到 Phase 18。

| ADR | Decision | Implement / verify Phase |
| --- | --- | --- |
| 0001 | New Next.js V2 Repository；Legacy read-only | 0、1、18 |
| 0002 | PostgreSQL Runtime Content Store | 3、5、8、10、13 |
| 0003 | Superseded：原 AList Asset/Backup + R2 双远程目标 | 11、13；由 0017 替代 |
| 0004 | Full Blue-Green、Immutable、Rollback | 14、18 |
| 0005 | TypeScript/TSX Application/Automation | 1；all later code gates |
| 0006 | GitHub zh-CN Source of Truth | 0、5、8、18 |
| 0007 | Hermetic PostgreSQL/S3Mock | 2、3、11 |
| 0008 | Expand/Contract Migration | 3、14、18 |
| 0009 | Near-zero planned DB migration | 17 |
| 0010 | Explicit budgeted paid AI Translation | 8、9、15 |
| 0011 | Domain-addressed Control/DDNS Origin | 4、12、15、17 |
| 0012 | One-way GitHub Content Sync | 5、15、18 |
| 0013 | Separate content-worker/deploy-agent | 4、5、9、12–14、16 |
| 0014 | Control API independent of Next.js slots | 4、12、14、16 |
| 0015 | PostgreSQL-independent SQLite Recovery State | 4、12–14、17 |
| 0016 | Shared-host OpenResty + loopback-only V2 gateway | 18 |
| 0017 | Provider-neutral Asset S3 + 单一 Off-site Backup S3 | 13、18 |

没有 Phase 0 Artifact Supersede 或改写 ADR。Legacy Nuxt、Client Search、Static Build、Pages Blob 和 Build-time locale generation 仅作为迁移证据，不成为平行 V2 Architecture。

## 4. Acceptance Criteria Coverage

ID 以 `docs/specification/acceptance-criteria.md` 的 Section 和原始顺序定义。Source line span 覆盖该 Section 的每一个 Checkbox；合计 102 项，没有未分配项。

| ID range | Source lines / count | Acceptance area | Assigned Phase | Gate |
| --- | ---: | --- | --- | --- |
| LD-01–LD-08 | 7–14 / 8 | Local Development | 2（Migration hook 同时由 3 验证） | Hermetic start/stop/restart/isolation |
| CQ-01–CQ-07 | 18–24 / 7 | Code Quality | 1；持续 Gate | Biome/typecheck/build/source scan |
| DA-01–DA-05 | 28–32 / 5 | Dependency Automation | 1、15 | Renovate validation + CI policy |
| CT-01–CT-05 | 36–40 / 5 | Content | 0、5、6、18 | Inventory/import/idempotency/delete/pinyin/E2E |
| I18N-01–I18N-05 | 44–48 / 5 | i18n | 7、8 | Locale/message/OpenCC/hash/AST tests |
| SR-01–SR-04 | 52–55 / 4 | Search | 10 | PGroonga relevance/locale/bundle tests |
| S3-01–S3-03 | 59–61 / 3 | S3 | 2、11 | S3Mock + authorized AList contract + credential guard |
| DP-01–DP-11 | 65–75 / 11 | Deployment | 14、15、18 | shared Blue-Green/CI trigger/final smoke |
| DH-01–DH-09 | 79–87 / 9 | Docker Hardening | 12、16 | image/permission/secret/security tests |
| DB-01–DB-04 | 91–94 / 4 | Database | 3、14 | clean/previous/overlap/contract migration |
| RC-01–RC-12 | 98–109 / 12 | Recovery | 13、16、18 | backup/PITR/PG-down/SQLite/break-glass drills |
| SM-01–SM-04 | 113–116 / 4 | Server Migration | 17 | provision/replication/switchover/abort rehearsal |
| CP-01–CP-11 | 120–130 / 11 | Control Plane / Network | 4、6、12、14、17 | routing/auth/failure/domain/IPv6 tests |
| TC-01–TC-09 | 134–142 / 9 | Translation Cost Control | 5、8、9、15 | zero-call/pending/fallback/dry-run/budget/workflow |
| GH-01–GH-03 | 146–148 / 3 | GitHub One-way Flow | 5、15、18 | read-only adapter/capability/directionality audit |
| WS-01–WS-02 | 152–153 / 2 | Worker Separation | 4、12、14、16 | capability/container/security tests |

Coverage arithmetic：

```text
8 + 7 + 5 + 5 + 5 + 4 + 3 + 11 + 9 + 4 + 12 + 4 + 11 + 9 + 3 + 2 = 102
```

Phase 0 Verification 使用 `rg -c '^- \[ \]' docs/specification/acceptance-criteria.md` 得到 102，与上表算术一致。

## 5. Phase 0 Legacy Input Traceability

| Legacy input | Consuming Phase | Required evidence |
| --- | --- | --- |
| Physical repo boundary/read-only rule | 1、18 | no in-place Nuxt conversion; final legacy refresh |
| 237 Canonical Markdown + minimal Frontmatter | 3、5 | schema can express; all import fixtures |
| Blog explicit paths + Wiki pinyin algorithm | 5、6 | ingestion and real router exact match |
| Unprefixed zh-CN + approved Locale routes | 6、7 | Phase 7 four-locale route/switch/`zh-hant` negative E2E PASS |
| 7 Wiki aliases | 5、6、18 | explicit compatibility only |
| Blog/Wiki reading/navigation behavior | 6 | critical vertical-slice E2E |
| Page/Article SEO Title、Description、OG 与 Exact Route identity | 6、7、16、18 | Phase 7 locale-aware metadata/Exact Route PASS；canonical/indexability/social metadata audit |
| Search behavior | 10 | server-side relevance/result contract |
| CDN/static/media categories | 6、11 | asset loading + S3/AList contract |
| External integration inventory | 9、11、12、16 | auth/cost/storage/security gates as applicable |
| Deployment assumptions | 1、2、12–15 | replace, never inherit, with accepted architecture |
| Final refreshed legacy delta | 18 | no route/feature/content regression before cutover |

Owner Decisions O-001–O-007 in `legacy-discovery-baseline.md` are resolved. Owner has accepted the final Compatibility Matrix and Feature Classification.
