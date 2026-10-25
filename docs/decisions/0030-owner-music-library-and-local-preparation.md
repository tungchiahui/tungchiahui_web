# ADR 0030: Owner music library and local audio preparation

- Status: Accepted
- Date: 2026-10-25
- Authorization: Owner approved the music manager, song IDs, batch uploads, playlist diagnostics and database-managed mappings; then explicitly limited preparation to ordinary audio formats.
- Extends: ADR 0002, ADR 0018, ADR 0021 (current unified account sessions)

## Decision

Keep the existing React/native-audio player and public `/music`. Add locale-aware `/music/manage`,
with owner-only data behind the existing unified account session. Visitors receive only a login
prompt. Public pages never receive imports, private diagnostics or storage credentials.

PostgreSQL `music.tracks` owns song metadata and active source mappings. Additive migration 0013
seeds the exact 25 legacy CDN URLs without renaming or replacing objects. The old TS URL map is
removed from current runtime code; its snapshot is retained only in the reviewed migration and
test fixture. `music.checks` and `music.imports` are private to the control role and backup role.
Public readers can select tracks; content workers cannot access this schema.

`/api/ops/music/*` is implemented only in the independent control-api. Every request verifies a
current, enabled owner account. Mutations also require the existing exact Origin policy. This
does not grant account sessions access to deployment, recovery, paid translation or Operator APIs.
The control-api now additionally receives the existing validated asset S3 configuration; its music
writer exposes only PUT/HEAD for constructed `music/<sha256>/<filename>` keys. No arbitrary key,
URL fetch, deletion, Docker socket, shell or backup credential is added. AList's credential remains
instance-scoped, so application prefix restrictions remain necessary.

Audio uploads are capped at 48 MiB, serialized per control-api process, checked for SHA-256,
declared length and plausible MP3 frames, then uploaded and HEAD-verified before an atomic
revision-checked publication. Immutable hash paths prevent overwriting previous audio. A failed
publication can leave an unreferenced object; it is retained and never automatically deleted.
Idempotent task IDs and checksums permit retry and duplicate avoidance. Sync preserves uploaded
audio and does not delete songs absent from a later playlist response.

Diagnostics run only on explicit owner action. The browser orchestrates one bounded request per
song and saves completed results; there is no long-running public request or privileged background
scan. The scan stops when its tab closes; saved results remain. The server checks an allowlisted
HTTPS source and redirects using DNS resolution restricted to public IPv4 addresses, a 12-second
deadline and a small response prefix. The browser optionally checks media loading and duration.
Results distinguish reachable, failed, uncertain and suspected preview, and never infer VIP status
from a generic 403. Browser evidence is owner-supplied diagnostic data, not a security attestation.

`./site music studio` runs a loopback-only browser tool; `./site music prepare` is the batch CLI.
Both use local FFprobe/FFmpeg, preserve originals, avoid re-encoding existing MP3, and refuse to
overwrite a conflicting output. The studio requires its exact Host/Origin and an in-memory request
nonce. Temporary files are removed. Explicit downloaded outputs/reports are local authoring
artifacts, not a production runtime store. No QQ cookies, key extraction or encrypted-format
decoder is included. No new frontend framework or production FFmpeg dependency is introduced. Browser file inspection uses temporary in-memory object URLs; only CSP media-src gains blob:, with script/object/connect permissions unchanged.

## Recovery and validation

Rollback retains all additive tables and objects. The retained old application still understands
its own legacy mapping; music added after deployment may not appear in that old application.
PostgreSQL backup/PITR includes the entire music schema. Asset recovery continues through the
existing asset backup/mirror; restore metadata and its matching audio objects together. Apply the
existing account-session revocation procedure after a database restore. No backup format changes.

Validate migration empty/repeat/previous-schema paths, role isolation, legacy URL preservation,
real disposable PostgreSQL/S3Mock upload/publication/CAS, owner/visitor/Origin boundaries, local
conversion and conflict behavior, four-locale UI and mobile critical flows. Production-compatible
S3 contracts use only an explicitly configured non-production target. No destructive production test.
