# Phase 1 Engineering Baseline

## Locked toolchain

| Tool | Version / policy |
| --- | --- |
| Node.js | `24.19.0` LTS, pinned in `.node-version` and `package.json#engines` |
| pnpm | `11.23.0`, pinned in `packageManager` and `engines` |
| Next.js | `16.3.2` stable App Router |
| TypeScript | `7.0.2`, strict policy plus all repository-required strict flags |
| UI | Tailwind CSS `4.3.3`, shadcn/ui `base-nova`, Base UI `1.7.0` |
| i18n | next-intl `4.13.7` with aligned skeleton messages for all four approved Locale |
| Runtime validation | Zod `4.4.3` |
| Quality | Biome `2.5.10`, Vitest `4.1.11`, Playwright `1.62.1` |

All package versions are exact and `pnpm-lock.yaml` is committed. Stable releases are used; no Canary/Beta/RC dependency is part of the baseline.

## Supported Phase 1 commands

```bash
./site check
./site test
```

`./site` is a thin shell Bootstrap Wrapper. Command parsing, Toolchain Validation and dispatch are TypeScript.

`./site check` runs:

1. Biome formatting/lint validation;
2. TypeScript source and Server/Client boundary policy;
3. Typecheck;
4. Renovate configuration validation;
5. Production build.

`./site test` runs the real Unit Suite, then reports Phase-owned placeholders. A placeholder can never print `PASS` and must retain `NOT_IMPLEMENTED` until its replacement Phase supplies a real suite.

| Placeholder | Owner | Replacement Phase | Meaning |
| --- | --- | ---: | --- |
| Integration | Repository Owner | 2 | Disposable PostgreSQL/S3Mock does not exist in Phase 1 |
| Migration | Repository Owner | 3 | No versioned database schema exists in Phase 1 |
| Affected E2E | Repository Owner | 6 | No Website Vertical Slice exists in Phase 1 |

`./site dev` remains a Phase 2 deliverable. Phase 1 help reports that boundary instead of starting an incomplete or unsafe local stack.

## Source policy

The repository quality command fails on:

- `.js` or `.jsx` Application/Automation Source;
- `@ts-ignore` directives;
- explicit `any` without an approved documented exception;
- a direct or transitive import from a Client Component into `src/server/**` or a module marked `server-only`.

The custom policy has Unit Fixtures for direct/transitive boundary failure and safe shared imports. `postcss.config.mjs` is the sole native-module configuration exception because the PostCSS/Next.js loader consumes that format; it contains only declarative plugin configuration and no Application/Automation Logic.

## Typed configuration boundary

Environment input is parsed with Zod before use. Validation errors report the variable path and safe reason without printing the invalid value. `.env.example` contains only the non-secret local `SITE_BASE_URL`. `.env.local` and all other plaintext environment override files are Gitignored.

## CI merge gate

`.github/workflows/quality.yml` exposes one stable required status: `quality-gate`. It runs on Pull Requests, merge queues and `main` pushes, using the locked Node/pnpm toolchain and frozen lockfile.

Repository Rules/Branch Protection must require `quality-gate`. Any failing real Gate makes that status fail; a future Production Workflow must depend on the same successful status before it can run. Phase 1 does not configure Deployment, OIDC or Production Secret.

## Renovate policy

Renovate creates Pull Requests targeting `main`; it never auto-merges or writes dependency changes directly to `main`. The policy:

- pins dependency ranges and updates `pnpm-lock.yaml`;
- ignores unstable releases by default;
- requires Dependency Dashboard approval for major updates;
- isolates Core Runtime major updates for manual review;
- labels and prioritizes Vulnerability Alert PRs;
- pins GitHub Actions to immutable Commit SHA.

Every Renovate PR runs the same `quality-gate` workflow as other changes.
