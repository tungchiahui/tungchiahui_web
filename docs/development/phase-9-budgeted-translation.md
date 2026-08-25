# Phase 9 Budgeted Translation

## Outcome

Phase 9 adds an explicit, durable Translation Operation above the Phase 8 semantic-block memory. Content Sync and public rendering remain zero-cost paths. Translation work starts only after an authenticated operator or the manual GitHub workflow creates a PostgreSQL-backed Job.

## Provider boundary

`src/translation/provider.ts` defines strict Zod schemas for Provider Request, Estimate, Response and Usage. The paid adapter validates both sides of an external Provider integration. Local/Test uses a deterministic Fake Provider and has no external request capability.

The provider receives one current semantic Markdown block at a time. A changed block may include the validated old zh-CN, old en-US and new zh-CN targeted-patch context. The response must retain the Phase 8 AST and protected-value contract before persistence.

No Accepted ADR selects a concrete paid vendor. The vendor adapter and its runtime secret must therefore be supplied later through this boundary and proven with an explicitly authorized non-production contract test; Phase 9 does not silently choose one.

## Durable operation

Migration `0004_phase9_budgeted_translation` expands `translation_jobs` with execution mode, force, request/completion counters and cancellation state. The row shares its ID with an `operational_jobs` queue row:

- `control-api` validates/authenticates/authorizes and creates the pair transactionally;
- `content-worker` claims with PostgreSQL locking, lease and attempt semantics;
- durable progress records the plan, completed Segment IDs and exact Document IDs awaiting revalidation;
- Translation-specific `partial` is retained on the detail row while the generic queue reaches a terminal state;
- Translation remains outside the host-local recovery SQLite.

Supported scopes are `pending`, `changed`, `article` and `all`. `force` requires the literal `RETRANSLATE`; Execute requires an explicit USD budget and paid-execution confirmation.

## Cost enforcement and recovery

Dry-run reads candidates and estimates their maximum cost without calling `translate`. Execute re-reads actual accumulated cost and reserves the next estimate before every Provider request. If the next request would exceed the server-side budget, it is not sent; the Job becomes `partial` and unfinished Segments remain Pending.

A successful Segment is persisted with actual token/cost/provider/model metadata in the same transaction that rematerializes every current Document referencing it. Exact revalidation intent is written to durable progress before the revalidation call. A revalidation failure is retryable; the next attempt completes that revalidation before selecting another Segment, so it does not repeat the already recorded Provider request.

Cancellation is checked before each Segment. Queued jobs cancel immediately; running jobs observe the persisted cancellation request at the next safe boundary. Completed Segment and Usage records are never discarded.

## Control surfaces

- `./site translate <scope> --dry-run`
- `./site translate <scope> --execute --budget-usd <amount>`
- `./site translate status [job-id]`
- `./site translate cancel <job-id>`
- `/api/ops/translations` create/read/list/cancel endpoints
- manual `.github/workflows/translation.yml`

The workflow invokes the same CLI and request schema. It authenticates with short-lived GitHub OIDC and receives only Translation capabilities. Neither CLI nor workflow has a Database, Provider or Host credential.

## Observability and security

Structured worker events record Job/Segment identity, token counts, cost, provider and model. Errors are bounded and never include a request credential or Connection String. Database roles grant `control-api` only Job creation/status/cancel access and grant `content-worker` the existing content/translation execution access. Neither service receives Docker, OpenResty administration or GitHub write capability.

## Rollback and recovery

The migration is an additive Expand and can remain applied during application rollback. Disable Translation polling to stop new execution, then roll back application code; existing Phase 8 content/fallback rendering continues because no existing Segment/Document column was removed. Already completed paid work and audit data remain valid. Retry or cancel queued/running Jobs before any future Contract cleanup. No backup/restore behavior changed.
