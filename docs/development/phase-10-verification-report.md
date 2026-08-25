# Phase 10 Verification Report

> Date: 2026-08-25
> Scope: Phase 10 PostgreSQL + PGroonga Search and cache correctness only
> External operations: none

## Evidence

- Search projection extraction, locale/current-source behavior, query normalization, snippet bounds, cache key/tag and exact affected-locale tests.
- Empty and previous-schema migration through `0005_phase10_pgroonga_search`, role/constraint checks, PGroonga index selection and explicit index rebuild.
- PostgreSQL-backed full reindex with exclusive concurrent claim, lease/attempt retry and deterministic projection count.
- Exact-title, heading, body, Chinese phrase, English term and mixed technical-identifier relevance fixtures.
- Locale isolation and locale-prefixed canonical route checks for zh-CN and en-US.
- Strict API response/no-store/error behavior and negative checks for raw Markdown, source/projection hashes and internal paths.
- Real content-update projection refresh followed by exact search-cache invalidation without an application rebuild or arbitrary TTL.
- Browser verification of localized Search UI and a negative client-bundle corpus scan.

## Commands and results

Final verification uses the repository-pinned Node.js 24.19.0 and pnpm 11.23.0:

```text
./site check
./site test
```

Final results:

- `./site check`: PASS — Biome, source policy, Drizzle consistency, strict TypeScript, Renovate validation and Next.js webpack production build.
- `./site test`: PASS — 20 test files / 85 unit tests; disposable PostgreSQL/S3Mock/control-api/content-worker/OpenResty/Next.js integration; 10 Playwright E2E; 6-migration empty/upgrade/role/constraint/PGroonga suite.

The disposable integration additionally proves `REINDEX INDEX app.search_documents_full_text_idx`, PGroonga query-plan selection, one injected reindex retry, one injected public-revalidation retry and exact old/new query cache behavior.

## Acceptance and boundaries

- Search is fully Server-side and PostgreSQL + PGroonga backed.
- All four locales have isolated projections; en-US preserves current-source translation/fallback behavior.
- Ranking, snippet, route, API, reindex and cache behavior are automated and deterministic.
- Search correctness has no arbitrary TTL dependency and no client-only or parallel production index.
- Search/reindex jobs remain in PostgreSQL; control-state SQLite scope is unchanged.
- `/api/search?q=ROS2_Control&locale=zh-cn` and `/zh-cn/search?q=ROS2_Control` are representative production smoke candidates for Phase 14/18.

## Recovery impact

Migration `0005_phase10_pgroonga_search` is an additive Expand and is retained on application rollback. The projection is derived entirely from canonical/current materialized PostgreSQL content and can be rebuilt per locale. Disabling search polling stops new full reindexes; failed work retries through the existing PostgreSQL application-job queue. No destructive schema operation, production operation, paid AI request, GitHub write, AList access or Legacy repository read/write occurred.
