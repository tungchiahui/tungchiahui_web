# Phase 7 Verification Report

> Date: 2026-08-24
> Result: PASS
> Scope: UI i18n, four-locale routing, deterministic zh-HK/zh-TW materialization, en-US zh-CN fallback

## Environment

- Node.js `24.19.0`
- pnpm `11.23.0`
- Next.js `16.3.2`
- Local-only disposable Docker Compose infrastructure
- No production, paid provider, GitHub write, AList, DNS, deployment, backup/restore, or old Nuxt mutation

## Quality gate

`./site check` passed:

- Biome checked 120 files with no remaining issue;
- repository source policy passed;
- Drizzle schema/migration consistency passed;
- strict TypeScript typecheck passed;
- Renovate configuration validation passed;
- webpack production build compiled, typechecked, generated routes, and exposed the Next.js Proxy boundary successfully.

## Test gate

`./site test` passed from the exact repository toolchain:

- Unit: 17 files / 72 tests;
- Disposable Integration: PostgreSQL, PgBouncer, S3Mock, control-api, content-worker, Next.js, OpenResty, failure boundaries, and cleanup passed;
- Content ingestion: both zh-HK and zh-TW rows were materialized for every active representative document; glossary revision/hash output, protected Markdown, and unchanged `generated_at` on same-commit replay passed;
- Browser: 9 Chromium tests passed with one worker, including all four locale samples, logical locale switching, converted/fallback UI state, `zh-hant` 404/no-redirect, Legacy exact routes, safe Markdown, ROS2 archive, metadata, and client-secret exclusion;
- Migration: all 3 versioned PostgreSQL migrations passed from clean and compatibility paths.

`git diff --check` also passed.

## Phase 7 acceptance mapping

| Requirement | Evidence | Result |
| --- | --- | --- |
| Four complete UI catalogs | static catalog map, exact key-shape unit test, TSX reusable-copy scan | PASS |
| Semantic en-US and reviewed deterministic regional UI | locale-specific catalogs and browser-visible navigation/state | PASS |
| Stable locale routing and same logical document switch | route parser/unit test and four-locale E2E | PASS |
| OpenCC zh-HK/zh-TW pipeline | content-worker transaction plus `document_translations` integration assertions | PASS |
| Versioned glossary/exceptions | version/revision schema and representative regional exception tests | PASS |
| Protected Markdown syntax | mdast text-range unit and integration tests for frontmatter/code/inline code/URL/identifier | PASS |
| en-US current zh-CN fallback, no AI | DAL deliberately ignores en-US materialization in Phase 7; E2E shows source content/fallback state; no provider boundary is imported | PASS |
| Converted/fallback observability | localized notice and `data-content-locale(-state)` hooks | PASS |
| Approved routes only | four locale route samples pass; `zh-hant` samples return 404 without redirect | PASS |
| UI/content i18n separation | separate catalogs/request modules and content/glossary/materialization modules | PASS |

## Recovery and remaining scope

No new schema migration was necessary because Phase 3 already established `document_translations`. Canonical zh-CN remains in `documents.raw_markdown`; regional rows are deterministic derived state and are written atomically with ingestion. A failed conversion rolls back the snapshot, and an explicit content-sync replay can safely rebuild missing or revision-stale regional rows.

Phase 8 remains intentionally untouched: no semantic block segmentation, translation memory, English mixed-block state, or provider execution was implemented. Phase 9 still owns all paid-provider behavior.
