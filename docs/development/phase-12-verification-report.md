# Phase 12 Verification Report

## Result

Phase 12 passes its Tasks, Tests, Acceptance Criteria and Exit Gate. The repository now contains a
rebuildable production-like Ansible/Compose foundation with encrypted runtime secret injection,
least-privilege database login separation, hardened containers, a direct independent control route
and dual-stack origin behavior. No production operation or public traffic occurred.

## Gate evidence

| Gate | Evidence | Result |
| --- | --- | --- |
| Version-controlled provisioning | hostname inventory, role/playbook/defaults/handlers and pinned tool lock | PASS |
| Clean host + idempotency | ephemeral host root; first provision changes state, second reports `changed=0` | PASS |
| Immutable images | exact Git-SHA application tags; external images and Node base pinned by digest; no `latest` | PASS |
| Image safety | multi-stage custom images, non-root runtime user, image history secret-negative scan | PASS |
| Runtime hardening | read-only roots, drop-all capabilities, no-new-privileges, explicit tmpfs/volumes and network segmentation | PASS |
| Worker separation | only deploy-agent mounts the Docker socket; content-worker/control-api have no deploy network/socket | PASS |
| Docker capability | Phase 12 deploy-agent code only performs `GET /_ping` and reports production mutations disabled | PASS |
| Database identities | four distinct LOGIN roles are non-superuser members of exactly scoped NOLOGIN group roles | PASS |
| Secret injection | real ephemeral SOPS + age encryption/decryption; plaintext sentinels absent from ciphertext/history/log assertions | PASS |
| OpenResty | config validation and validated reload; active Next route plus direct no-store `/api/ops/*` | PASS |
| Next-down control route | both Next slots stopped; unsigned control status remains independently reachable with expected 401 | PASS |
| PostgreSQL-down control route | PostgreSQL stopped; OpenResty and independent control status continue returning the expected 401 | PASS |
| IPv4 / IPv6 | the same origin config serves loopback A and AAAA paths; no application/CI/CLI rewrite | PASS |
| Production identity | inventory/domain/service DNS only; no persisted home public numeric IP | PASS |
| Public traffic | test binds an ephemeral local high port and uses a self-signed disposable certificate | PASS — none |

## Automated commands

- `pnpm site:test` — PASS：22 个 Unit Test File / 96 个 Test、Production-foundation
  Infrastructure Gate、Disposable Application Integration、10 个真实 Playwright E2E、6 个版本化
  Migration。
- `pnpm site:check` — PASS：Biome（155 files）、Source Policy、Drizzle、严格 TypeScript、
  Renovate Validation 与 webpack Production Build。

The infrastructure runner itself uses pinned Node 24.19.0, pnpm 11.23.0, Ansible Core 2.21.3,
Docker Compose 5.4.0, SOPS 3.13.3 and age 1.3.1, with downloaded binaries checked against committed
SHA-256 values.

## Security, rollback and recovery

The change is additive and does not cut over traffic. Rollback is removal of the Phase 12 topology
and return to the prior commit; no application database contract is destructively replaced.
Control-state Version 3 is a forward additive migration that retains Version 2 metadata in
`local_control_metadata_v2`. Phase 12 declares the SQLite backup hook but does not claim recovery:
validated backup, PITR and restore-drill evidence remain mandatory Phase 13 work.

The deploy-agent is a capability-limited Phase 12 boundary, not a hidden deployment engine. It must
remain mutation-disabled until Phase 14 implements and tests the approved shared engine.
