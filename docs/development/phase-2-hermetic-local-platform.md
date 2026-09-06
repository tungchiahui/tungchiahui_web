# Phase 2 Hermetic Local Platform

## Command contract

```bash
./site dev
./site dev stop
./site dev reset --environment local --confirm RESET-LOCAL-DATA
./site test
```

`dev` performs prerequisite and local-Docker-context validation, renders and checks the Compose model, builds the pinned local Node image, waits for service health, initializes the local bucket, runs the Migration/Seed Hooks and reports every endpoint. A failed start stops created containers without deleting persistent development data.

`dev stop` preserves data. `dev reset` is the only destructive development command and requires both an exact Environment and Confirmation Token after printing its exact targets.

## Pinned container baseline

| Responsibility | Version | Immutable digest |
| --- | --- | --- |
| PostgreSQL 18 + PGroonga | `groonga/pgroonga:4.0.8-alpine-18` | `sha256:b5c92fa3d86ad76ce75ddd8095f60542cf025348a58b8a38cd0b4a580fe4ce68` |
| PgBouncer | `percona/percona-pgbouncer:1.25.2-5` | `sha256:ee8f9b3e8b80b379b47ae41419a0d16de7a20c2be0cae5dbf55fe403d3d9f33d` |
| Adobe S3Mock | `adobe/s3mock:5.1.0` | `sha256:65cf60155a2e235fe7d5bf6c633747d6fc7ed93f9f5a6727d86470026b83c2a2` |
| Local Node services | `node:24.19.0-bookworm-slim` | `sha256:3638d9a6fe4030bd716be989438248074489337ba3275657f93595428be4fc03` |

The local application image is tagged `tungchiahui-web-local:phase2`; it is not a Production Image or Deployment Identity.

## Implementation constraints and known pitfalls

- PostgreSQL 18 的持久化挂载目标是 `/var/lib/postgresql`。不得改回旧 Image 常见的 `/var/lib/postgresql/data`，除非先验证当前固定 Image 的实际目录契约并重跑 Clean Start/Restart/Reset Gate。
- Compose `local` Network 有意不设置 `internal: true`。验证使用的 Docker Engine 29 在 Internal Network 下不会按本项目需要发布 Loopback Host Port；当前隔离由 `127.0.0.1` Binding、Local Docker Context 拒绝、受限 Environment 和 Compose Forbidden-target Guard 共同保证。改变 Network Mode 必须重跑全部 Phase 2 Lifecycle/Isolation Test。
- Development `web` Service 有意不使用 Read-only Root Filesystem，因为 Next.js Dev Runtime 和 `.next` Cache 需要写入；`.next` 使用专用 Named Volume。它不是 Production Container Hardening 结论，Production Image/Read-only Policy 属于 Phase 12/16。
- `tools/dev/hooks.ts` 在 Phase 2 明确只允许零个业务 Migration，并在发现 `drizzle/*.sql` 时拒绝部分执行。Phase 3 添加首个 Migration 时必须同时用真实 Migration Runner/Seed Gate 替换这一拒绝逻辑和 Migration Placeholder，不能先提交 SQL 再让 `./site dev` 失效。
- Phase 2 Local Image、`control-api` Skeleton、Fake Deploy Agent 和 Fake Translation Provider 均不可成为隐藏 Production Path。

## Isolation boundary

- Host ports bind only to `127.0.0.1`; Test ports are assigned dynamically.
- Container-to-container traffic uses Docker Service DNS, never Container IP.
- Local database and S3 credentials are fixed, documented dummy values and cannot be overridden through Production credentials.
- Config validation rejects non-loopback/non-service Hostnames, Production Bucket Namespace, unexpected Credential and Control-state paths outside the dedicated directory.
- Compose rendering rejects Production Hostnames and Docker Socket mounts.
- `control-api` and Fake Deploy Agent use read-only root filesystems and `no-new-privileges`; Fake Deploy Agent also drops all Linux capabilities.
- No OpenResty, Production Recovery Directory, Production DB/S3/AI Credential or paid Translation Provider is mounted or read.

## Control state and fake capabilities

The local `control-api` owns only a Phase 2 Skeleton:

- dedicated `.local/control-state/control.db` for Development or a temporary Test directory;
- SQLite transaction-protected, versioned initialization;
- WAL journal mode, `synchronous=FULL`, foreign keys and busy timeout;
- read-only local Health/Status endpoints with `Cache-Control: no-store`.

It does not implement Production Authentication, Deployment, Rollback or Restore. The Fake Deploy Agent exposes Health/Capability metadata only and always reports Production Operations disabled. Translation uses a deterministic Fake Provider whose reported cost is always zero.

## Disposable integration lifecycle

Each real Integration run:

1. allocates a unique Compose Project, Bucket and temporary Control-state Directory;
2. assigns dynamic Loopback ports;
3. starts all services and waits for Health;
4. verifies PostgreSQL 18, PGroonga, PgBouncer, S3 PUT/GET/DELETE, Next.js and both local services;
5. restarts `control-api` and verifies SQLite state persistence;
6. inspects privilege, root-filesystem and Docker-socket boundaries;
7. removes Container, Network, Volume and temporary state in `finally` on success or failure.

The first versioned business Schema/Migration and deterministic business Seed belong to Phase 3. Affected Critical-flow E2E belongs to Phase 6.
