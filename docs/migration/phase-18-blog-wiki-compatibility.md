# Phase 18 Blog/Wiki Core Compatibility Repair

> Status: implemented locally; Owner acceptance and the remaining Phase 18 exit gates are still pending
> Scope: Blog/Wiki information architecture, public navigation, Markdown reading interactions, routes, search association and aggregate traffic continuity
> Legacy evidence: Phase 0 artifacts first; targeted read-only inspection of Legacy commit `feee48b1685e7cab8fed84941bff9e58fc32491c` only where the repository artifacts did not specify list/chapter behavior

## 1. Audit conclusion

The pre-repair V2 routes and content sync were correct, but the public rendering layer did not preserve several confirmed MUST KEEP outcomes. Blog cards exposed only title and update timestamp. Wiki pages were grouped by a path segment without Legacy chapter ordering/continuous numbering. Article pages had a single inline TOC and lacked the Legacy desktop/mobile document navigation, reading progress, active TOC state, image zoom and code copy interactions. The mobile header hid primary navigation without an alternative. Search had no Blog/Wiki association filter. Public traffic continuity was absent.

The following items named in the audit are not Legacy features and were not invented as compatibility requirements:

- the current five Blog files and all 238 current Markdown files use title-only Frontmatter; no category or tag taxonomy exists;
- the Legacy Blog list has no pagination and shows all current posts;
- the Legacy Blog list has no summary field. V2 now derives a bounded first-paragraph summary as a non-breaking readability enhancement, while retaining title/date ordering as the compatibility contract.

## 2. Repaired behavior

| Surface | Preserved/repaired outcome | Evidence |
| --- | --- | --- |
| Blog list | filename/frontmatter date, descending repository order, PostgreSQL/PGroonga title + heading + body search, bounded summary and per-post aggregate traffic | unit helper fixtures; Public E2E |
| Wiki list | document-root grouping, index/overview entry, four-digit hierarchical order, continuous `1`/`1.1` numbering, expand/collapse, PostgreSQL/PGroonga title + heading + body search and document traffic aggregation | ported algorithm fixture; Public E2E |
| Blog article | stable heading anchors; normalized hierarchical numbering shared by the rendered body and TOC across every CommonMark heading depth `h1`–`h6`, beginning at the highest level actually present and compressing skipped levels; each body number is a self-link and each heading retains a discoverable `#` permalink; right-side desktop TOC, mobile TOC drawer, active TOC location, reading progress, code copy, image zoom, reading time, previous/next and aggregate traffic | Markdown hierarchy unit fixture; component unit test; Public E2E |
| Wiki article | desktop document sidebar + TOC, centered mobile document/TOC modal with backdrop/Escape/navigation close, lower-left floating chapter/TOC controls, all Blog reader interactions and hierarchy-aware previous/next; the visually dominant print control and dedicated print stylesheet were removed by Owner decision on 2026-09-07 | component unit test; desktop/mobile Public E2E; Owner acceptance feedback |
| Markdown/resource | sanitized GFM Markdown and Shiki remain authoritative; the Simplified-Chinese development fixture exercises emphasis, strikethrough, quotes, separators, nested/ordered/task lists, wide tables, long code, links, images and `h1`–`h6`; HTTP(S) external links are isolated; `/docs/**` links remain normal archive navigation; common attachment links are marked; images stay responsive/lazy/async and zoomable, with any click inside the preview closing it; wide tables/code scroll within their own bounded regions while normal long text/links wrap, so narrow viewports do not acquire page-level horizontal overflow | Markdown/unit fixture; narrow-viewport Public E2E |
| Route/locale | current Pinyin canonical routes, four approved locales, unprefixed zh-CN, four Blog aliases, seven Wiki aliases and 311 ROS2 HTML routes remain unchanged | existing exhaustive route/negative/E2E fixtures |
| Search association | the global magnifier is an independent header control immediately beside the theme control; server-side PGroonga query can filter Blog or Wiki and list-local search uses the same title/heading/body projection; query string and selected type remain visible; no corpus is shipped to the browser | contract unit test; PostgreSQL integration; Public E2E |
| Aggregate traffic | Legacy canonical/alias plus current locale paths are summed server-side; the browser receives only bounded aggregate pageviews/visits/bounce/time and never receives the share token or raw metric rows; zero-history routes omit the visual block instead of presenting four meaningless zeros | path aggregation unit fixture; browser response contract/E2E |
| Traffic collection | the Owner-provided Umami script and Website ID load once from the root layout only on the approved production domains; SPA navigation remains trackable without polluting local/staging analytics | exact public configuration unit fixture; CSP/build gate |
| Theme | the header exposes explicit follow-system/browser, dark and light choices; system mode reacts to `prefers-color-scheme`, and the explicit choice persists locally | component implementation; mobile Public E2E |
| Mobile primary navigation | explicit menu exposes every primary destination instead of hiding navigation below `sm`; the menu closes through its close control, destination selection, Escape or a click on the surrounding backdrop | mobile Public E2E |

## 3. Security and architecture boundary

The traffic compatibility endpoint accepts one to 512 validated absolute paths in a bounded JSON body, enough for the largest current Wiki document and its locale variants without oversized query strings. The server obtains the existing public Umami share session, verifies that it belongs to Website `993e907c-7120-4da5-9eaf-85a914ffbc9c`, filters raw path metrics, and returns only aggregate numbers. The public Share ID and Website ID are not credentials; the short-lived share token and raw rows remain server-only. Provider failure is logged with sanitized error attributes and does not fail article rendering.

The Owner explicitly supplied and approved the production tracker on 2026-09-07. It loads from `https://umami.tungchiahui.cn/script.js` only when the build runs in production mode, and `data-domains` limits collection to `tungchiahui.cn` and `www.tungchiahui.cn`. The CSP grants only that exact script/connect origin. Local development also receives development-only `unsafe-eval` for React diagnostics; production CSP never receives it. No analytics payload is written to the V2 PostgreSQL database.

No database migration, Production operation, Production import, secret write, content-repository write or paid translation request is part of this repair.

## 4. Remaining acceptance boundary

The latest feedback iteration passed formatting, strict TypeScript, 158 unit tests across 32 files and 11 Chromium public E2E scenarios, including body search, image-preview dismissal, mobile backdrop dismissal, three-state theme selection and centered reader-modal navigation. Earlier repair verification also passed the Production-foundation suite, Full/Differential/Incremental + WAL/PITR recovery, S3Mock contract, application/search integration, seven PostgreSQL migrations, production build and the repository security scan. All infrastructure targets were disposable and used `productionTraffic=false`.

This repair closes the identified Blog/Wiki implementation regression locally. It does not complete Phase 18. Owner review, the full Phase 18 stabilization/alert/rollback-window gates, and acceptance of the final report remain separate requirements. No next phase is authorized by this document.
