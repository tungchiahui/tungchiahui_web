# Phase 4 Verification Report

> Status: All Phase 4 technical, security, crash, acceptance and exit gates passed
> Verification date: 2026-08-24
> Phase 3 dependency commit: `a282a21`

## Repository and scope boundary

| Check | Result |
| --- | --- |
| V2 Worktree before Phase 4 | PASS: clean; `main` was six commits ahead of `origin/main`, latest Phase commit was `a282a21` |
| Unknown pre-existing changes | PASS: none found |
| Legacy Nuxt repository | PASS: only targeted read-only inspection at Phase 0 baseline commit for two dataset shapes; repository remained clean and unmodified |
| Production operations/resources | PASS: none; all services, PostgreSQL, S3Mock and SQLite state were local/disposable |
| Phase 5+ scope | PASS: no content fetch/sync, paid AI, public vertical slice, real deploy/cutover/restore or production identity binding |

## Boundary verification

- Standalone TypeScript `control-api` owns formal `/api/ops/*`; source policy forbids a parallel Next.js implementation.
- Ed25519 operator signing binds Method/Path/Body Hash/Timestamp/Nonce. GitHub OIDC verification binds issuer, audience, repository, ref, environment and workflow identity.
- Capability denial, malformed auth/payload, stale timestamp, body-hash mismatch, replay and conflicting idempotency are rejected.
- PostgreSQL application jobs create/query durably and never execute in the HTTP request. Owner dataset updates require exact payload validation and expected revision.
- SQLite operations remain creatable/queryable with PostgreSQL/PgBouncer stopped, while application-job endpoints explicitly return unavailable.
- OpenResty routes `/api/ops/*` directly to `control-api`; all ordinary Web capacity can be stopped while signed control status remains available.

## Crash, persistence and permissions

| Scenario | Result |
| --- | --- |
| Phase 2 schema -> Version 2 | PASS: additive migration preserves metadata and initializes runtime state |
| WAL/FULL/checkpoint | PASS: WAL, synchronous level 2 and `wal_autocheckpoint=1000` asserted |
| Concurrent claim | PASS: exactly one claimant receives a queued operation |
| Lease/fencing | PASS: expired Claim requeues with a new token; stale token is rejected |
| Running crash/restart | PASS: expired Running operation becomes `needs-attention`, never blind replay |
| Heartbeat/finish | PASS: only active Owner/Token can renew or reach completed/failed |
| Audit durability | PASS: retry/restart preserves events; SQLite triggers reject update/delete |
| Container permissions | PASS: control-api/content-worker are read-only, drop all capabilities, set no-new-privileges and mount no Docker Socket |
| Failure cleanup | PASS: disposable Container, Network and Volume are removed even after partial startup failure |

## Quality gates

| Gate | Actual result |
| --- | --- |
| Biome / Source Policy | PASS |
| Drizzle consistency | PASS |
| Strict Typecheck | PASS |
| Unit | PASS: 15 files, 44 tests |
| Disposable integration | PASS: OpenResty routing, restart persistence, Next-down, PostgreSQL-down, role and state boundaries |
| Dedicated migration integration | PASS |
| Renovate validation / Production build | PASS |
| `./site check` / `./site test` | PASS with Node.js `24.19.0` and pnpm `11.23.0` |
| E2E | Honest `NOT_IMPLEMENTED`; replacement remains Phase 6 because no public vertical slice exists |

## Recovery impact

PostgreSQL changes add only a NOLOGIN least-privilege role and grants; no business schema migration or destructive change exists. SQLite Version 2 is additive from the prior metadata schema. In durable deployment, the state directory must be backed up as an explicit recovery volume and forward-migrated; an interrupted Running operation is surfaced for manual reconciliation. No production backup/restore procedure or resource was exercised.

## Exit status

All Phase 4 Tasks, Tests/Verification, Acceptance Criteria and Exit Gates pass. Architecture, Data Model, local/testing behavior and handoff documents match the implementation. Create the focused Phase commit and stop without starting Phase 5.
