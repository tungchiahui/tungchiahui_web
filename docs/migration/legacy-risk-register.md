# Phase 0 Legacy Migration Risk Register

> Status: Owner accepted Phase 0 risk baseline
> Evidence commit: Legacy `d33e9ee5f90a266207f9f9658a47031eafdb981a`

| ID | Risk | Likelihood | Impact | Owner / target Phase | Control / required evidence | Status |
| --- | --- | --- | --- | --- | --- | --- |
| R-001 | Legacy `zh-hant` 是第五 Locale，但 V2 只批准四个 | High | High: existing URL regression or architecture drift | Owner / 0、7、18 | O-001 approved removal without redirect; negative route test | CONTROLLED |
| R-002 | Pinyin dependency/version drift changes public URL | Medium | Critical | Content / 1、5、6 | Phase 5 pinned dependency + full representative ingestion fixture PASS；Phase 6 App Router pending | OPEN |
| R-003 | Future distinct titles collapse to one Pinyin Route | Medium | High: overwrite/ambiguous content | Owner / 0、5 | O-006: pre-write collision gate; whole transaction fails; Owner corrects Source | CONTROLLED |
| R-004 | 7 existing Wiki Alias are mistaken for permission to create a broad redirect map | Medium | High: SEO/analytics drift | Content / 5、6、18 | Phase 5 exact allowlist/FK/approval/collision gate PASS；Phase 6/18 response audit pending | OPEN |
| R-005 | Unprefixed zh-CN URLs are lost when V2 adopts locale-prefixed routing | High | Critical | Web / 5、6、18 | Preserve exact unprefixed behavior; E2E all route classes | OPEN |
| R-006 | Explicit Blog paths containing `!`/`_` are normalized | Medium | High | Content/Web / 5、6 | Phase 5 four exact Blog path fixtures PASS；Phase 6 Router pending | OPEN |
| R-007 | No stable author ID makes rename/move continuity ambiguous | High | High: duplicate/lost history | DB/Content / 3、5 | Phase 5 path/route/unique-hash identity + ambiguity failure + move continuity integration PASS | CONTROLLED |
| R-008 | Delete is implicit in static builds and stale DB rows remain public | High | High | Content / 5、18 | Phase 5 transactional snapshot soft-delete/add/modify/move integration PASS；Phase 18 final reconciliation pending | CONTROLLED |
| R-009 | `.output/public` is stale/incomplete and could be treated as authoritative | High | Medium | Migration / 0、18 | Pin source HEAD; enumerate tracked source/rules; refresh at Phase 18 | CONTROLLED |
| R-010 | 311 static GitBook HTML routes and 647 companion Markdown/asset files are silently dropped | High | High | Assets / 6、11、18 | O-005 classified all MUST KEEP; full tracked manifest; link and public-route tests | OPEN |
| R-011 | Thousands of CDN references include Unicode and historic keys | Medium | High | Storage / 6、11、18 | S3/CDN Unicode/metadata tests; representative content render; no bulk rewrite | OPEN |
| R-012 | External audio/playlist/suggestion/friend endpoints fail or change | High | Medium | Web / 6、11、16 | O-003 keeps outcomes; timeouts/fallback/observability; current-link audit | OPEN |
| R-013 | Public Umami share access and per-page Traffic UI disclose more than intended | Medium | High | Security / 16 | O-003 keeps public stats; privacy/auth/cache review; no sensitive telemetry | OPEN |
| R-014 | `tech-footprint`/`weight-loss` Provider-specific Blob becomes an unapproved parallel V2 store | High | Critical | DB/Architecture / 3、4、6、16 | O-004 requires PostgreSQL; old Blob persistence prohibited; schema/boundary review | CONTROLLED |
| R-015 | Personal edit token/localStorage design is copied without a new Trust-boundary review | Medium | Critical | Security / 4、16 | O-004 keeps Owner Edit; Zod, authz, rotation, CSRF/replay/abuse review | OPEN |
| R-016 | Legacy client-side full-corpus Search is mechanically ported | Medium | Critical architecture violation | Search / 10 | Server-only PGroonga; bundle corpus-negative test | CONTROLLED |
| R-017 | Old Build-time locale generation or translation scripts cause paid calls during publish | Medium | Critical cost | Translation / 5、8、9、15 | Phase 5 Content Module AI/build/deploy negative import test PASS；Phase 8/9/15 pending | OPEN |
| R-018 | Ignored generated locale Markdown is mistaken for Canonical content | High | High | Content/i18n / 5、7、8 | Phase 5 GitHub canonical-path filter and `_i18n` negative fixture PASS；Phase 7/8 pending | CONTROLLED |
| R-019 | Legacy `.js` Edge Function/application data is copied into V2 | Medium | High policy violation | Engineering / 1、4 | repository source scan; TypeScript + validation boundary | CONTROLLED |
| R-020 | Visual modernization removes recognizable identity or key reader interactions | Medium | High | Web/Owner / 6、18 | MUST KEEP identity list; critical interaction E2E; final visual audit | OPEN |
| R-021 | Hardcoded Legacy UI text is carried into V2 and bypasses next-intl | High | Medium | Engineering/i18n / 1、7 | message skeleton; locale completeness/hardcoded text tests | OPEN |
| R-022 | Analytics-sensitive Alias/Locale paths split or lose historical traffic continuity | Medium | High | Web/Observability / 6、7、16、18 | aggregate exact path variants; final analytics-sensitive route audit | OPEN |
| R-023 | Static Pages deployment assumptions are mistaken for V2 architecture requirements | Medium | Critical | Architecture / 1、12–15 | ADR conformance review; no in-place migration or parallel deploy system | CONTROLLED |
| R-024 | Legacy changes after Phase 0 make baseline stale before cutover | High | High | Migration / 18 | freeze/refresh inventory and full delta immediately before cutover | OPEN |
| R-025 | V2 Metadata/Canonical 处理错误地合并 unprefixed、Locale 或 Alias Route，造成重复索引或内容身份漂移 | Medium | High: SEO/URL continuity regression | Web/i18n / 6、7、16、18 | Locale-aware title/description tests；Exact Route canonical audit；final indexability/social metadata review | OPEN |

## Severity rule

- `Critical`：违反 Accepted ADR、安全/成本边界、造成数据丢失或使核心 Public URL 不可恢复。
- `High`：明显用户可见回归、较大兼容性/可恢复性风险。
- `Medium`：可用性、维护性或有限范围体验退化。

`BLOCKED` 表示需要 Owner 决定，并不表示 Agent 可以跳过；`CONTROLLED` 表示已有明确后续 Gate，但尚未实现；`OPEN` 表示已分配 Phase 与验证方法。
