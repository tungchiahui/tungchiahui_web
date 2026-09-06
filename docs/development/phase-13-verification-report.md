# Phase 13 Verification Report

## Result

Phase 13 passes its implementation-level recovery gates without any Production operation. The repository contains a tested full/differential/incremental pgBackRest policy, WAL/PITR, verified primary and independent R2 replicas, encrypted control-state backup/restore, PostgreSQL-independent control operations and an audited same-engine break-glass path.

## Gate evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| pgBackRest policy | pinned 2.59.1, encrypted local repository, full/diff/incr, retention, `check` and `verify` | PASS |
| Repository decision | Phase 11 evidence reused; Local Repository + Verified Sync selected rather than unproven direct AList repository | PASS |
| WAL/PITR | real WAL switches/archive and timestamp restore on disposable PostgreSQL 18 | PASS |
| Application integrity | version 18, schema marker 6, base/pre-target rows present; post-target/later rows absent | PASS |
| Primary replica | distinct identity/bucket, full manifest/object streaming checksum read-back | PASS |
| R2 replica | independent identity/bucket/S3Mock process; sole source for restore materialization | PASS |
| Backup validity | SQLite record includes WAL/bytes/seconds/hash/freshness; both replicas required for `valid=true` | PASS |
| PostgreSQL-down control | signed HTTP backup/restore create/query and SQLite claim work with no PostgreSQL configuration | PASS |
| Lease/crash | existing SQLite reconciliation/lease/fencing gates plus recovery-only filtered claim | PASS |
| Restore safety | stopped-database requirement, Environment/Confirmation and disposable marker; pre-clear rejection leaves data intact | PASS |
| Partial restore retry | invalid pre-backup PITR fails after guarded clear, target stays non-bootable/stopped, marker-authorized retry restores successfully | PASS |
| Break-glass | stable inventory alias, exact Production confirmation, same operation schema/state/lease/agent and explicit audit | PASS |
| Control-state | WAL checkpoint, consistent snapshot, age encryption, dual replication, integrity/schema/environment/audit restore | PASS |
| Failure evidence | corrupt repository and wrong environment/confirmation/target tests reject recovery | PASS |
| Production safety | no Production/AList/R2/legacy operation; only disposable local containers and random temp roots | PASS |

## Measurements and RPO/RTO status

The post-partial-failure disposable recovery drill produced this retained structured measurement sample:

| Operation | Backup ID / target | Verified repository bytes | Seconds |
| --- | --- | ---: | ---: |
| Full | `20260825-151518F` | 6,631,760 | 15.431 |
| Differential | `20260825-151518F_20260825-151535D` | 7,329,457 | 20.391 |
| Incremental | `20260825-151518F_20260825-151556I` | 7,969,841 | 25.636 |
| R2 materialize + PITR + database ready | `2026-08-25T15:15:33.884Z` | — | 8.248 |

The WAL maximum advanced from `000000010000000000000005` through `...000A` to `...000E`. The byte figure is the complete independently restorable repository generation uploaded and read back for that step, not only the pgBackRest delta. These micro-dataset values demonstrate measurement plumbing, not capacity planning.

Production RPO and RTO remain **undefined**. Defining them requires multiple authorized Production-like drills using representative database size, WAL rate, host disk, primary backup network and R2 retrieval behavior. No SLA is inferred from S3Mock or this small fixture.

## Automated commands

- `pnpm test:recovery` — PASS: real full/diff/incr, WAL archive, dual replica, R2 restore, PITR, schema/application read and encrypted control-state restore.
- `pnpm test:infra` — PASS: idempotent hardened production-like topology with the recovery image, shared SQLite permissions and existing Next/PostgreSQL-down control route.
- `pnpm site:test` — PASS: Unit, production infrastructure, recovery drill, application integration/E2E and migration suites.
- `pnpm site:check` — PASS: Biome, source policy, Drizzle, strict TypeScript, Renovate validation and production build.

## Recovery validation plan

Before any Production restore, require a fresh valid backup record with both replicas `fresh`, preserve incident evidence, select backup ID or ISO timestamp, record reason/approval, prefer a disposable validation restore when time permits, use the exact Environment confirmation, and verify PostgreSQL version, schema/migrations, integrity, representative reads and audit before resuming writes. If Control API is unavailable, use only the documented stable-alias break-glass route; it must still create the same SQLite operation and audit.

Backup/storage behavior changes must rerun both the disposable recovery gate and the authorized provider contract relevant to the changed semantics. A failed or partially replicated generation remains invalid and cannot be selected automatically.

## Rollback and recovery impact

The control-state Version 4 migration is additive and retains Version 3 metadata. Rolling application code back leaves the recovery backup table unused but does not destructively alter PostgreSQL business schema. The custom PostgreSQL image preserves PostgreSQL 18/PGroonga and adds pinned pgBackRest; application database migrations are unchanged. The previous Phase 12 deploy behavior remains deferred—Phase 13 only grants the existing deploy-agent narrowly enumerated PostgreSQL stop/start and recovery work.
