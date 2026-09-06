# Phase 18 Final Legacy Delta

> Legacy repository: `/home/tungchiahui/UserFolder/MySource/my-blog` (read-only)
> Baseline: `d33e9ee5f90a266207f9f9658a47031eafdb981a`
> Cutover candidate source: `feee48b1685e7cab8fed84941bff9e58fc32491c`
> Audit date: 2026-09-06

## Inventory result

The final Git delta contains 13 paths: `.nvmrc`, `package.json`, `package-lock.json`, the Legacy Blog
route helper, and nine Canonical Markdown paths. No Legacy page, component or frozen ROS2 archive path
changed. The Markdown delta is one added Blog post plus eight modified documents:

- `content/posts/2026-09-02-WM论文罗列.md` was added;
- the four pre-existing Blog posts were modified and now contain only `title` frontmatter;
- four Wiki chapters were modified under the C++ and Linux tutorial trees.

The current corpus is 238 files: 5 Blog and 233 Wiki files across the same 18 Wiki roots. All 238
files parse with the V2 strict minimal-frontmatter schema; the only current key shape is `title`.

## Route delta

`utils/wiki-content-meta.ts` changed Blog routing after Phase 0. Current Legacy behavior ignores
frontmatter paths and transliterates the complete filename stem, retaining the date. Wiki routing and
the Pinyin normalization algorithm did not change.

The current Legacy function and V2 candidate parser were replayed over every current Markdown file:

```text
canonical_files=238
legacy_routes=238
legacy_unique_routes=238
v2_routes=238
v2_unique_routes=238
collision_count=0
mismatch_count=0
```

V2 therefore uses the current dated Blog routes as Canonical Routes. The four Phase 0 explicit Blog
URLs remain exact read aliases to the same documents, alongside the seven already approved Wiki
aliases. This retains previously published URLs without creating a general redirect map. Locale
prefixing remains unchanged, and `zh-hant` remains an intentional negative route.

The exact current routes and compatibility aliases are recorded in
`legacy-route-and-pinyin-fixtures.md` and enforced by source/unit/integration gates.

## Canonical repository activation gap

The Legacy checkout's remote now resolves to the public repository
`tungchiahui/tungchiahui.github.io`. The planned independent repository `tungchiahui/content` does
not yet exist as of this audit. Production content sync must not silently read an invented repository
or write back to the Legacy repository. Owner approval is required before creating the independent
repository and publishing the filtered `content/**` history/snapshot.

## Safety

The Legacy worktree was clean before and after the audit. All inspection and route replay were
read-only. No Production, DNS, EdgeOne, 1Panel, AList or R2 state was changed by this audit.
