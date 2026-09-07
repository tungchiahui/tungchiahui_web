# Phase 13 Tested Recovery

## Scope and safety boundary

Phase 13 implements PostgreSQL backup, WAL/PITR, remote replicas, control-state recovery and a PostgreSQL-independent restore control path. ADR 0018 establishes the final Production topology: provider-neutral `BACKUP_S3_*` AList Primary and `BACKUP_OFFSITE_S3_*` R2 Off-site replicas. It does not deploy to Production, run a destructive Production restore, contact the real AList/R2 targets, modify the legacy Nuxt repository, or implement Phase 14 blue-green deployment.

All destructive automated verification runs against a disposable PostgreSQL 18 data directory bearing an explicit `.tungchiahui-disposable-recovery-target` marker. Production restore additionally requires the exact `/var/lib/postgresql/18/docker` target and `RESTORE-PRODUCTION` confirmation.

## Repository compatibility decision

Phase 11 proved the generic object operations used by the application against the Owner-authorized AList `TEST` bucket, but also recorded missing usable ETag and normalized Cache-Control behavior. That is sufficient for the generic asset adapter, not for claiming every pgBackRest native S3 repository semantic.

Phase 13 therefore selects:

```text
PostgreSQL 18 + WAL archive
  -> encrypted pgBackRest 2.59.1 local repository
  -> immutable generation manifest + per-entry SHA-256
  -> primary BACKUP_S3_* replica (AList in Production)
  -> off-site BACKUP_OFFSITE_S3_* replica (R2 in Production)
```

Each generation captures regular files and pgBackRest relative symbolic links. Upload is followed by manifest, object-count and full streaming checksum verification. A backup record is valid only when pgBackRest `check`/`verify` and both remote replica read-backs pass. Restore prefers the verified AList Primary generation and falls back to the matching R2 Off-site generation before invoking pgBackRest by backup set or timestamp.

The Production policy retains two full and four differential backups plus WAL for two full ranges. Full, differential and incremental execution all use the same engine and record Backup ID/type, start/completion, bytes, seconds, WAL maximum, repository generation, manifest hash and both replica states in host-local SQLite.

## Recovery control path

`./site backup`, `backup status` and `restore` use the signed independent Control API. Backup and restore requests become Version 4 SQLite infrastructure operations; `deploy-agent` claims only `recovery`/`restore` types with the existing transaction, lease and fencing model. Phase 14 deploy/rollback operations remain unimplemented and unclaimed.

For a restore, the agent validates the runtime/control-state/request Environment, verified dual-replica record and manifest, confirms PostgreSQL is stopped, reconstructs and verifies the repository from Primary or Off-site fallback, validates the destructive target, clears only its contents, and runs pgBackRest. Errors are recorded as failed audited operations without marking unverified backups valid.

If the Control API is unavailable, the CLI's explicit `--break-glass --inventory-host <stable-alias>` path invokes the recovery authorization entrypoint inside the same deploy-agent image. It writes `break_glass_restore_authorized` and the normal restore operation into the same SQLite state. It does not run a parallel restore script or accept a numeric public IP as durable identity.

## Control-state continuity

The SQLite schema adds recovery backup records while retaining the Phase 4/12 operation, active/previous slot and SHA metadata. A consistent snapshot performs WAL `TRUNCATE` checkpoint and `VACUUM INTO`, then records SQLite integrity, foreign-key status, schema version, environment, operation/audit counts, active/previous slot, current/last SHA and an append-only audit digest.

The snapshot is encrypted with age and replicated to both Backup S3 targets. Each receives an immutable snapshot manifest and a read-back-verified per-environment `latest.json`, so complete local control-state loss can discover the newest artifact without relying on the lost SQLite database. Restore tries Primary then Off-site, verifies encrypted bytes, decrypts into a temporary file, checks integrity/schema/environment/audit evidence, then atomically replaces the target. The recovery services use a shared group-writable, setgid control-state directory and restrictive `0007` umask so the independent control-api and deploy-agent can safely share SQLite without broad filesystem permissions.

## Disposable drill

`pnpm test:recovery` builds the pinned PostgreSQL/PGroonga + pgBackRest image and the non-root recovery image, then creates one PostgreSQL instance and two separate S3Mock instances/identities. It performs:

1. full backup and dual-replica verification;
2. pre-target application write and WAL switch;
3. post-target write, differential backup, later write and incremental backup;
4. PostgreSQL stop and repository reconstruction from verified Primary/Off-site replicas;
5. intentional pre-backup PITR rejection after guarded target preparation, followed by marker-authorized deterministic retry;
6. valid timestamp PITR and PostgreSQL restart;
7. PostgreSQL major, schema marker and representative application reads, including exclusion of post-target rows;
8. Primary/Off-site `latest.json` discovery、encrypted control-state restore and audit-digest comparison;
9. deterministic cleanup.

Unit and HTTP gates additionally cover credential independence, repository corruption, target marker/confirmation/environment rejection, PostgreSQL-down create/query/claim, lease recovery, shared break-glass audit and SQLite snapshot integrity.

## Explicit deferrals

- Production RPO/RTO remains undefined. A disposable micro-dataset measurement proves instrumentation only and is not a Production SLA.
- Production schedules/credentials and any real AList/R2 execution require later explicitly authorized operations.
- Phase 14 owns shared deployment/rollback, cutover and broader Docker/OpenResty mutation capability.
