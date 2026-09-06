# Phase 3 PostgreSQL / Drizzle Persistence Foundation

## Authority and scope

PostgreSQL 18 is the runtime authority for content, translations, ingestion, application jobs and the two Owner-approved personal datasets. GitHub remains the only canonical zh-CN authoring source. Phase 3 does not fetch content, execute translation, build search indexes or implement control/deployment operations.

Infrastructure recovery state remains in the isolated SQLite boundary defined by ADR 0015. No PostgreSQL table represents deploy, rollback, restore or recovery work.

## Checked-in foundation

- `src/domain/persistence.ts` owns all closed persistence unions and Zod external-write schemas.
- `src/database/schema-core.ts` and `schema.ts` define the typed Drizzle schema.
- `drizzle/0000_phase3_core.sql` creates documents, PostgreSQL application jobs and Owner-managed datasets.
- `drizzle/0001_phase3_translation_and_ingestion.sql` expands the schema with translations, segments, explicit translation jobs, ingestion runs and controlled aliases.
- `src/database/migrate.ts` applies reviewable SQL under an advisory lock and verifies every applied hash/timestamp.
- `ops/database/roles.sql` creates NOLOGIN least-privilege group roles and bootstraps PGroonga as the administrative prerequisite.
- `src/database/seed.ts` creates deterministic, idempotent Development records through transaction-mode PgBouncer.

## Schema inventory

| Table | Responsibility |
| --- | --- |
| `app.documents` | Stable runtime content identity, source Markdown/frontmatter/hash/commit, exact route and delete bookkeeping |
| `app.document_translations` | Per-document non-zh-CN materialized Markdown |
| `app.translation_segments` | Position-independent block-level translation memory and cost/status metadata |
| `app.operational_jobs` | PostgreSQL-backed content/translation/search/cache application work only |
| `app.translation_jobs` | Explicit translation scope, budget, estimate, actual usage and terminal state |
| `app.ingestion_runs` | Source-commit synchronization audit and file counts |
| `app.content_aliases` | Wiki-only, approval-referenced compatibility exception |
| `app.owner_managed_datasets` | Revisioned `tech_footprint` / `weight_loss` PostgreSQL payloads |

The Phase 3 seed intentionally creates no Alias. The seven accepted Legacy aliases are written only when Phase 5 can associate them with real imported documents.

## Migration policy

All Phase 3 changes are Expand-only. Each journal entry has a checked-in risk, backup requirement, reason and recovery statement. The runner refuses policy/journal drift, unauthorized Contract changes, unmet fresh-backup requirements and edits to an already applied SQL artifact.

The previous-schema fixture points to the exact first migration rather than copying schema SQL. The test stages that version, inserts representative data, applies the next Expand migration and verifies both the old row and new structures.

## Local and test behavior

`./site dev` now applies two migrations and the deterministic seed on every reconciliation. Drizzle application/seed queries go through PgBouncer `pool_mode=transaction`; schema migration goes directly to PostgreSQL. Local/test credentials remain documented dummy values and no production endpoint or credential is used.

`./site test` runs Unit, full disposable integration, the dedicated migration suite and the honest Phase 6 E2E placeholder. Both infrastructure suites own unique Compose projects and remove all disposable state in `finally`.
