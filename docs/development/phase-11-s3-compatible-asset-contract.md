# Phase 11 S3-compatible Asset Contract

## Outcome and provider boundary

Phase 11 establishes one Provider-neutral S3-compatible boundary for images, attachments, music and deliberately mirrored static assets. The application, CLI, Environment Variables, Domain Types and Contract Suite do not name or branch on AList. AList remains the current Production deployment choice under ADR 0003, so the Phase Exit Report must include evidence from an Owner-designated AList non-production target.

Canonical zh-CN Markdown remains in GitHub and its PostgreSQL runtime materialization remains authoritative. Content ingestion is structurally prohibited from importing the object-storage layer. Translation, Search and Application Job state remain PostgreSQL-backed.

## Adapter and application read path

`src/storage/s3-adapter.ts` is the single S3-compatible Adapter. It provides validated PUT/GET/HEAD/DELETE/List/Prefix behavior to trusted tooling and a narrower `S3ReadOnlyObjectStorageAdapter` to the Next.js `/api/assets/**` Route. The Route streams object bodies, preserves validated Content-Type/Cache-Control/ETag, returns `404` only for a verified missing key and returns a bounded `502` for an unavailable provider.

Object keys:

- are Unicode-capable and limited to 1,024 characters;
- reject leading/trailing slash, empty segments, traversal segments and control characters;
- place immutable assets under `<asset-class>/<content-hash>/<file-name>`;
- place deliberately mutable assets under `<asset-class>/mutable/<file-name>`;
- use only the approved `images`, `attachments`, `music` and `mirrors` asset classes.

Immutable application objects use `public, max-age=31536000, immutable`. Mutable application objects use `public, max-age=300, must-revalidate`. The application gateway derives this policy from the validated content-hash or `mutable` key segment instead of trusting Provider metadata. Direct CDN delivery is limited to content-addressed immutable assets and must provide the correct asset MIME plus a cacheable lifetime of at least 24 hours; a longer immutable Edge Rule remains preferred. CDN URL construction preserves key segments and percent-encodes Unicode without changing logical keys.

## Configuration and credential split

Three non-overlapping configuration namespaces are documented:

- `ASSET_S3_*`: application asset identity; the Next.js path exposes only read operations;
- `S3_CONTRACT_*`: explicit non-production contract identity with temporary object write/delete scope;
- `BACKUP_S3_*`: reserved Phase 13 identity; Phase 11 does not use it.

The contract parser requires HTTPS, the literal environment `non-production` and a distinct Bucket/Access Key from any configured application or backup identity. The configured CDN base maps directly to the Bucket root; each invocation supplies its own random contract prefix. Normal `./site dev` and `./site test` never read the external contract configuration.

## Shared contract suite

The same suite runs against Disposable Adobe S3Mock and a configured external S3-compatible implementation. It verifies:

- PUT, streaming GET and HEAD;
- DELETE and verified Missing-key behavior;
- paginated List/Prefix behavior;
- overwrite body replacement and opaque ETag change when the implementation exposes ETag;
- consistent optional GET/HEAD ETag behavior; application correctness never depends on ETag presence;
- Content-Type, Cache-Control and custom Metadata semantics;
- Unicode keys and URL encoding;
- deterministic 2 MiB representative object round-trip and Content-Length;
- CDN public read for an SVG asset, correct MIME, at least 24-hour immutable-key caching and anonymous-write denial.

Each invocation creates objects beneath the unique flat prefix `tungchiahui-contract/<uuid>-`, tracks the exact keys it creates and removes only those keys. The generic Adapter tolerates filesystem-backed S3 implementations that synthesize a zero-byte namespace directory marker while keeping application asset keys strict; UUID placement in the flat file prefix prevents empty-directory accumulation across runs. Cleanup is verified with a final Prefix List. A cleanup failure is always fatal and retains the original failure as its cause.

## Explicit external command

```bash
./site storage contract s3 --confirm S3-NON-PRODUCTION
```

The command loads the gitignored `.env.local` when present, validates the generic `S3_CONTRACT_*` boundary and emits a credential-free JSON Report containing Endpoint Origin, Bucket, Prefix, passed cases and cleanup status. Provider identity is deliberately absent from configuration and runtime types; the verification report records the implementation used for evidence separately.

## Recovery and rollback

Phase 11 adds no database migration and changes no canonical content. Application-code rollback can retain existing objects because object keys and HTTP metadata remain standard S3 semantics. Contract objects are disposable and must already be removed before a successful report. Phase 13 may reuse this evidence but must separately test pgBackRest repository semantics; Phase 11 does not decide Direct S3 versus verified local-repository sync.
