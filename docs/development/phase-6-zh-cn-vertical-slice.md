# Phase 6 zh-CN Website Vertical Slice

## Scope and request path

Phase 6 establishes the first complete public reader path:

```text
Browser -> Next.js App Router/RSC -> validated server DAL -> PostgreSQL runtime content
        -> unified/remark/rehype sanitizer -> Shiki -> accessible HTML
```

Both unprefixed routes and `/zh-cn/**` represent zh-CN. The public surface includes Home, Blog/Wiki lists and articles, the ten Phase 0 special pages, approved Wiki aliases, the complete ROS2 static archive, not-found/error pages and public health endpoints. `/api/ops/*` remains exclusively owned by the independent `control-api`.

## Server-first content and rendering

- `src/server/public-content.ts` is the server-only PostgreSQL boundary. Every query uses `SET LOCAL ROLE site_app`, filters soft-deleted rows and validates database/cache output with Zod.
- React Server Components own content reads and Markdown rendering. Client Components are limited to theme, print and browser-local Start-page interactions.
- Markdown passes through unified, GFM, raw-HTML dropping, `rehype-sanitize`, Shiki and a final validated link/image metadata pass. Unsafe raw HTML and unsupported asset schemes do not reach the rendered tree.
- Article metadata is derived from validated runtime content. Code fences, inline identifiers, Unicode headings, safe external links, responsive lazy images, TOC and previous/next navigation are covered by tests.

## Route and compatibility surface

The App Router accepts the Phase 0/5 exact Blog paths, Pinyin Wiki paths and only the approved stored aliases. No broad redirect map was introduced. The ROS2 GitBook archive is copied byte-for-byte under `public/docs/ros2`: 958 files including all 311 HTML routes.

A Phase 6 targeted read-only Legacy check was required only to recover exact filing values and confirm the static archive had not changed since the Phase 0 evidence commit. The old repository remained clean and unmodified.

## Cache and revalidation contract

| Surface | Owner/key | TTL | Invalidation |
| --- | --- | --- | --- |
| Article | Next.js; canonical route | none | exact route tag plus unprefixed/prefixed paths |
| Blog/Wiki list and Home | Next.js; content type | none | content-type tag plus section/Home paths |
| Owner dataset | Next.js; dataset key | none | reserved dataset tag; Phase 4 writes remain control-plane owned |
| ROS2 archive / Next assets | Next.js static serving; file/hash path | framework/static policy | immutable artifact replacement |
| S3 object gateway | Next.js `/api/assets/**`; validated object key | explicit public response policy | object-key replacement; Phase 11 validates AList semantics |

The content worker signs a strict revalidation payload with HMAC and calls the internal Next.js endpoint. Content materialization commits before hooks; if hook delivery fails, the PostgreSQL job persists a `side_effects` progress record and replays the exact hook input without fetching or materializing content again. Translation and search hooks remain explicit zero-cost deferred boundaries for Phases 8 and 10.

## Local assets and observability

Local S3Mock is seeded with a deterministic SVG and exposed through the validated server-only asset gateway. Asset paths reject traversal, unknown schemes and invalid keys. This is local API evidence only; the production-compatible AList contract remains Phase 11.

`/api/health` reports process liveness, `/api/ready` checks PostgreSQL with the application role, and `/api/version` reports a validated Git SHA or the documented development stub. All use `Cache-Control: no-store`. Structured revalidation and deferred-hook events contain commit/count metadata but no credentials.

## Recovery boundary

Phase 6 adds no migration and touches no production resource. Code rollback preserves PostgreSQL content, job progress and the static archive. A failed cache delivery is recoverable through the existing durable job retry; destructive data or schema rollback is neither required nor appropriate.
