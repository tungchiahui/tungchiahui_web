# Phase 12 Production Foundation

## Scope and safety boundary

Phase 12 adds a reproducible production-like host foundation without deploying to the production
origin, changing DNS/EdgeOne, publishing images, cutting traffic, or implementing the Phase 14
deployment engine. The source of truth is `ops/production`: Ansible, Compose, OpenResty, pinned
tooling, image definitions and the SOPS secret schema are all version controlled.

The inventory addresses the origin through the Owner's existing stable SSH alias `Debian`.
Persistent application, Ansible and proxy configuration contains no
home public numeric IP. OpenResty listens on one dual-stack IPv6 socket with `ipv6only=off`, while
Docker workloads use service DNS only.

## Production-like topology

| Boundary | Runtime responsibility | Network / privilege boundary |
| --- | --- | --- |
| OpenResty | TLS origin, active-slot website routing, direct `/api/ops/*` routing | edge network only; no Docker socket |
| web-blue / web-green | immutable Next standalone application slots | edge + application; non-root, read-only root |
| control-api | authenticated control HTTP and host-local SQLite | edge + application; no Docker socket |
| content-worker | content/search workers; paid translation disabled by default | application only; no control-state or Docker socket |
| PostgreSQL / PgBouncer | runtime database and transaction pooling | isolated database network; dedicated durable bind mount |
| deploy-agent | Phase 12 health/capability boundary | deploy-control only; the sole Docker socket holder; code permits only `GET /_ping` |
| database-role-bootstrap | one-shot login/group-role reconciliation | provision profile + database network only |

`/api/ops/*` is selected before the active Next slot and always receives `Cache-Control: no-store`.
Stopping both Next slots or PostgreSQL therefore does not remove the independent control route. The ordinary
website and `/api/assets/**` continue through the active Next slot and the existing generic S3 asset
gateway; Phase 12 does not add an AList-specific proxy path or deploy `S3_CONTRACT_*`.

## Images and container hardening

The Web and TypeScript service images use digest-pinned Node 24.19.0 multi-stage builds and explicit
non-root runtime users. Next uses standalone output; services are bundled into a slim runtime stage.
PostgreSQL/PGroonga, PgBouncer and OpenResty are pinned by version and digest.

Every practical long-running service uses a read-only root filesystem, drops all Linux capabilities,
sets `no-new-privileges`, and receives only explicit tmpfs/bind mounts and isolated Compose networks.
The PostgreSQL 18 mount follows its major-version directory contract at `/var/lib/postgresql`; its
socket tmpfs has an explicit UID/GID. `control-api` and `content-worker` cannot reach the deploy
network and never mount the Docker socket. OpenResty startup depends on control-api but not on a Next
slot or PostgreSQL; content/search polling stays disabled until an explicit later binding enables it.

The Phase 12 deploy-agent is deliberately not a deployment implementation. It can only test Docker
liveness with `GET /_ping`, reports `productionOperations: false`, and exposes no mutation endpoint.
Phase 14 must extend this same service with the shared, audited deployment engine; it must not create
a parallel root-capable service.

## Secrets and database identities

Production input is one SOPS + age encrypted YAML document matching
`ops/production/secrets/production.sops.yaml.example`. Ansible decrypts on the controller with task
output suppressed, validates the required fields, and installs separate mode-restricted runtime files
under `/etc/tungchiahui/secrets`. The encrypted SOPS document remains the recoverable source while
the root-owned runtime files persist across host reboot. Secret values are absent from build
arguments, image layers and normal logs.

The one-shot database bootstrap creates or reconciles four distinct non-superuser login identities
and grants each exactly one existing NOLOGIN group role: `site_app`, `site_control_api`,
`site_content_worker`, or `site_migrator`. The bootstrap uses the direct internal PostgreSQL service,
runs only during provisioning, secret rotation, or a versioned bootstrap-policy upgrade, and is
excluded from the normal Compose profile. It validates each plaintext bootstrap password against the
corresponding PgBouncer SCRAM verifier, rejects missing, duplicate, unexpected, malformed or
mismatched identities, and installs that exact verifier in PostgreSQL. This shared verifier is
required for SCRAM pass-through from PgBouncer to PostgreSQL. Application services connect through
PgBouncer with their dedicated login, and the production-like test proves a complete authenticated
connection through both hops.

Production control configuration now requires externally supplied operator keys and GitHub OIDC
policy. `SITE_RUNTIME_MODE=production` is accepted by control-api and workers; the deterministic fake
translation provider is rejected in production.

## Durable host state

Ansible declares explicit owner/mode for the PostgreSQL directory and
`/var/lib/tungchiahui/control-state`. Control-state schema Version 3 additively permits the production
environment while preserving and copying Version 2 metadata; the previous table remains available
for recovery inspection. SQLite keeps WAL, `synchronous=FULL`, transaction, lease/fencing and audit
semantics.

The installed `backup-hooks.d/control-state.yml` only declares the Phase 13 backup source,
checkpoint requirement and restore validation contract. It does not claim that backup/PITR or a
restore drill exists.

## Provisioning and verification

The Ansible role validates hostname-based inventory, exact 40-character Git SHA image tags, SOPS
input, local Docker identity and the rendered Compose model. It provisions host directories and
runtime files, starts PostgreSQL, reconciles database identities, starts the hardened topology,
validates OpenResty and reloads it only after successful validation. A second identical run reports
zero changes.

`pnpm test:infra` creates an ephemeral production-like host root and age identity, encrypts disposable
secrets with real SOPS, builds the production images, provisions twice, inspects running containers,
tests least-privilege database membership, exercises IPv4 and IPv6, independently stops both Next
slots and PostgreSQL to prove the control route remains reachable, and cleans up. It never uses a
production hostname, credential, bucket or traffic path.

## Explicit deferrals

- Phase 13 owns pgBackRest, WAL/PITR, off-host/R2 copies and restore drills.
- Phase 14 owns deployment/rollback/cutover mutations and the shared deployment engine.
- Phase 15 owns GitHub Actions OIDC deployment binding and image publication.
- Phase 16 owns final monitoring, security scanning, WAF/rate-limit and production-readiness review.
