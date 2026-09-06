# Phase 4 Independent Control Plane

## Scope and ownership

Phase 4 establishes the executable control boundary without implementing any long-running production action. OpenResty owns path dispatch, the standalone TypeScript `control-api` owns authentication, authorization, validation and operation creation/query, `content-worker` owns future PostgreSQL application work, and `deploy-agent` owns future privileged infrastructure execution through a declared interface only.

No formal `/api/ops/*` handler exists in Next.js. Source policy rejects any future `src/app/api/ops/**` file.

## Authentication and request safety

- Local operator requests use Ed25519 signatures over Method, exact Path/Query, SHA-256 Body Hash, Unix Timestamp and Nonce. Only the public key and scoped capabilities live in the service configuration; the checked-in private fixture is explicitly local/test-only.
- GitHub Actions tokens are verified as JWTs against the configured issuer/JWKS/audience and must exactly match repository, ref, environment and `job_workflow_ref` policy.
- Zod validates all authentication headers, external claims, idempotency keys, operation targets, application-job payloads and Owner dataset writes.
- SQLite atomically consumes Actor-scoped nonces inside the replay window. PostgreSQL and SQLite operations independently enforce idempotency-key equality semantics.
- Successful authorization, authentication/authorization denial, validation/storage failure and Infrastructure state transitions append bounded audit events without request secrets.
- Every control response is `no-store`; endpoints have exact method ownership and a fixed-window local/test rate-limit boundary.

## Durable-state split

| State class | Store | Phase 4 behavior when PostgreSQL is unavailable |
| --- | --- | --- |
| Content sync, translation, search reindex, cache revalidation | PostgreSQL `app.operational_jobs` | Create/query returns an explicit unavailable response; no inline work runs |
| Deploy, rollback, restore, recovery, server migration | host-local SQLite | Control status and operation create/query remain available |

`site_control_api` can select/insert only application jobs and select/insert/update Owner datasets. It cannot mutate Documents, Translations, Ingestion or Schema. `control-api` and `content-worker` run read-only, no-new-privileges containers with all ambient Linux capabilities dropped and no Docker Socket, OpenResty administrative mount or unrestricted host shell.

## SQLite recovery-state engine

Schema Version 2 preserves the Phase 2/3 metadata row and adds Runtime Slot/SHA state, replay nonces, Infrastructure operations and append-only audit events. Each open enables foreign keys, WAL, `synchronous=FULL`, a 5-second busy timeout and `wal_autocheckpoint=1000`.

Claims use `BEGIN IMMEDIATE`, a bounded Lease and monotonically increasing Fencing Token. Only the current Owner/Token can Start, Heartbeat or Finish an unexpired Claim. Restart reconciliation requeues expired unstarted Claims, but moves expired Running work to `needs-attention` so an unknown external side effect is never silently repeated.

## Owner-managed dataset contract

The exact `tech_footprint` and `weight_loss` payloads are documented in `docs/architecture/data-model.md` and implemented once in `src/control-plane/contracts.ts`. The narrow contract was recovered by a targeted read of the Phase 0 Legacy baseline commit because existing V2 artifacts recorded ownership but not field-level shape. The old Nuxt repository was not scanned or changed.

## Deferred work

- Phase 5 implements real application-job claim/execution and one-way GitHub ingestion.
- Phases 12–15 bind production identities, secrets, deploy-agent capabilities, workflows and deployment/recovery engines.
- This Phase performs no production operation, content synchronization, paid translation, Docker deployment, OpenResty cutover or PostgreSQL restore.
