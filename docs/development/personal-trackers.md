# Personal trackers: UI, login and verification

## Scope and source

Owner authorization on 2026-09-12: discard legacy Blob records, start fresh, implement a minimal
shared owner login, and restore both technical TodoList and weight-loss interfaces. Login means
edit permission immediately; visitors remain read-only. No production action or PR merge is authorized.

Targeted read-only source: `tungchiahui.github.io@43f249d5a18dab5f251b05383235f7bb438c3fcf`,
`app/pages/tech-footprint.vue`, `app/data/tech-footprint.js`; the catalog is byte-identical to the
local Phase 18 baseline `feee48b1685e7cab8fed84941bff9e58fc32491c`. Weight behavior is from the
same local baseline's `app/pages/weight-loss.vue`, `app/data/weight-loss.ts` and
`utils/i18n-page-copy-source.ts`. No legacy source was changed and no Blob endpoint was accessed.

The technical catalog contains 10 stages, 46 tasks and 231 subtasks. Stable IDs, goals, technology
tags, acceptance text, allocation and milestones are preserved. Progress/status/notes, automatic
totals, stage switching, expandable tasks, JSON import/export, clearing and saving are restored.

Weight tracking retains the 2026-06-11 through 2027-02-04 plan, 35 weekly slots, 18 milestones,
target ranges, existing personal execution templates, four optional metric fields, notes, trend
chart, complete table, JSON and CSV exchange. All old hardcoded measurements are removed.
These are the owner's existing plan targets, not newly generated health recommendations.
Records and notes are public, as required by the legacy compatibility decision.

All interface strings use next-intl. zh-HK/zh-TW are converted with OpenCC; English controls, weight-page copy, and the complete technical roadmap use semantic English. There are no paid translation
calls. IDs, code names and progress notes are never blindly translated.

## Local use

Use `./site dev`. The documented local/test password is `local-only-owner-password`.
Production explicitly rejects its verifier. The local Next development port forwards `/api/ops/*`
to the same independent control-api; production has no such rewrite and uses OpenResty directly.

Click **登录**, enter the local password, and edit either tracker. Switching between the two pages
retains the session. Logout revokes it server-side. A session also expires after 12 hours. There
is no separate edit toggle, public registration, remembered-device setting, or password-reset page.

The client serializes automatic saves after 900ms of inactivity. Server validation covers data
shape/ranges, known technical task keys, unique weight dates, and `expectedRevision`. A 409 pauses
saving rather than overwriting another device. A failed save preserves the visible draft and,
where browser storage is available, stores it in this tab's new `personal-draft-v1:*` namespace.
Old Blob/localStorage records are never read. JSON import is validated and previewed before it
replaces records; weight CSV merges matching planned dates after validation. Export before clearing.

## Production activation after explicit authorization

1. Apply additive migration 0007 through the normal migration engine; never run ad-hoc production DDL.
2. Generate a new password verifier locally using the pinned runtime. The generator reads stdin,
   not argv or environment, and requires 16–256 characters. For example, in a local Bash terminal:

   ```bash
   read -r -s -p 'New owner password: ' tracker_password
   printf '%s' "$tracker_password" | pnpm exec tsx tools/owner/hash-password.ts
   unset tracker_password
   ```

3. Put the resulting `OWNER_PASSWORD_HASH=...` line only in the SOPS document's `control_api_env`.
   Install it through the existing approved provisioning process. Do not put the password in chat,
   source files, `.env.example`, Docker build arguments or GitHub Actions variables.
4. Activate the new independent control-api service image/configuration through the existing
   service provisioning mechanism. A normal web-slot deployment alone does not update this service.
5. Verify login, save, anonymous public reads, logout and signed Operator status. Confirm no old
   Blob provider is contacted. Login remains unavailable until service code and verifier are ready.

Password rotation changes the verifier and invalidates all prior sessions. After PostgreSQL
restore/PITR, rotate it before enabling owner login to prevent restored sessions becoming valid.
Keep owner login disabled during that activation window. Retained blue/green slots, deployment
signing keys, backup credentials and recovery authentication are otherwise unaffected.

## Acceptance and gates

- Public visitors cannot edit through UI or API; logging in immediately enables both pages.
- Saved data survives reload, is public in a separate browser, and reads are no-store.
- Unknown task keys, malformed/oversized imports, out-of-range metrics and duplicate dates fail closed.
- Concurrent writes return 409 and preserve the losing draft; expired/revoked sessions cannot write.
- Cookie/Origin protection, login throttling and denial of deployment/control paths are tested.
- Public DB and content-worker roles cannot read or forge owner sessions.
- Original roadmap inventory, empty measurements, CSV round-trip and status/progress consistency are tested.
- Four locales, mobile width and original URLs remain usable.
- Run `./site check` and `./site test`, including migration, production-foundation, recovery and E2E.

Review risks: production login requires separate control service/config activation; the login is deliberately single-owner and limited
to tracker editing. Stronger authentication and account management belong to a later task.

## Implementation verification (2026-09-12)

Local `./site check` passed format/lint, source/workflow policy, Drizzle consistency, typecheck,
Renovate validation, production build and source/client security scan. After integrating `main@08946f64`, all 178 unit tests passed.
The disposable integration suite passed, including 12 browser E2E tests after integrating current main and seven S3Mock contract
cases. Eight migrations passed on empty/repeated/previous schemas, including owner-role isolation
and real PostgreSQL session expiry, revocation, digest storage and verifier-rotation checks.
The full disposable recovery suite passed full/differential/incremental, WAL/PITR, encrypted
control-state recovery, forced primary-to-offsite fallback and PostgreSQL-down restore.

Local production-foundation attempts stopped at the Trivy vulnerability database download with
registry/network `unexpected EOF`; no scan was bypassed and no vulnerability was ignored. The
PR's hosted Quality Gate remains required before merge. Desktop and 390px mobile interfaces with the current site shell/music player were
visually checked. No production operations or legacy Blob access were performed.
