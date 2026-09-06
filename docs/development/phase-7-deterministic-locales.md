# Phase 7 Deterministic Locale Implementation

> Status: implemented locally; production operations are out of scope
> Glossary version: `2026-08-24.1` / persistence revision `1`

## Public locale contract

The only supported locale identifiers are `zh-cn`, `zh-hk`, `zh-tw`, and `en-us`.

- Unprefixed public routes and `/zh-cn/**` both render zh-CN.
- `/zh-hk/**`, `/zh-tw/**`, and `/en-us/**` preserve the canonical logical route after the locale prefix.
- The server-rendered locale switch changes only the prefix and retains the same Blog, Wiki, alias, or special-page path.
- `zh-hant` is intentionally unsupported. It is handled as an ordinary path segment, returns 404, and is never redirected.
- `src/proxy.ts` derives the request locale from the URL and forwards only validated internal locale headers. It does not rewrite the public URL.

UI i18n lives in `messages/*.json` and `src/i18n/messages.ts`. Content i18n lives in the separate `src/i18n/content*.ts` modules and PostgreSQL materialization. Shared locale values continue to have one definition in `src/domain/persistence.ts`.

## Deterministic content materialization

`content-worker` materializes both regional Chinese views during the existing content-ingestion transaction:

```text
canonical zh-CN Markdown
  -> parse Markdown AST
  -> convert text nodes with OpenCC + versioned exceptions
  -> hash materialized Markdown
  -> upsert document_translations (zh-hk, zh-tw)
  -> deliver the existing search/revalidation hook after commit
```

The materialization uses the existing `document_translations` table, so Phase 7 adds no schema migration. A row is updated only when its Markdown, SHA-256 hash, or glossary revision changes. Replaying the same snapshot preserves `generated_at` and emits no duplicate downstream effect. A glossary revision change can rematerialize an otherwise unchanged canonical document without inflating the canonical `files_changed` count.

The public DAL reads the requested zh-HK/zh-TW row and keys Next Cache by locale. If a deterministic row has not yet been backfilled, the server renderer applies the same converter as a safe temporary view; a subsequent explicit content sync materializes the row. No public request writes PostgreSQL.

## Protected Markdown and glossary rules

`src/i18n/content-markdown.ts` replaces only mdast `text` node source ranges. Frontmatter, fenced code, inline code, raw HTML, and link/image destinations therefore remain outside the conversion boundary. The text converter also protects URLs, code-like identifiers, technical terms, names, and brands.

`src/i18n/content-glossary.ts` contains:

- a human-readable version for review and operational evidence;
- a positive integer persistence revision for `document_translations.translation_version`;
- protected technical terms, personal names, and brands;
- explicit zh-HK/zh-TW regional exceptions.

Any future output-changing glossary edit must increment both version fields and update representative tests.

## en-US baseline and presentation state

Phase 7 intentionally renders every en-US article from current canonical zh-CN Markdown. It does not consume existing English translation rows, segment translation state, or any provider. This makes the pre-Phase-8 behavior unambiguous and prevents a public request or content push from producing paid translation cost.

Article pages expose the presentation state through localized copy plus `data-content-locale` and `data-content-locale-state`:

- `converted` for zh-HK/zh-TW;
- `fallback` for en-US;
- no banner for canonical zh-CN source.

Phase 8 owns translation memory, block-level English fallback, pending state, and safe backfill. Phase 9 owns explicit paid-provider execution. Phase 7 does not implement either boundary.

## Rollback and recovery

The application change is reversible as one focused commit. Regional rows are derived data tied to a canonical document and cascade-delete with it; rolling back application code does not change canonical GitHub content or the `documents.raw_markdown` source. Ingestion writes documents and regional materializations in one PostgreSQL transaction, so a conversion or constraint failure rolls back the whole snapshot.

No production database, credential, GitHub write, paid provider, AList target, deployment control plane, or old Nuxt repository was accessed or modified in this phase.
