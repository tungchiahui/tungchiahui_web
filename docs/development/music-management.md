# Music management

Owner-approved scope: ordinary audio only; preserve the player, song IDs and filename conventions.
See ADR 0030 for data ownership, session scope, storage privileges and rollback.

## Daily use

1. Sign in as an owner and open `/music/manage` (or its locale-prefixed path).
2. Refresh the QQ playlist. Existing CDN sources remain selected.
3. Open playlist checks and scan the filtered songs. Effective and Meting sources are checked
   separately. Export CSV/JSON to keep a snapshot; PostgreSQL remains authoritative.
4. Run `./site music studio` on the computer containing your files and open the printed loopback
   URL. Select ordinary audio and download the converted MP3 files. Install FFmpeg/FFprobe from
   their official distribution first if they are absent. The browser tool does not upload to the site.
5. Select **上传音乐**, choose MP3 files, review the selected song ID and final `title-artist.mp3` filename,
   and explicitly confirm batch upload. Multi-artist `/` or `、` separators become periods. Matching
   requires one unambiguous filename; otherwise choose the song manually. Originals remain local.
6. Published audio appears in the existing player through its public playlist API. No source edit,
   commit or image deployment is needed for subsequent imports.

The manager hides floating player controls so they cannot cover table actions; existing playback
continues. The regular music page and the public floating player keep their original controls.

The terminal alternative is:

```bash
./site music prepare --input /absolute/input-directory --output /absolute/output-directory
```

It processes files in that directory (not recursive), reads title/artist tags, falls back to a
`title-artist` basename, retains originals and emits a per-file JSON result. Missing identities,
encrypted/unsupported files, decoding errors, conflicting names and oversized output are reported.
MP3 output is at most 48 MiB; local input is at most 256 MiB and 2 hours. Transcoding is lossy;
an existing MP3 is copied instead. This is not a QQ audio acquisition or decryption tool.

## Diagnostics and operational limits

Checks are explicit, bounded samples from the current network, not proof that every second plays
worldwide. Metadata-only inspection cannot reliably identify every preview. When a reliable full
duration is absent, files at most 60 seconds are merely flagged for review. Network, allowlist, autoplay and incomplete playback
checks remain uncertain; browser decode/unsupported-source errors are reported separately. Generic denials are never labelled as proven VIP restrictions.

Closing the management tab stops orchestration. Completed checks are persisted and can be
exported; failed/uncertain songs can be selected for another scan. A playlist refresh removes
checks whose source changed. The most recent 100 import records are shown. A revision conflict
never replaces the active mapping. Unreferenced immutable files from interrupted imports are
retained for later reconciliation; this release performs no automatic storage cleanup.

The public playlist overlays database CDN mappings on the returned QQ playlist and falls back to
stored tracks when the upstream is unavailable. Refreshing the owner playlist stores its complete
current snapshot; initial migration has only the original 25 CDN tracks until that first refresh.

Development uses `./site dev`, the documented local owner account and S3Mock. Production normal
release must activate the matching control-api and migration through the shared release engine.
Control-api receives asset S3 access only for validated music PUT/HEAD; Next.js retains read-only
storage. Uploads use the public CDN configuration mapped to the bucket root. The current AList deployment defaults to `https://cdn.tungchiahui.cn/<ASSET_S3_BUCKET>`; an explicit `ASSET_CDN_BASE_URL` overrides it. Local/test uploads use the same-origin asset gateway backed by S3Mock. S3 keys and upload credentials are never
returned to the browser; playback URLs remain public.

## Local acceptance (2026-10-25)

Static/source/workflow/Drizzle/type checks, production build and security scan passed. All 382
unit tests and the 14-migration suite passed. The real PostgreSQL music integration checks passed
seed preservation, database-role separation, replay, source revision conflicts and publication after
verified S3 upload. The 7-case S3Mock contract and designated non-production AList `TEST` bucket
contract passed with cleanup complete. Both CLI and local-browser FLAC-to-MP3 conversion were
verified without changing the original file.
One bounded real-network sample also verified a reachable CDN audio response and a Meting
non-audio response; the public playlist returned 169 songs at that time. These are point-in-time
observations, not permanent classifications for those songs.

The full browser run has 49/51 passing tests, including the new authenticated upload flow and Wiki
layout checks at 320/390/1440 pixels. Its remaining failures are the existing recruiting-page
canonical-tag count assertions. A separate clean HEAD (1dd6cab6) checkout also reproduces these
canonical failures without this feature; no assertions were weakened. The complete integration gate
is therefore not green, and this work has not been published. Post-browser failure-boundary checks
in that full command are not reached when Playwright fails. A separate disposable integration run
limited to the two affected browser tests passed, including the subsequently executed Git memory,
English-title/locale/search, control-state restart persistence and service failure-boundary checks.
This narrower passing run does not replace the failing full browser gate.

Local preview: `http://127.0.0.1:3000/music/manage`; ordinary-audio studio:
`http://127.0.0.1:18742` while `./site music studio` is running. The preview database retains its
existing content and the additive migration; disposable test databases/assets were isolated.

## Publication authorized (2026-10-26)

The owner explicitly approved publication through the existing main release workflow. Production
completion requires that commit's quality/image/security gates, blue-green deployment, host
convergence and public smoke results. The preceding 2026-10-25 failures are historical evidence.
Their canonical assertions pass with Webpack on the same corpus and browser; the supported local
entry and disposable E2E now use the same bundler as the existing production build. No assertion
was removed. Cold development hydration has a bounded 15-second reader setup wait; the existing
scrolling and responsiveness assertions remain unchanged. Copy-address controls are disabled until
hydration so a cold first click cannot silently disappear.

Before publication the final local run passed all 382 unit tests and all 51 browser tests, including
the unchanged four-locale canonical assertions, real authenticated audio upload and 320/390/1440px
Wiki layout. Static/type/build/security and 14 migrations passed; both storage contracts remain valid.

After publication, sign in to `https://www.tungchiahui.cn/music/manage` and select **更新 QQ 歌单**
once to populate the complete playlist before scanning. Audio conversion stays on the workstation:
the production server receives only the explicitly uploaded MP3 and updates the database mapping.

## Management and playback checks v2 (2026-10-26)

The library has one primary **上传音乐** action, a secondary playlist refresh and one export menu.
Song IDs remain visible and copyable beside the song; row menus contain details, CDN copying,
QQ links and source replacement. Failed/preview rows also show **补充音源** directly. Uploads open
in a dialog; **上传记录** contains history only. Mobile rows become cards rather than a horizontally
scrolling action table. Export, status and filtering use the selected diagnostic source. The primary audition link always uses the current playback URL; the raw Meting audition is an explicit separate menu item.
Scan progress and stop belong only to an active scan; uploading/syncing never presents a stop-scan
control. Closing the upload dialog preserves its queue until publication or explicit file reselection.

A server response header/prefix is now only connectivity evidence and never a playback pass.
Browser verification runs even when the server was denied or timed out, since the two clients can
have different network access. A separate muted audio element must actually advance playback at
the beginning, middle and near the end. Metadata, canplay and successful seeking alone are insufficient.
Very short clips (up to 8 seconds) are played through continuously, avoiding seek/range limitations.
Other clips use three bounded seek/play samples. Metadata waits at most 7 seconds; each seek and
play phase at most 4 seconds. There is no full-track download/decode guarantee or background scan.
The temporary media element is paused, detached and reloaded on finish, failure or cancellation.

Decode/unsupported-source failures of direct audio are marked failed; a Meting resolver returning no decodable audio remains uncertain because that does not establish a broken song. Browser autoplay restrictions, stalls, network
problems or an unverified tail remain uncertain. A suspected preview is based on a substantially
shorter known duration, or <=60 seconds without a known full duration; a known short original can
pass. The reference duration can describe a different version, so preview is always a suspicion.
A passing sample cannot prove a 90-second preview is complete when no full duration is available.
The page explicitly describes these limits. Keep it open and in the foreground while checking.

The diagnostic URL hash includes the `music-playback-v3` policy namespace. Library reads omit
old-policy or mismatched-source checks; rows require a new explicit scan. Old rows are retained until a new scan replaces that source result; reads do not delete or silently upgrade them. New reports use existing status/reason fields. The browser input
adds bounded, validated sample evidence; legacy duration-only clients receive an uncertain result
rather than a pass. No database migration, S3 object rewrite, credentials, permissions or backup
format change is required. Existing releases can read stored rows on rollback, although their old
labels/diagnostic logic should not be used as evidence for this stronger verification policy.


### v2 validation

All 393 unit tests, 52 browser E2E tests, static/source/workflow/type/production-build/security
checks and the 14-migration suite passed locally. The full disposable integration also passed
real PG/S3Mock publication, source-policy hash invalidation, role isolation, the 7-case storage
contract and post-browser persistence/failure-boundary checks. Browser coverage includes real
MP3 upload/play-through, source-specific filtering/audition, cancellation without stale browser
reports, missing upstream URLs and 320/390px layouts. The desktop/390px preview was inspected;
one real CDN/Meting pair was checked without production writes. This v2 work has not been published.


## Source scope correction (2026-10-26)

The owner observed an almost uniform failed scan while existing CDN-backed songs were labelled
Meting. The database and public playlist still retained all 25 exact legacy CDN URLs. The UI had
shown the selected diagnostic source in the current-source column, and its primary audition link
also followed the diagnostic selector. It now always displays the actual playback source, with a
separate per-row diagnostic label and a prominent raw-Meting scope explanation. CDN-backed songs
do not receive a supplement-audio action solely because a raw Meting diagnostic fails. A CDN count
shortcut opens the complete own-audio list and resets diagnostic scope to effective playback.

Three sampled public Meting URLs (including 晚风心里吹 and 我还是想再问你) each returned HTTP 200,
text/html and zero body bytes, including with the site's Referer. The playlist endpoint still returned
169 entries with those resolver URLs. That is current resolver evidence, not proof that the entire
QQ catalogue is unavailable or VIP-only. Resolver decode failures are stored as uncertain, and
provider errors have their own UI explanation. A scan checks direct/CDN sources first; after three
consecutive unverified Meting responses corroborated by the server probe, it skips that resolver
for remaining songs and reports the skipped count. A successful browser playback can still override
a failed server probe. A new explicit scan retries the provider; no global persistent breaker is added.

Policy v3 makes the prior failed classifications require a rescan without deleting music/checks or
rewriting assets. PG integration now refreshes all 25 legacy songs and asserts every CDN mapping
survives. Browser regression includes actual muted audio alongside empty-HTML Meting responses,
asserting CDN-first ordering, exactly three resolver requests, no mass failed classifications, one
remaining untested song, and an operational CDN-list shortcut. No production write or publication.

Latest source-scope validation: 394 unit tests, 53 complete browser E2E tests, static/type/build/security
and full disposable PG/S3Mock integration including post-browser persistence/failure boundaries
passed. The two sampled original CDN songs passed actual start/middle/end playback. Production
was read only to confirm all 25 legacy mappings; no production scan/write, upload or deployment.


## v3 publication authorization

The owner explicitly authorized publication after the source-scope correction. Use the normal
main release gates and shared blue-green/host-convergence engine. Confirm the deployed SHA,
public health/readiness, owner-only manager boundaries, all four locale/noindex routes and the
25 exact legacy CDN mappings. Earlier unpublished statements describe pre-authorization local
acceptance. Do not mutate production music or guess an owner password for release smoke.
