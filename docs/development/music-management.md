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
5. In imports, choose MP3 files, review the selected song ID and final `title-artist.mp3` filename,
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
duration is absent, files at most 60 seconds are merely flagged for review. Network/allowlist/browser
failures remain uncertain. Generic denials are never labelled as proven VIP restrictions.

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
