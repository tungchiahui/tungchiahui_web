# Phase 2 Verification Report

> Status: All Phase 2 technical, isolation, acceptance and exit gates passed
> Verification date: 2026-08-24
> Phase 1 dependency commit: `f59d49f425c684e13b87397933d064061bb9c673`

## Repository and scope boundary

| Check | Result |
| --- | --- |
| V2 Worktree before Phase 2 | PASS: Clean; HEAD was the accepted Phase 1 Commit |
| Legacy Nuxt Repository | PASS: Untouched and Clean; final read-only check at HEAD `155c39874fef1d1de4587d1dc5dacb2c42756a38` |
| Production operations | PASS: None |
| Production credentials | PASS: Not requested, read or mounted |
| Phase 3+ scope | PASS: No business Schema, Drizzle Migration, real Control Operation, paid Translation or Website Feature |

## Locked infrastructure

| Service | Verified version | Immutable digest |
| --- | --- | --- |
| PostgreSQL + PGroonga | PostgreSQL `18.x`, PGroonga `4.0.8` | `sha256:b5c92fa3d86ad76ce75ddd8095f60542cf025348a58b8a38cd0b4a580fe4ce68` |
| PgBouncer | `1.25.2` / image revision `1.25.2-5` | `sha256:ee8f9b3e8b80b379b47ae41419a0d16de7a20c2be0cae5dbf55fe403d3d9f33d` |
| Adobe S3Mock | `5.1.0` | `sha256:65cf60155a2e235fe7d5bf6c633747d6fc7ed93f9f5a6727d86470026b83c2a2` |
| Local Node services | `24.19.0-bookworm-slim` | `sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` |

Verification host used Docker Engine `29.7.2` and Docker Compose `5.5.0`. The CLI additionally rejects non-local `ssh://` and `tcp://` Docker Context endpoints.

## Development lifecycle

| Gate | Actual result |
| --- | --- |
| Clean start | PASS: all six long-running services healthy |
| Endpoint report | PASS: Website, Control API, Fake Agent, PgBouncer, S3Mock, Bucket and SQLite path reported |
| PostgreSQL/PGroonga | PASS: PostgreSQL major `18`; PGroonga extension created idempotently |
| PgBouncer | PASS: pooled SQL query reached PostgreSQL through Docker Service DNS |
| S3Mock | PASS: local bucket initialization and S3 PUT/GET/DELETE round trip |
| Migration Hook | PASS: explicit `0` versioned migrations before Phase 3 |
| Seed Hook | PASS: explicit `0` business fixtures before Phase 3 |
| Ordinary Restart | PASS: PostgreSQL System Identifier and SQLite initialization timestamp unchanged |
| Unconfirmed Reset | PASS: rejected with exit code `2`; data remained |
| Confirmed Reset | PASS: exact local Container/Network/Volume/Control-state targets deleted |
| Clean Start after Reset | PASS: new PostgreSQL System Identifier and new isolated Control State |

## Disposable test lifecycle

- `./site test` passed twice consecutively while the Development Stack was running.
- Each run used a unique Compose Project, dynamic Loopback ports, isolated PostgreSQL/S3Mock/Next volumes, a unique `tungchiahui-test-*` Bucket and a temporary SQLite directory.
- PostgreSQL 18, PGroonga, PgBouncer, S3Mock, Next.js, `control-api` and Fake Deploy Agent were verified.
- Restarting `control-api` preserved the SQLite Schema Version, Environment and initialization timestamp.
- Both successful runs removed all Test Container, Network, Volume and temporary state.
- Explicit `SITE_TEST_INJECT_FAILURE=after-start` returned non-zero and still removed every disposable resource.

## Isolation and privilege verification

- Compose contains no Production Hostname or Docker Socket mount.
- Host ports bind only to `127.0.0.1`; Test ports are dynamically assigned.
- Container connections use `postgres`, `pgbouncer`, `s3mock` and other Docker Service DNS names rather than Container IP.
- Runtime parsing rejects Production/non-local endpoints, non-local Bucket Namespace, credential override and Control-state path escape without echoing rejected credential values.
- `control-api` and Fake Deploy Agent are Non-privileged, `no-new-privileges`, read-only-root services without Docker Socket; Fake Deploy Agent drops every Linux capability.
- SQLite uses versioned transactional initialization, WAL, `synchronous=FULL`, foreign keys and a dedicated bind-mounted directory.
- Translation uses the deterministic Fake Provider and reports Cost `0`.

## Quality gates

| Gate | Actual result |
| --- | --- |
| Biome | PASS: 53 files |
| Source policy | PASS: no `.js`/`.jsx` Application Source, `@ts-ignore`, explicit `any` or Server/Client violation |
| Typecheck | PASS |
| Unit | PASS: 10 files, 25 tests |
| Renovate validation | PASS |
| Production build | PASS |
| Clean Checkout frozen install | PASS |
| Clean Checkout `./site dev` / `./site test` | PASS |
| Clean Checkout Stop/Restart / Safe Reset | PASS |

## Honest future-suite status

| Suite | Status | Owner | Replacement |
| --- | --- | --- | --- |
| Database Migration | `NOT_IMPLEMENTED` | Repository Owner | Phase 3 |
| Affected Critical-flow E2E | `NOT_IMPLEMENTED` | Repository Owner | Phase 6 |

The Phase 1 Integration Placeholder has been removed and CI now runs the real Disposable Infrastructure Integration Suite.

## Host toolchain note

All gates used the repository-locked Node.js `24.19.0` and pnpm `11.23.0`. Fedora 44's current system RPM provides Node.js `24.18.0`; that system binary is correctly rejected by the exact Phase 1 Toolchain Guard until the distribution publishes the locked patch or another documented exact-version installation is selected.

## Exit status

All Phase 2 Tasks, Tests/Verification, Acceptance Criteria and Exit Gates pass. Update the implementation plan, create the focused Phase Commit and stop without starting Phase 3.
