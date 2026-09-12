# Phase 14 Shared Blue-Green Deployment

## Scope and safety boundary

Phase 14 replaces the recovery-only deployment stub with one auditable blue-green state machine. It operates only through the independent Control API, host-local SQLite and the existing least-privilege `deploy-agent`. The implementation does not enable a `main` branch production trigger, cut over the legacy production site, contact Production infrastructure, modify the legacy Nuxt repository, or create a second manual/CI deployment path.

The accepted release identity is an exact 40-character lowercase Git SHA plus a Docker content digest in `sha256:<64 lowercase hex>` form. Tags, `latest`, short SHAs and unresolved image names are rejected at the HTTP, CLI and engine boundaries.

## Shared control and execution path

Human operation uses:

```text
./site deploy [git-sha] --image-digest sha256:<digest>
./site rollback
./site status
```

The CLI signs requests to `POST /api/ops/deployments`, `POST /api/ops/rollbacks` and `GET /api/ops/status`. The Control API performs authentication, capability authorization, replay protection, runtime validation and idempotent SQLite operation creation, then returns without running long work. The same endpoints are the only integration surface available to Phase 15 automation.

The existing `deploy-agent` independently claims `deploy`/`rollback` and `recovery`/`restore` operation classes. Deployment concurrency rejects a second incomplete deploy or rollback, while recovery work remains independently claimable. No deployment state is stored in PostgreSQL and neither `control-api` nor `content-worker` receives Docker access.

## Durable deployment state

Control-state schema Version 5 additively records:

- active and previous slot;
- current and last Git SHA plus exact image digest;
- pending slot/SHA/digest cutover intent;
- cutover timestamp and the legacy-compatible nullable stabilization field;
- operation phase, lease owner/expiry, fencing token, actor, reason and append-only audit.

The engine persists each completed phase before moving forward: preflight, candidate preparation, migration, pre-cutover smoke, cutover intent, observed traffic switch, committed cutover and post-cutover smoke. An expired running deployment preserves its exact phase, enters `needs-attention`, and is requeued by deployment reconciliation. A new fencing token resumes from durable evidence instead of replaying already-completed destructive phases.

The pending cutover intent makes the only ambiguous crash window recoverable. On every execution, the engine compares the release actually serving traffic with either the durable current release or the complete pending cutover identity. Any other mismatch stops before mutation. If OpenResty already points at the pending slot, reconciliation commits the recorded state; if it still points at the old slot, the engine validates and performs the switch. Ordinary runtime initialization happens only when no active release has yet been recorded, and a fresh request to deploy the already-active release is rejected without touching either slot.

## Candidate, migration and smoke gates

Deployment targets only the inactive slot. The Docker adapter validates the requested local image digest, recreates only the inactive container from a validated hardened template, retains its non-root/read-only/capability/network settings, and starts it with the requested SHA and slot identity.

The one-shot Production migration runner uses `site_migrator_login`, an advisory lock, checked-in Drizzle journal hashes and migration policy. It cannot bootstrap roles or extensions with an administrative identity. Contract migrations are rejected; declared fresh-backup requirements consume only a valid record whose Off-site replica is fresh and inside the explicitly configured freshness window. Production backup freshness is required configuration, not a hard-coded RPO/RTO claim. ADR 0020 later removed the fixed deployment-stabilization duration and its time-based release block while retaining the remaining gates.

Before cutover the candidate must pass health, readiness, exact version/slot, homepage, representative article, locale route, search page, locale-scoped non-empty search API and static asset checks. OpenResty validates the proposed dynamic upstream file before an atomic rename and HUP reload. The same public checks then run through the real OpenResty entry.

Any failure before cutover leaves the active slot untouched and removes the failed candidate. A post-cutover smoke failure atomically switches back to the retained release, commits that traffic state, removes the failed release and clears it as a rollback target. An explicit rollback verifies and switches to the already-running retained digest; it never rebuilds the image.

## PostgreSQL independence and dependency reporting

Status and operation creation use SQLite only. PostgreSQL being unavailable therefore does not stop a signed deploy request from being accepted, queried or claimed. The deployment then fails explicitly at the migration dependency, cleans the inactive candidate and leaves the public active release unchanged. Rollback state itself remains queryable and recoverable independently of PostgreSQL; application readiness/smoke can still report the database incident.

## Configuration and privilege boundary

Ansible creates a group-writable, setgid deployment configuration directory and installs the initial active-slot file without overwriting later state. OpenResty mounts that directory read-only so atomic renames are visible. `deploy-agent` mounts it writable and is the only service with the Docker socket. Its adapter issues only the documented image/container inspection, inactive/migration lifecycle, OpenResty exec/reload and Phase 13 PostgreSQL recovery requests.

Blue and green image/SHA values are separate Compose inputs. The migration runner receives only its dedicated database login. The deploy agent receives no application, translation-provider or GitHub write credential.

## Rollback and recovery impact

Application rollback remains a traffic switch to the retained immutable image and is verified without rebuild. The SQLite Version 5 migration is additive to Version 4 and its backup evidence now includes the deployment digests and pending/cutover fields through the database snapshot itself. Recovery and deployment keep separate claim filters but share the same transaction, lease, fencing and audit store.

Rolling the control-plane binary back to a pre-Version-5 build requires restoring a verified Version 4 control-state snapshot; application image rollback does not. No PostgreSQL business migration is added by Phase 14. Future schema changes must remain Expand-only while the previous slot is retained, and Contract work belongs to a later release after the rollback window.
