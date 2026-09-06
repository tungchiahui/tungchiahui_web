# Phase 9 Verification Report

> Date: 2026-08-25
> Scope: Phase 9 explicit budgeted Translation only
> External operations: none

## Evidence

- Provider request/estimate/response/usage validation and deterministic Fake Provider unit tests.
- CLI Scope, mode, budget and force-confirmation parsing tests.
- Control API Authentication, no-store, estimate/execute Capability separation and PostgreSQL-unavailable failure tests.
- Disposable-stack Control API create/idempotency/read/list integration.
- Dry-run zero-call estimate for pending, exact changed/article selection and confirmed force/all planning.
- Server-side pre-request budget stop with one completed Segment, persisted `partial`, remaining Pending and exact actual cost.
- Retryable Provider failure followed by an injected exact-revalidation failure; durable retry completed without repeating the already persisted Provider request or changing the reviewed published Translation.
- Queued cancellation and provider/model/token/cost database audit.
- Existing Content Sync zero-provider structural tests and nine public Playwright E2E tests remain green.
- Empty/previous-schema migration, role/constraint and additive migration-policy gates.

## Commands

Final verification uses the repository-pinned Node.js 24.19.0 and pnpm 11.23.0:

```text
./site check
./site test
```

Final results:

- `./site check`: PASS — Biome, source policy, Drizzle consistency, strict TypeScript, Renovate validation and Next.js webpack production build.
- `./site test`: PASS — 19 test files / 80 unit tests; disposable PostgreSQL/S3Mock/control-api/content-worker/OpenResty/Next.js integration; 9 Playwright E2E; 5-migration empty/upgrade/role/constraint suite.

Automated verification uses only Fake/no-cost Provider. A real Provider Contract Test was not run because no explicit non-production Provider target, credential or paid authorization was supplied; this is the required safe branch of the Phase 9 Exit Gate.

## Acceptance and directionality

- Paid execution requires authenticated `translation:execute`, explicit Execute mode, explicit confirmation and a validated budget.
- Budget control is inside `content-worker`, immediately before every Provider request.
- Hash hits remain reused; uncovered or failed blocks remain Phase 8 Pending/Fallback.
- Content Push and public rendering cannot import or invoke the Provider execution path.
- Workflow calls the same CLI/Control API Job contract and has no Database, AI or Host credential.
- Translation updates PostgreSQL Runtime State and precise cache revalidation only; it has no GitHub write path.

## Residual boundary

The concrete paid Provider vendor is intentionally unselected because no Accepted ADR chooses one. Any future binding must use the validated adapter, keep its credential only in `content-worker`, and pass an explicitly authorized non-production Contract Test before production enablement. Phase 12/16 must preserve that runtime secret and readiness boundary; Phase 15 binds the already implemented manual workflow authentication to production configuration.

## Recovery impact

Migration `0004_phase9_budgeted_translation` is additive and retained on rollback. Turning Translation polling off stops new calls without affecting public fallback. Completed Translation/Usage remains durable; queued or partial Jobs can be queried, retried or cancelled. No destructive schema operation, production operation, paid request, GitHub write or Legacy repository read/write occurred.
