# Phase 5 One-way Content Ingestion

## Scope and authority

Phase 5 establishes the first executable Authoring-to-Runtime path:

```text
control-api -> PostgreSQL content_sync job -> content-worker
            -> exact GitHub commit tree/blob GET -> validated Markdown snapshot
            -> transactional PostgreSQL materialization -> deferred typed hooks
```

GitHub remains the only Canonical zh-CN Markdown Authoring Source. PostgreSQL is a materialized Runtime Store. This phase adds no Public Page, paid translation, PGroonga ranking, image build, Blue-Green deployment, production credential or Production-to-GitHub write path.

## Read-only source boundary

`src/content/github-source.ts` exposes one operation: `fetchSnapshot(sourceCommit)`. It reads an exact recursive Git Tree and its Blob objects with HTTP `GET`. It validates repository identity, Commit SHA, Tree/Blob response shape, non-truncated Tree, Blob SHA and canonical directory grammar. Generated `content/_i18n/**` and non-Markdown paths are excluded.

Public repositories require no token. The optional server-only token is named `GITHUB_CONTENT_READ_TOKEN` and must have read-only access. The Adapter has no Commit, Push, PR, Edit or Delete method.

## Parse, route and identity

- unified/remark parses Markdown and frontmatter and remark-rehype validates the conversion boundary.
- YAML uses the safe Core Schema; Zod strictly accepts only the four Phase 0 Minimal Frontmatter combinations built from `title`, `date`, `path` and `description`.
- Blog explicit `path` has priority and preserves `!`/`_`. Wiki and Blog fallback routes use the Phase 0 transliteration/sanitization contract with pinned `pinyin-pro`.
- The complete candidate Route Set and approved Alias Set are checked before a PostgreSQL write. Collision fails the job and preserves the previous Runtime snapshot.
- Identity matches Source Path first, identical Public Route second, then a unique Source Hash for provable Move/Rename continuity. Ambiguous hash matches fail instead of guessing.
- Delete is a timestamped Soft-delete. Reappearance at the same Path/Route reuses the existing Document identity.

## Transaction and side effects

Document Insert/Update/Move/Delete, approved Alias reconciliation and the successful `ingestion_runs` summary commit in one PostgreSQL Transaction. Move staging prevents transient unique-index conflicts. Same Commit/Content replay does not update Document rows or emit hooks.

The only Phase 5 hooks are typed boundaries:

| Hook | Phase 5 behavior | Replacement phase |
| --- | --- | --- |
| Translation diff | structured zero-cost deferred event | 8 |
| zh-CN revalidation | structured deferred event | 6 |
| Search refresh | structured deferred event | 10 |

No hook calls an AI Provider or build/deployment process.

## Durable worker behavior

Migration `0002_phase5_job_claiming` additively gives `operational_jobs` an Attempt Limit, Available Time and Worker Claim/Lease. Claim uses `FOR UPDATE SKIP LOCKED`; Progress and Terminal Transition require the current Worker claim. Expired claims become Retry or Failed at the limit. Errors are bounded and stored without credentials.

`content-worker` continues using `site_content_worker`. It has no Docker Socket, OpenResty administrative mount, unrestricted Host Shell or SQLite Control-state write access. Content/Translation/Search jobs remain PostgreSQL-backed.

## Local behavior and recovery

Local Compose keeps external GitHub Polling Idle by default so `./site dev` never silently requires network or credentials. Disposable Integration uses the production Worker/Repository classes with a deterministic in-memory read-only source.

The database migration is forward-compatible and non-destructive. Rollback is a code rollback that leaves nullable/defaulted Claim columns, imported Documents, Soft-delete history and Alias rows in place. A reviewed forward-fix is preferred to removing materialized content or schema. No production backup/restore resource was used in Phase 5.
