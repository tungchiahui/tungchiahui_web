# Phase 18 Special Pages and Music Compatibility Repair

> Status: implemented locally; Owner visual/functional acceptance is pending
> Scope: `/more` directory, independent informational pages, Start, Stats, owner-managed public datasets, `/music`, and the global music player
> Legacy evidence: Phase 0 inventory/matrix first; targeted read-only checks at Legacy commit `feee48b1685e7cab8fed84941bff9e58fc32491c`

## Audit conclusion

The pre-repair V2 preserved the route names but reduced most special routes to generic headings or short lists. That did not satisfy the Phase 0 MUST KEEP outcomes. The repair used the committed inventory as authority and inspected only the corresponding Legacy page, player composable, audio mapping and generated page-copy sources where the inventory did not contain enough interaction detail.

## Repaired outcomes

| Surface | Preserved outcome |
| --- | --- |
| Homepage | Restored the Legacy information architecture: three primary destinations, four topic tags, six focus cards, up to five recent Blog posts, and exactly the five newest top-level Wiki documents when at least five exist. Wiki child chapters stay inside their document card instead of consuming homepage slots. The implementation uses the V2 primary-blue visual system and Lucide primitives instead of copying the Legacy teal skin or depending on Font Awesome for core navigation. |
| `/more` | Restored Analytics, public Umami share, AList, S3 API, primary/global CDN, Chat and all eight independent page entries. Copy actions give accessible feedback. |
| About/CV/Friend/Logo | Restored personal direction, service/contact entry points, education/experience/awards, all eight recorded friend links, and the T/C/H visual-identity explanation. The retained content is presented in the V2 primary-blue visual system rather than copying the Legacy green/amber page skin. |
| Music API | A fixed server-side Tencent playlist request is bounded by timeout and Zod validation. All 25 Legacy Tencent song-ID mappings use the self-hosted primary CDN. Lyrics are proxied only from the approved Meting host. |
| `/music` | Restored artwork, track identity, seek/volume/previous/play/next controls, QQ playlist link, synchronized LRC display and the complete returned playlist. |
| Global player | A single root provider keeps playback alive across App Router navigation. The bottom-right full and mini players share the same audio element. The expanded player exposes the complete scrollable playlist and four synchronized lyric lines; the active line is highlighted. Collapse state remains under the Legacy `music_player_hidden` key. The 19-rem mini player measures real overflow and performs one slower delayed translation without duplicating the lyric or hiding its beginning. On narrow article pages it remains at the bottom safe area instead of being pushed upward by the reader tools; its bounded width leaves the lower-left reader controls usable. Artwork falls back from the cleared cover URL. |
| Audio recovery | Preserved the Legacy two primary-CDN reconnect delays, six auto-resume delays, proactive global-CDN fallback, error/dead-track skip, ended advance and all-tracks-unavailable behavior. The global fallback changes only the approved primary CDN host and preserves the asset path/query. |
| `/start` | Restored Baidu/Google/Bing selection, URL detection, bounded server-proxied suggestions, 20-entry search history, category/bookmark CRUD, validated JSON import/export, default restoration, simple/detailed modes, clock/date/greeting and the exact Legacy localStorage keys. Start now renders as a true viewport-filling standalone surface without the global header/footer; the exact Legacy favicon is its small upper-left home action. Its wallpaper API validates and caches Bing's official latest-eight archive server-side; manual changes traverse the current set without repetition until wraparound. Two bundled static URLs remain the no-credential fallback when Bing is unavailable. Wallpaper title and copyright attribution remain as a low-emphasis lower-left line that expands to the current readable contrast on hover. |
| `/stats` | Restored real Umami summary cards, the ten top-metric panels, refresh, direct-access fallback labels and an external public-dashboard action. Umami sends `frame-ancestors 'self'`, so V2 does not render a knowingly broken cross-origin iframe. The share token remains server-only; the client receives a validated bounded aggregate/top response. |
| Tech footprint | Restored the three-track architecture, PostgreSQL-backed public progress grouping, task status/progress/notes, aggregate metrics, milestones and export. |
| Weight loss | Restored current/goal/progress metrics, scroll-bounded SVG trend chart, target/actual legend, weekly metric table and export. |
| Owner-managed data | Tech/weight editing remains PostgreSQL-backed and revision-protected. The collapsed Owner editor imports the production Ed25519 private-key file locally, signs the existing same-origin `/api/ops/datasets/*` request in WebCrypto, and never uploads or persists the private key. The control API remains the only privileged write boundary and performs capability, replay, schema and compare-and-swap validation. |
| Global footer | Restored all 13 recorded Website/E-Mail/social contact entries, site navigation, locale links and filing badges. Font Awesome 7.1.0 is loaded only from `cdn.tungchiahui.cn`, with the Legacy two-retry sequence followed by the matching `global.cdn.tungchiahui.cn` path. Footer layout and controls use the V2 primary-blue visual system. |

## Persistence boundary

Canonical Blog/Wiki content and the Tech/Weight owner datasets are stored in PostgreSQL; public images, attachments and music remain in the approved S3/CDN boundary. There is no IndexedDB, Cache Storage, browser Blob store, client-side content corpus or third-party KV persistence.

Browser storage is intentionally limited to device-local UI/private state that cannot safely become a shared anonymous database record without an identity boundary: theme mode, music-player collapsed state, and `/start` personal bookmarks, history, selected engine, background position and view mode. The two `Blob` uses create short-lived object URLs for explicit JSON downloads and revoke them; they are not persistent storage. Moving those anonymous personal records to PostgreSQL would require a separately approved authenticated user model and isolation policy.

## Security and architecture boundary

No client-side content search index, provider-specific persistence, plaintext secret, new Next.js privileged operation route, production write or Legacy repository modification was introduced. The public analytics action opens only the fixed `https://umami.tungchiahui.cn` share URL; development-only React `unsafe-eval` remains excluded from production CSP. Production OpenResty suppresses the upstream application CSP and emits the reviewed browser policy as the single authoritative CSP, preventing browser policy intersection from blocking the approved Umami and self-hosted Font Awesome origins. Start suggestions and Bing wallpapers use bounded server routes and runtime validation rather than injecting remote scripts or trusting arbitrary remote URLs.

The player intentionally uses the native audio element rather than carrying APlayer's JavaScript/CSS runtime forward. Phase 0 allows implementation redesign; the observable playlist, controls, persistence and recovery outcomes are the compatibility contract. Music assets retain their approved self-hosted CDN mapping and failover. Font Awesome is retained for the footer through the owner's self-hosted CDN rather than a new public CDN.

## Verification and acceptance boundary

The focused suite covers the exact 25-song mapping, reconnect/fallback timings, LRC multi-timestamp parsing and offset, More endpoints, independent page content, Bing archive validation, Start launchpad, Umami response validation and both public dataset views. The public E2E flow covers the expanded global playlist, Bing attribution and restored footer contact entry. Repository checks, all 168 unit tests, production-foundation/recovery gates, all 11 public E2E tests and all 7 PostgreSQL migrations pass. The production build and local Compose stack pass. Live local checks returned 159 playlist songs including all 25 self-hosted mappings, a validated eight-item Bing archive and a real validated Umami overview.

Owner review is still required. This document does not complete Phase 18, authorize deployment, close the rollback window or authorize a later phase.
