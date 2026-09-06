# Phase 10 PostgreSQL + PGroonga Search

## Outcome

Phase 10 adds a locale-scoped, Server-side search path backed only by PostgreSQL and PGroonga. The browser submits a query and receives a bounded result contract; it never downloads the Markdown corpus or builds a parallel client index.

## Search projection

Migration `0005_phase10_pgroonga_search` adds `app.search_documents` as an additive runtime projection. Its `(document_id, locale)` primary key binds one active document to each supported locale and stores only the search fields required by the query path:

- title;
- Markdown headings;
- visible Markdown body text;
- relevant metadata (`description`, `category`, `categories`, `tags` and source path);
- locale, content type, canonical route, source hash and projection hash.

Raw HTML, frontmatter syntax and Markdown definitions are excluded from searchable body text. Code and inline code remain searchable so technical identifiers such as `ROS2_Control`, C++ and STM32 keep their expected behavior. The multi-column PGroonga index covers title, headings, body and metadata; a separate B-tree index supports locale/content-type filtering.

Projection materialization preserves the Phase 7–9 content contract:

- `zh-cn` indexes canonical Markdown;
- `zh-hk` and `zh-tw` index the materialized conversion, with the deterministic converter as the existing read-safe fallback;
- `en-us` indexes only a translation bound to the current canonical source hash, otherwise the current zh-CN fallback.

The projection hash prevents an affected-document replay from rewriting unchanged rows. Soft-deleted documents are removed from the projection.

## Query and ranking contract

`SearchIndexRepository` runs under `site_app`, filters by the requested locale before returning results, and executes the four-column PGroonga condition with deterministic weights:

| Field | Weight |
| --- | ---: |
| Title | 16 |
| Heading | 8 |
| Metadata | 4 |
| Body | 2 |

An exact case-insensitive title match receives a fixed `1000` boost. Remaining ties use PGroonga score, source update time and canonical route. Tests own the expected exact-title, heading, body, Chinese phrase, English term and mixed-identifier outcomes; future ranking changes must update those fixtures intentionally.

The public result contract contains only `title`, locale-prefixed `route`, `locale`, `contentType`, bounded plain-text `snippet`, `matchedContext` and numeric `score`. It does not expose raw Markdown, source paths/hashes, projection hashes, database identity or internal error details.

## API and UI

`GET /api/search` accepts a validated `q`, supported `locale` and result `limit` from 1–50. Invalid input returns `400`; an unavailable search backend returns a bounded `503` event. The response is always `Cache-Control: no-store` at the HTTP/Edge/OpenResty boundary.

The App Router renders `/search` and each locale-prefixed `/search` page as a Server Component. All reusable UI copy comes from the four next-intl catalogs. The query is read on the server and results link to the locale-prefixed canonical route.

## Refresh, reindex and recovery

Content ingestion and successful translation rematerialization call the real search refresh hook with exact document IDs and affected locales. Refresh and cache invalidation remain idempotent side effects recorded by the existing PostgreSQL application-job retry contract.

Full reindex uses the existing `search_reindex` application-job type. `content-worker` claims it with PostgreSQL `FOR UPDATE SKIP LOCKED`, lease, attempt and retry semantics. Per-locale advisory transaction locks prevent overlapping projection replacement. After a successful transaction, the worker invalidates exactly the requested locale search tags and then marks the job complete. Search/reindex state never enters the host-local control-plane SQLite.

Rollback keeps the additive table and index in place. Disabling search polling stops new full reindex work; the previous application version can ignore the retained projection. A failed projection refresh or cache invalidation is retried from durable PostgreSQL progress. Rebuilding the PGroonga index and re-running a locale reindex are safe, explicit recovery actions; no canonical content is stored in or recovered from the search projection.

## Cache and observability

The Next.js cache key is the normalized query, locale and result limit. It has no arbitrary TTL and carries a locale tag. A committed content/translation projection refresh invalidates only affected locale tags; an explicit full reindex invalidates only its requested locales. This makes correctness depend on exact invalidation, not time expiry.

Structured events cover query duration/result count, precise projection refresh and completed full reindex. Errors are bounded and exclude credentials, connection strings, raw content and request headers.
