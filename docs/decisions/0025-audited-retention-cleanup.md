# ADR 0025: Audited retention cleanup

- Status: Accepted
- Date: 2026-09-23
- Supersedes: ADR 0019 only where it deferred remote-generation deletion

## Context

ADR 0019 deliberately kept AList/R2 generations forever until the Owner approved an exact policy.
The Owner has now approved three bounded policies: database recovery generations keep 90 days and
at least four verified Full chains; host Docker keeps every container reference, Current/Previous and
the newest five project releases; GHCR keeps the newest twenty releases and never deletes a version
younger than thirty days.

Unscoped `docker system prune`, bucket-wide orphan deletion and package-wide deletion are unsafe
because they can remove rollback or recovery evidence.

## Decision

- AList/R2 cleanup is limited to `backups/database-backups/<generation>/`. Ordinary assets,
  `asset-backups/`, control-state artifacts and unrelated R2-only objects are outside this policy.
- A recorded recovery generation is eligible only when it is older than 90 days, outside the newest
  four valid dual-replica verified Full chains and no competing recovery/restore operation exists.
  Failed or partial old generations may therefore be reclaimed, while only verified chains satisfy
  the minimum recovery-point floor.
- A plan contains exact object keys and a SHA-256 digest. Execute recomputes the same evaluated-time
  plan and fails closed on any digest drift. After both replicas are empty, Control-state records the
  immutable generation as retired instead of deleting audit history.
- Host Docker cleanup is executed only by `deploy-agent`. It only selects the four project image
  repositories, protects every image referenced by any container, protects Current/Previous/Pending,
  and protects the newest five release SHAs. It never deletes containers, volumes or build cache.
- GHCR cleanup runs in a dedicated GitHub Actions workflow with only `contents: read` and
  `packages: write`. It selects only single-SHA-tagged versions older than 30 days and outside the
  newest 20 release SHAs. Untagged, multi-tagged and unknown versions are preserved.
- The Host cleanup runs Sunday 06:30 Asia/Hong_Kong after the Full-backup window. GHCR runs Sunday
  07:30 Asia/Hong_Kong. Manual Host execution remains available as `./site cleanup retention` and is
  dry-run by default; execute requires `RETENTION-CLEANUP-PRODUCTION`.
- Control-state Schema 8 adds operation result JSON and recovery-record retirement timestamps so the
  exact plan/result remain auditable and deleted objects are never advertised as restorable.

## Consequences

Retention reduces unbounded storage without introducing global cleanup. A state change between plan
and execute requires a new plan. Fewer than four verified Full chains or another active recovery
operation blocks remote deletion while still allowing independently safe Docker planning. GHCR
versions remain restorable under GitHub's platform retention window, but restore is an explicit
operator action rather than part of cleanup.
