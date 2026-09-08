# Phase 15 Verification Report

## Result

Phase 15 passes its repository-level CI/CD, OIDC, trigger-separation, immutable supply-chain, concurrency, shared-engine and regression gates. The Production-like topology pulled an exact registry manifest digest, verified its Git SHA label, completed a real inactive-slot deployment and cutover, rejected a missing digest without changing public state, and rolled back to the retained slot without a pull or rebuild.

No live GitHub workflow, Production endpoint, public cutover or legacy repository was used. The checked-in workflow contract is ready for Owner-controlled repository Environment protection and later activation; actual Production traffic replacement remains Phase 18 only.

## Gate evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Quality before release | `quality.yml` covers PR, merge queue and `main`; deployment accepts only successful same-repository `main` push Quality runs or a manually verified successful SHA | PASS |
| Immutable publication | exact full-SHA tag, no `latest`, manifest digest captured after push, OCI revision label embedded | PASS |
| Registry-to-origin identity | approved repository plus exact manifest digest pull, exact `RepoDigest` and Git SHA label verification | PASS |
| OIDC claim policy | issuer, audience, repository, ref, Environment, workflow/job-workflow, time and signature validation; negative Unit cases | PASS |
| Least capability | deployment, translation and content reusable workflows receive separate exact policy/capability sets | PASS |
| Shared Human/CI path | both call `./site deploy` -> public Control API -> SQLite -> deploy-agent shared engine; `--wait` only polls terminal state | PASS |
| Concurrency/idempotency | one non-cancelling Production deployment group plus stable full SHA+digest operation key and SQLite uniqueness | PASS |
| Content boundary | reusable `workflow_call` validates exact source commit and only creates `content_sync`; policy forbids image/deploy/translation/package/secret paths | PASS |
| Translation boundary | typed manual-only workflow; policy forbids DB, AI, Docker and repository secret paths | PASS |
| Workflow supply chain | every third-party Action pinned to a full commit digest; workflow policy runs in Quality | PASS |
| Renovate | checked-in policy validates; updates use the same PR Quality Gate, security priority and non-automerge core majors remain intact | PASS |
| Production-like deployment | registry digest pull, real Blue-Green, complete smoke, atomic cutover, missing-image isolation and no-rebuild rollback | PASS |
| Recovery compatibility | Full/Diff/Incr, WAL/PITR, dual replica and encrypted control-state restore remain green | PASS |
| Previous schema/public flows | six-migration suite and 10 critical Playwright flows remain green | PASS |
| Production safety | temporary Registry/host root/ports/database/certificates only; `productionTraffic=false` | PASS |

## Automated commands

- Locked Node `24.19.0` / pnpm `11.23.0` component form of `site:check` — PASS: Biome, source policy, workflow policy, Drizzle, TypeScript, Renovate and webpack Production build.
- `pnpm test:unit` — PASS, 25 files / 118 tests.
- `pnpm test:infra` — PASS, including `registryDigestPull`, idempotent Ansible, hardening, real Blue-Green, missing-digest isolation, PostgreSQL-down dependency failure and no-rebuild rollback.
- `pnpm test:recovery` — PASS, including Full/Diff/Incr, WAL/PITR, primary/R2 readback, encrypted control-state restore and PostgreSQL-down restore.
- `pnpm test:integration` — PASS, including disposable services, S3Mock contract, application/job boundaries and 10/10 Playwright critical flows.
- `pnpm test:migration` — PASS through all six versioned migrations and previous-schema compatibility.
- The locked component form of `site:test` — PASS for Unit, Production-foundation, Recovery, Integration/E2E and Migration suites.
- `git diff --check` — PASS.

## Deterministic failure behavior

Quality failure cannot produce a `workflow_run` deployment job. Manual deployment rejects a malformed SHA, a SHA without a successful `main` Quality run, or a commit outside `main`. OIDC claim drift fails authentication before capability checks. Duplicate release requests converge on the same serialized SQLite operation. Registry 404, digest mismatch or OCI revision mismatch fails preflight before inactive-slot mutation. Content and translation workflows cannot invoke application deployment by trigger, permission or checked policy.

## GitHub activation checklist

The repository artifact requires, but this no-Production session deliberately does not mutate, these GitHub-hosted settings before remote enablement:

- protect `main` with the `quality-gate` required check and merge-queue policy where used;
- configure the `production` Environment with required reviewers, no self-approval where supported and `main`-only deployment branches;
- grant the application repository package publication permission and configure the deploy-agent package-read identity only in encrypted host secrets;
- make the canonical content repository call the reviewed `content-sync.yml@refs/heads/main` reusable workflow with the exact source commit.

These settings cannot be replaced by repository YAML; Phase 18 must verify them again before any public cutover.

## Recovery validation plan

Registry and workflow automation add no database state. If registry access fails, rotate only the deploy-agent pull identity and retry the same SHA+digest operation after resolving the failed terminal record according to the existing audited retry policy. Never retag or substitute a digest. Use `./site rollback` for the immediately previous application release. If deployment/recovery state changes in a later phase, rerun both `test:infra` and `test:recovery` before activation.

> Historical note: ADR 0020 later removed the fixed deployment-stabilization time block; it did not change the workflow authorization or supply-chain requirements verified here.

## Explicit non-actions

No Production host/API, GitHub write or settings mutation, GHCR push, public traffic, DNS/EdgeOne, AList/R2, paid AI provider or legacy Nuxt repository was accessed or changed. Phase 16 was not started.
