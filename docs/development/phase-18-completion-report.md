# Phase 18 Website V2 Completion Report

> Final acceptance date: 2026-09-12 Asia/Hong_Kong
> Result: PASS — Owner accepted the report and closed the legacy Nuxt rollback window

## Production Release

| Evidence | Final state |
| --- | --- |
| Public site | `https://www.tungchiahui.cn` served by Website V2 |
| Active Web slot | Blue |
| Web Git SHA | `98d1002f30d4a2191ebb4f9848d7661536a4ea8b` |
| Web image digest | `sha256:f2cb1c0bf59d82a4ea786f5c7e8c35f5645362b21f6ae0f7ea9d1488d262e993` |
| Deployment operation | `5548e323-09dd-42a0-8192-2c5da5931743` / `deployment-verified` |
| Immediate rollback | Healthy Green slot at `fff1af79c4a13b21ba3a2fdf9768554c117814e6` |
| Background runtime | Control API, Content Worker and Observability Agent use Service digest `sha256:c435b5c645b7216f0b5df9e1f19318e5f5b5dee12fd57cd46b68689a0c4828ba` |

The shared deployment engine completed migration, inactive-slot creation, pre-cutover probes, atomic
OpenResty switch and post-cutover public smoke. No rebuild was used for the retained rollback target.
The host continues to publish only the internal V2 ingress on `127.0.0.1:3100`; 1Panel OpenResty and
EdgeOne remain the Owner-managed external TLS and acceleration layers.

At the acceptance checkpoint, `PRODUCTION_DEPLOYMENT_ENABLED` remained disabled and application
releases required an explicit Owner-triggered invocation of the same shared deployment engine. Later
on 2026-09-12, the Owner explicitly selected continuous automatic Production deployment after every
successful `main` Quality Gate. The same shared engine, immutable-image verification, deployment
mutex, pre/post-cutover smoke and automatic rollback protections remain mandatory. The canonical
Content Repository push workflow is independent: a Content push enters Content Sync automatically,
but never builds a Next.js image or triggers Blue/Green deployment.

## Compatibility and Content

The Phase 0 inventory was refreshed against the final read-only legacy state and is recorded in
`docs/migration/phase-18-legacy-delta.md`. The final matrix has no unaccepted URL, Pinyin, Locale,
content, asset, visual or feature regression. Blog/Wiki and special-page evidence is recorded in the
two Phase 18 compatibility reports.

Production materialization finished at canonical content commit
`68b7cf36947cfe390503196e965a7edcb75a0ecf`:

- 238 active and 0 deleted documents: 5 Blog and 233 Wiki;
- one active source commit, with no duplicate route or source-path condition;
- 238 Search projections for each of `zh-cn`, `zh-hk`, `zh-tw` and `en-us`;
- 0 Translation Jobs, 0 provider requests and USD 0 paid translation cost;
- Content and Search polling enabled; backlog, running jobs and expired leases all 0.

Three queued Content Sync jobs were processed in order. The intermediate commit
`f7f999fde2eea25552d76d6e48fd64b68a9b92bb` failed closed because its canonical snapshot was invalid;
the later commit succeeded and is the sole materialized source. This leaves one explained, time-bounded
`ApplicationJobStuck` warning and no unexplained Critical alert.

Public smoke returned 200 for unprefixed and all four Locale variants of Home, Blog, Wiki, Start, More,
Music, Stats and the representative article. Health, readiness, version, `ROS2_Control` search and the
representative S3 asset also returned 200. The asset body SHA-256 remained
`388b1096e50df6dc3b408bce526472795ddb9054e82a68175a9f73f2f7f2825e`; reviewed CSP, HSTS, MIME,
Referrer, Permissions, Frame and COOP headers were present, and Search remained `no-store`.

## Recovery and Stabilization

The real isolated Production restore drill recovered PostgreSQL and Control-state without mounting or
writing Production data. Seven migrations, 238 documents, four 238-row Search projections, SQLite
schema 7, audit continuity, `pg_amcheck` and PostgreSQL checksums passed. Disposable drill resources
were removed while Production remained available.

The daily 03:05 HKT timer has completed one Full and five subsequent Differential generations since
2026-09-07. At final acceptance the newest valid backup was
`20260907-090610F_20260911-190514D`, completed at `2026-09-11T19:21:03.117Z`, with AList Primary,
R2 Off-site and WAL all `fresh`. Control-state reported integrity `ok`, no incomplete/attention/expired
operations and no failed infrastructure operation in the preceding 24 hours.

Final telemetry showed Public 200, direct-origin 200, Web Ready 200 with PostgreSQL ready, IPv6 origin
address count 1, disk use 79.6%, fresh dual-replica recovery evidence and zero unexplained Critical
alerts. The sole active warning was the explained intermediate content validation failure above.

## Docker Restart Incident and Closure

The acceptance audit found that a Docker daemon restart at 2026-09-09 22:43 HKT stopped every running
container; all V2 services except the internal loopback OpenResty returned automatically. The absent
ingress left the outer reverse proxy returning 502 until discovery on 2026-09-12. Starting the existing
container restored service without data or slot changes.

PR #19 changed only this ingress to `restart: always` and added a topology regression assertion. PR
Quality run `34684416434` and main Quality run `34685109228` both passed. The merged configuration at
`9fac07ea1e195db63a30becc02ecb740f3216106` was installed on the host and the running container policy
was updated without restart: container ID and `StartedAt` remained unchanged, health stayed green and
post-change public smoke passed.

## Quality and Security Evidence

- repository format/lint, source/workflow policy, Drizzle consistency, strict typecheck and Renovate
  validation passed;
- 169 Unit tests passed;
- Production Foundation, Full/Diff/Incr Recovery, WAL/PITR, AList/R2 fallback, Blue/Green and no-rebuild
  rollback gates passed;
- disposable Application Integration and 11 critical E2E tests passed;
- seven PostgreSQL Migration tests and Production Build passed;
- fail-closed Secret, SBOM and Critical vulnerability scans passed after upgrading Next.js to 16.3.3.

No credential was committed or written into Production application logs. A registry-read credential did
appear in the private operator diagnostic transcript during a targeted environment inspection; rotate it
as a defense-in-depth follow-up. This does not change the least-privilege runtime boundary or the verified
image digests.

## Owner Acceptance and Rollback State

The Owner accepted the final Compatibility/Operations report and explicitly approved closing the old
Nuxt rollback window on 2026-09-12. The legacy repository remains read-only and no legacy data,
deployment, backup or image was deleted. It is no longer the formal Production rollback target; the
healthy previous V2 Green slot remains the immediate operational rollback target.

Phase 18 is the final implementation-plan phase. Its context is durably recorded here, in
`docs/planning/current-state.md`, the Phase 18 migration reports, accepted ADRs and executable tests.
