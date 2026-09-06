# Phase 8 Translation Memory Implementation

> Status: implemented locally; paid-provider execution remains Phase 9
> Normalization version: `1`

## Semantic block contract

`src/translation/segmentation.ts` parses canonical Markdown with the approved unified/remark stack and validates the external AST before use. Each top-level mdast node is one semantic block. Heading, paragraph, list, table and blockquote structures can be translated; YAML frontmatter, fenced code, raw HTML, definitions and thematic breaks are explicitly non-translatable.

Translation identity is `(normalization_version, source_hash, locale, context_fingerprint)`:

- normalization version 1 canonicalizes line endings, trailing line whitespace and outer block whitespace;
- `source_hash` hashes normalized block source, not document position;
- `context_fingerprint` hashes AST shape plus protected values;
- document ordinal and source offsets are only current assembly metadata and never Translation Memory identity.

Inserting or moving an unrelated block therefore preserves every unchanged block identity. A local change creates a new pending segment instead of invalidating the whole document.

## Structure and protected syntax

Before a translated block is reusable, the system reparses it and requires the same structural fingerprint and protected-value sequence as the current source block. The contract preserves:

- Markdown node shape, heading depth, table/list structure and link/image nodes;
- fenced/inline code and raw HTML;
- link/image destinations and titles;
- URLs, code-like identifiers, brands, names and versioned glossary terms.

Unsafe stored targets are quarantined back to `pending` and rendered from current canonical zh-CN. Non-translatable blocks are stored as reviewed source-preserving segments and are never provider candidates.

## PostgreSQL materialization

Migration `0003_phase8_translation_memory` is an additive Expand migration:

- `document_translation_segments` maps current document occurrences to global Translation Memory rows and optionally records `previous_segment_id`;
- `translation_segments` records translatability and normalization version;
- `document_translations` records the canonical source hash plus pending, translated, fallback and memory-hit counts.

Existing en-US rows receive a nullable `source_hash`. Phase 8 will not trust such a row until an explicit content sync reconciles it against current canonical Markdown. This keeps the migration compatible with the Phase 7 application while preventing stale English from masquerading as current translation.

Content ingestion reconciles en-US inside the same transaction as canonical documents and deterministic regional materializations. It reuses safe global hits, creates pending misses, marks unreferenced superseded pending rows stale, preserves reviewed/translated rows as reusable memory, and materializes a mixed document from English hits plus latest zh-CN fallback blocks. Same-snapshot replay does not duplicate rows, rewrite `generated_at`, lose targeted-patch ancestry or emit hooks.

Soft-deleted documents retire their current mapping. Canonical content and all authoring direction remain GitHub -> PostgreSQL.

## Targeted patch and observability

`TranslationMemoryRepository.listTargetedPatchContexts()` exposes validated:

```text
old zh-CN + old en-US + new zh-CN
```

only for current pending blocks with a safe reviewed/translated predecessor. It does not call a provider. Phase 9 may consume this interface during explicit budgeted execution.

Pending, fallback, translated and memory-hit totals are available both on each current en-US materialization and through `TranslationMemoryRepository.readMetrics()`. Content hooks emit the same zero-cost summary with `providerCalls: 0`. Public pages expose `fallback`, `mixed` or `translated` state; mixed pages identify the current fallback-block count.

## Cost, rollback and recovery

No Phase 8 module imports the translation-provider boundary. Content sync, public requests, builds and automated tests cannot issue provider requests. The fake provider remains isolated for Phase 9 contract work.

The migration is additive and should be retained during rollback for Blue-Green overlap. Rolling back application code leaves canonical documents and prior translation rows intact. Rolling forward and replaying an explicit content sync deterministically rebuilds current mappings/materializations. No production backup/restore behavior changes in this phase.
