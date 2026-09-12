# ADR 0020: Narrow owner login for personal trackers

- Status: Accepted
- Date: 2026-09-12
- Authorization: Owner explicitly requested a minimal login for technical TodoList and weight-loss editing, automatic edit permission after login, and no legacy Blob data migration.
- Clarifies: ADR 0002, ADR 0014, ADR 0015

## Decision

Keep `/tech-footprint` and `/weight-loss` public and locale-aware. Their progress is PostgreSQL
runtime data, independently of GitHub-authored articles. Preserve the existing version-2 dataset
contract and revision CAS. The plan catalog remains versioned application data with stable IDs.

Add a single owner password and browser session, exclusively for the two dataset writes.
No registration, email recovery, multi-user roles, or operations console is introduced.
Successful login immediately enables editing on both pages. Every server write still authenticates.

`/api/ops/owner/session` and `/api/ops/owner/datasets/{tech_footprint|weight_loss}` belong to the
independent `control-api`. The browser actor has only `owner-dataset:write`. Its cookie is not an
alternative authentication mechanism on existing Operator/OIDC deployment, translation, or recovery
routes. Next.js retains a read-only, no-store `/api/personal-data/{datasetKey}` endpoint.

The password verifier uses Node's scrypt (N=32768, r=8, p=3, 16 random salt bytes, 64 derived bytes)
and a constant-time comparison. The sole production consumer of `OWNER_PASSWORD_HASH` is
`control-api`, through SOPS-encrypted `control_api_env`. An absent verifier disables owner login;
the development credential is explicitly rejected in production. Password input is bounded, with
five attempts per minute across the service and at most one concurrent derivation. Existing
OpenResty control rate limiting continues to apply. This small single-owner limiter resets when
the service restarts; durable abuse counters and stronger authentication remain follow-up work.

Sessions have random 256-bit tokens, with only SHA-256 token digests in PostgreSQL. Their table is
in `owner_auth`, outside public-reader/content-worker grants. The control role can select, insert,
and delete sessions, but cannot alter their schema. Sessions expire server-side after 12 hours,
are revoked on logout, and are invalidated when the configured password verifier changes. Cookies
are HttpOnly, SameSite=Strict, host-only and production Secure, with Path `/api/ops/owner`. Writes
require an exact approved Origin; JSON is mandatory for login and dataset PUT. Credentials never
enter localStorage, sessionStorage, JSON exports, application logs, or the public bundle.

Owner sessions depend on PostgreSQL. Operator/OIDC recovery authentication and SQLite recovery
state do not depend on these sessions, this schema, or the owner password. Existing recovery
availability during PostgreSQL failure remains mandatory.

Both personal pages and their public API read the database per request, without an indefinite
Next data cache. These small mutable datasets use no-store HTTP responses, so successful writes
are visible on subsequent public reads across both slots without cache invalidation jobs.

## Consequences and recovery

Migration 0007 is additive: it creates the isolated session schema and inserts only missing empty
datasets. It does not overwrite PostgreSQL data. Blob data, old browser progress, and hardcoded
legacy weight measurements are not imported. The existing dates, target ranges and authored plans
are retained, while the owner fills actual measurements again.

Browser unsaved drafts use a new sessionStorage namespace and explicit restore; login never
uploads a draft automatically. Revision conflicts pause saving and preserve the draft for export
and manual reconciliation. Failed/expired saves remain visibly unsaved.

PostgreSQL backups/PITR include tracker data and session digests. Restoring an older database could
also restore a logged-out session. The recovery checklist must rotate `OWNER_PASSWORD_HASH`
before re-enabling owner login after restore; keeping the verifier absent provides a fail-closed
activation window. This is an explicit recovery requirement, not automatic session invalidation.
Rollback leaves the additive schema and records in place. Existing application/Operator behavior
continues to work with the expanded schema.

New control service code and the owner verifier must be activated separately from the ordinary
web-slot cutover. A web-only release does not upgrade an already-running independent control-api.
Production activation is outside the implementation PR's authorization.
