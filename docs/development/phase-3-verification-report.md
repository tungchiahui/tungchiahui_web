# Phase 3 Verification Report

> Status: All Phase 3 technical, migration, acceptance and exit gates passed
> Verification date: 2026-08-24
> Phase 2 dependency commit: `58ec725f7d5f6b92dad63767a7cc8146446c5c43`

## Repository and scope boundary

| Check | Result |
| --- | --- |
| V2 Worktree before Phase 3 | PASS: Clean; HEAD contained only the accepted Phase 0–2 and handoff commits |
| Legacy Nuxt Repository | PASS: Not modified or rescanned; Phase 0 durable artifacts supplied every required content/route decision |
| Production operations/resources | PASS: None; all PostgreSQL/S3/SQLite targets were local or disposable |
| Phase 4+ scope | PASS: No formal Control auth/job endpoint, Content Fetch, paid Translation, Search Index, Website Feature or Deployment Operation |

## Locked dependency and generated artifact

| Dependency | Exact stable version |
| --- | --- |
| `drizzle-orm` | `0.45.2` |
| `drizzle-kit` | `0.31.10` |
| `pg` | `8.23.0` |
| `@types/pg` | `8.23.1` |

`pnpm-lock.yaml` was updated with pnpm `11.23.0`. Drizzle generates two reviewable SQL Migrations with checked-in snapshots/journal. `drizzle-kit check` reports the migration history consistent with the current typed Schema.

## Schema and boundary verification

- Eight `app` tables cover documents, materialized translations, block translation memory, translation/application jobs, ingestion runs, approved aliases and Owner-managed datasets.
- PostgreSQL Enum and Check Constraints reject unapproved Locale, application Job Type, non-object JSON Payload, invalid source hashes/counts and inconsistent translation/delete state.
- `operational_jobs` permits only Content Sync、Translation、Search Reindex and Cache Revalidation. Deploy、Rollback、Restore、Recovery and Server-migration state remain absent and therefore stay in ADR 0015 SQLite.
- `owner_managed_datasets` permits only `tech_footprint` and `weight_loss`, with revision/actor metadata. No parallel Blob/filesystem persistence was added.
- `content_aliases` requires Wiki paths and a non-empty approval reference. Development Seed inserts zero Alias.
- Closed Union and Zod Write Schema live once in `src/domain/persistence.ts`; Drizzle imports the same values.

## Migration gate

| Scenario | Actual result |
| --- | --- |
| Empty PostgreSQL 18 -> latest | PASS: `0000` and `0001` applied in journal order |
| Previous production-like -> latest | PASS: staged through `0000`, inserted representative row, applied `0001`, old row and new translation structures present |
| Repeat latest migration | PASS: journal count remained 2 and no duplicate schema/data appeared |
| Applied artifact integrity | PASS: stored Hash/Timestamp matched every checked-in SQL file |
| Expand/Contract policy | PASS: both Phase 3 migrations additive; tests reject unauthorized Contract and unmet backup requirement |
| PGroonga bootstrap | PASS: Extension exists; no Phase 10 Search Index was created |
| Failure cleanup | PASS: dedicated test Container、Network、Volume removed in `finally` |

## Role and PgBouncer gate

- `site_migrator` owns Schema changes without Superuser、Create-role、Create-database or Replication attributes.
- `site_app` can read runtime tables but cannot create Extension, read server files, inherit Migration/Backup/Replication roles or hold administrative attributes.
- `site_content_worker` receives application-table CRUD but no schema/extension/role privilege.
- `site_backup` receives `pg_read_all_data` + `pg_monitor`; `site_replication` alone has the Replication attribute.
- All five are NOLOGIN Group Role; production Login/Credential binding remains Phase 12.
- Deterministic Seed and repeated Drizzle reads passed through PgBouncer `pool_mode=transaction` with `SET LOCAL ROLE`, proving no cross-transaction Session-state dependency.

## Quality gates

| Gate | Actual result |
| --- | --- |
| Biome / Source Policy | PASS |
| Drizzle consistency | PASS |
| Typecheck | PASS with all required strict flags |
| Unit | PASS: 12 files, 30 tests |
| Disposable full integration | PASS: real Migration + Seed plus PostgreSQL/PGroonga/PgBouncer/S3Mock/Next/control-state lifecycle |
| Dedicated migration integration | PASS: Clean/Previous/Repeat/Role/Constraint/PgBouncer scenarios |
| Renovate validation | PASS |
| Production build | PASS |
| `./site check` / `./site test` | PASS with locked Node.js `24.19.0` and pnpm `11.23.0` |
| E2E | Honest `NOT_IMPLEMENTED`; replacement remains Phase 6 because no public vertical slice exists |

## Rollback and recovery impact

Both migrations are Expand-only and do not remove or rewrite existing structures. For a durable environment, rollback keeps additive Schema in place so adjacent Blue/Green versions remain compatible; correction uses a reviewed forward migration. Disposable targets can be recreated. No backup/restore behavior, Production database, Control-state SQLite Schema or production resource was changed.

## Exit status

All Phase 3 Tasks、Tests/Verification、Acceptance Criteria and Exit Gates pass. Data Model、Migration、Local Development、Testing and handoff documents match implementation. Create the focused Phase Commit and stop without starting Phase 4.
