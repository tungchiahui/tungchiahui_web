# Phase 15 GitHub OIDC Deployment Automation

## Scope and safety boundary

Phase 15 binds GitHub Actions to the Phase 14 shared deployment engine without creating a second CI deployment implementation. The repository now defines the normal `main` release path, immutable image publication, reusable content-only trigger and manual translation trigger. Verification remains local and Production-like: it does not push an image, invoke a live GitHub workflow, mutate GitHub repository settings, contact the Production Control API, switch public traffic, or read the legacy Nuxt repository.

The GitHub `production` Environment is a mandatory authorization boundary. Before enabling the remote workflow, repository administration must retain required reviewers, prevent self-approval where supported, and limit deployment branches to `main`. The workflow-level `environment: production` and serialized concurrency are checked in; repository-hosted protection settings remain an activation prerequisite and are not replaced by YAML.

## Application release path

`.github/workflows/quality.yml` is the single PR, merge-queue and `main` Quality Gate. It runs Biome/source/workflow policy, Drizzle consistency, TypeScript, Unit, Production-foundation/Recovery, Integration/E2E, Migration, Renovate validation and Production build. It has read-only repository permission and no OIDC or package-write permission.

`.github/workflows/deploy.yml` starts only after a successful `Quality Gate` `push` run on this repository's `main`, or by an explicit manual retry/specified-SHA dispatch. The manual path proves that the exact full SHA has a successful `main` Quality run and is an ancestor of or equal to current `main`. One global non-cancelling concurrency group prevents overlapping Production cutovers.

The build job receives only `actions: read`, `contents: read` and `packages: write`; Actions read is needed solely to verify a manual SHA's completed Quality run. It builds `ops/production/images/web.Dockerfile` from the requested full SHA, publishes only `ghcr.io/tungchiahui/tungchiahui_web:<40-char-sha>`, and returns the registry manifest digest. The deployment job checks out the reviewed control client at `github.workflow_sha`, rather than allowing a specified old application SHA to roll back the control protocol. It receives `contents: read` and `id-token: write`, enters the protected `production` Environment, installs the locked client and runs:

```text
./site deploy <sha> --image-digest <manifest-digest> --reason <audit-reason> --wait
```

`./site deploy` and GitHub Actions therefore use the same public Control API, idempotency key, host-local SQLite operation, claim/lease, audit and deploy-agent engine. `--wait` only polls that operation to a terminal state; it does not execute Docker, migration, smoke or cutover work in CI.

## OIDC claim and capability policy

The Control API accepts a validated array of exact GitHub OIDC policies. Every token must pass signature/JWKS, issuer, audience, expiry/not-before, repository, ref, Environment and workflow identity checks. Normal workflows bind `workflow_ref`; the reusable content workflow additionally binds `job_workflow_ref`, so an unreviewed caller cannot substitute another privileged implementation.

The production secret example defines three non-overlapping principals:

- application deployment: status plus infrastructure operation create/read;
- manual translation: translation dry-run/execute/read/cancel only;
- canonical content caller plus the reviewed reusable workflow: application-job create/read only.

Replay nonce and request-body binding remain mandatory. A policy identity cannot borrow capabilities from another policy, and duplicate exact policy identities fail startup validation.

## Immutable registry-to-origin binding

The deploy-agent alone receives the approved image repository and optional package-read identity through `deployment-registry.env`. GitHub Actions never receives that pull identity, the Docker socket, a host login, a Production database credential or an AI-provider credential.

For deployment, the Docker adapter resolves only `<approved-repository>@sha256:<manifest-digest>`, pulls through the Docker Engine API when absent, verifies the exact `RepoDigest`, and requires OCI `org.opencontainers.image.revision` to equal the requested full Git SHA. The candidate container records the manifest digest separately from Docker's local configuration ID. Explicit rollback validates and switches to the already-running retained container and does not pull or rebuild an image.

## Content and translation trigger separation

`.github/workflows/content-sync.yml` is reusable only. A canonical content-repository caller supplies a full immutable source commit; the workflow checks out and verifies that exact commit, checks out the reviewed application control client, and creates only a PostgreSQL-backed `content_sync` application job through `./site content sync`. It has no package write, application image build, deploy, translation, database or secret path.

`.github/workflows/translation.yml` remains `workflow_dispatch` only with typed scope, article path, dry-run, budget, force and confirmation inputs. OIDC creates the existing server-side translation job. Provider credentials and budget enforcement remain server-side; content push never invokes translation and public requests never incur paid translation.

## Workflow policy and dependency updates

`check:workflows` parses all four workflows and fails if triggers, Quality commands, protected Environment, concurrency, OIDC/package permissions, immutable repository, shared CLI calls or credential exclusions drift. Every third-party Action reference must be a full commit digest. This check runs locally and inside the Quality Gate.

Renovate policy remains unchanged and validated by the same Quality workflow: updates arrive as PRs, security updates are prioritized, lockfile maintenance stays in PRs, and core major updates are not automatically merged.

## Rollback and recovery impact

Phase 15 adds no PostgreSQL or control-state migration. Application rollback remains the Phase 14 retained-slot, no-rebuild path. Registry credentials can be rotated independently by replacing the encrypted deploy-agent-only environment file and reprovisioning; no image or workflow secret contains the origin pull token. If registry pull or SHA-label validation fails, the operation fails before candidate mutation and active traffic remains unchanged. Recovery/restore still uses the Phase 13 PostgreSQL-independent path and does not depend on GitHub Actions or the image registry.
