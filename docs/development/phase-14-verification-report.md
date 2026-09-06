# Phase 14 Verification Report

## Result

Phase 14 passes its implementation-level shared blue-green, failure injection, crash reconciliation, migration compatibility and rollback gates without any Production operation or legacy-repository access. The local Production-like topology performs a real inactive-slot deployment, migration, complete pre/post smoke, atomic OpenResty switch and no-rebuild rollback.

## Gate evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Immutable identity | HTTP, CLI and engine require full Git SHA plus exact `sha256` digest; missing image is rejected | PASS |
| Shared state machine | CLI and future automation use the same Control API, SQLite operation and deploy-agent engine | PASS |
| Active/inactive lifecycle | real green candidate recreation keeps blue public until all pre-cutover gates pass; observed traffic must match durable current/pending identity and same-release redeploy is rejected | PASS |
| Migration policy | one-shot least-privilege runner, advisory lock, journal/hash verification, Expand-only and backup-evidence gate | PASS |
| Pre/post smoke | health, ready, exact version, home, article, locale, search page/API and static asset through candidate and OpenResty | PASS |
| Atomic cutover | dynamic directory mount, proposed-config validation, atomic rename and HUP; validation failure never calls switch | PASS |
| Rollback | retained blue digest is verified and switched without candidate preparation or image rebuild | PASS |
| Failure isolation | missing immutable image, pre-smoke/config failures and PostgreSQL dependency failure leave active blue unchanged | PASS |
| Post-cutover abort | injected public smoke failure returns traffic to blue, removes failed green and clears invalid rollback target | PASS |
| Crash recovery | start, migration-complete, cutover-intent and traffic-switched phases preserve evidence and resume without repeating completed destructive work | PASS |
| Concurrency | a second deploy/rollback is rejected while recovery work remains independently claimable | PASS |
| PostgreSQL-down control | deployment create/query/claim succeeds from SQLite; migration fails explicitly and candidate cleanup preserves public release | PASS |
| Privilege separation | only deploy-agent has the socket/dynamic-config capability; control-api, workers and web remain non-root/read-only/drop-all | PASS |
| Previous-schema overlap | existing previous-schema-to-latest migration and application compatibility suites remain green | PASS |
| Production safety | temporary host root, high local port, self-signed certificate and disposable database only; no public cutover | PASS |

## Automated commands

- `pnpm test:unit` — PASS, 24 files / 116 tests, including deployment engine, HTTP/SQLite boundaries, configuration, infrastructure and CLI policy.
- `pnpm test:infra` — PASS, including idempotent Ansible provision and the real Production-like blue-green/failure/rollback topology.
- `pnpm test:recovery` — PASS, confirming SQLite Version 5 did not regress Phase 13 backup/PITR/control-state recovery.
- `pnpm test:integration` and `pnpm test:migration` — PASS, including critical public flows and previous-schema migration compatibility.
- `pnpm site:test` — PASS for the composed Phase 14 test entry.
- `pnpm site:check` — PASS for format/lint/source policy/Drizzle/typecheck/Renovate/build.

## Deterministic failure behavior

Pre-cutover failures clear any pending cutover intent, remove only the failed inactive candidate and leave the active release and OpenResty target unchanged. Invalid OpenResty configuration fails validation before reload. Post-cutover public-smoke failure uses the persisted previous release to switch back, then removes and discards the failed candidate. A normal rollback only verifies the retained container and switches traffic; it does not invoke candidate preparation or migrations.

An interrupted operation keeps its last durable phase when its lease expires. Reconciliation issues a new fencing token and advances only missing phases. The `traffic-switched` case uses the recorded pending release and observed OpenResty slot to commit state without a second switch.

## Recovery validation plan

Before a Production deployment containing a migration marked as requiring backup, require a valid dual-replica record inside the explicitly configured freshness limit. Keep the previous slot for the configured stabilization interval and do not run Contract migration while it is a rollback target. If deployment/control-state behavior changes, rerun both the Production-like deployment gate and the disposable recovery drill. If a Version 5 control-state migration itself must be rolled back, restore a verified matching Version 4 snapshot before starting the older control-plane binary.

## Explicit non-actions

No Production host, DNS, EdgeOne, AList/R2 target, GitHub write, paid AI provider, public traffic or legacy Nuxt repository was accessed or changed. Phase 15 automation and Phase 18 production cutover remain unstarted and require separate Owner authorization.
