# Phase 16 Verification Report

> 最终 Gate 结果在 Phase 16 聚焦 Commit 前记录；全部操作限于 Repository 与 Disposable Local Infrastructure

## Automated Evidence

| Gate | Result |
| --- | --- |
| Format/Lint、Typecheck、Unit、Integration、Migration、Build、E2E | PASS |
| Alert firing/noise suppression/resolved clear | PASS |
| TLS/Security Header/Method/Validation/Rate/Authz/Replay | PASS |
| PostgreSQL/Next/Control/Worker/Storage differentiated diagnostics | PASS |
| PostgreSQL-down control/recovery observability | PASS |
| Representative load/pool/slow-query/cache/backlog/disk-pressure | PASS |
| Client/Image/Config/Log/Response secret leakage | PASS |
| npm Production Dependency Audit | PASS — 0 vulnerabilities reported at scan time |
| Trivy 0.74.0 Critical vulnerability + secret scan | PASS — Web、Services、Recovery、PostgreSQL、OpenResty、PgBouncer |
| CycloneDX SBOM | PASS — non-empty component inventory for each scanned image |

最终 Gate 使用仓库锁定的 Node `24.19.0`、pnpm `11.23.0`、Trivy `0.74.0` 与提交的工具 Digest。结果为 Biome/Source/Workflow/Drizzle/Typecheck/Renovate/Build/Security Scan PASS，Unit `26 files / 124 tests`，Integration + S3Mock Contract PASS，Playwright `10/10`，Migration `6` 个版本 PASS，Production-foundation 与 Recovery Gate PASS。

Production-like Load Measurement 由 `test:infra` 的最终 JSON 输出记录：Public `80` 并发全部 HTTP 200，P50 `322.99 ms`、P95 `508.76 ms`；内部 Pool `80` 请求耗时 `186 ms`，Slow-query Probe `247.11 ms`，Public Abuse Test 拒绝 `167` 个请求。该数字只描述本次 Disposable Local Run，不是 SLA、Capacity Promise 或 RPO/RTO。

Recovery Gate 的 full/diff/incr Backup、WAL/PITR、Primary/R2 独立可读副本、部分恢复重试、PostgreSQL-down Restore、Control-state Encrypted Snapshot 与 Representative Application Read 全部通过；本次 Restore-to-ready 为 `8.46 s`，同样不代表 Production RTO。

## Failure Diagnosis

- Next.js Slot Down：Public Web 失败，但 `/api/ops/*` 仍直达 Control API；OpenResty/Control 与 Web Availability 可区分。
- PostgreSQL Down：Next Readiness/Application Job Snapshot 失败，触发 PostgreSQL/Application signal；SQLite Integrity、Infrastructure Operation、Audit、Backup/WAL/R2 Evidence 与 Control Route 仍存在。
- PgBouncer Down：独立 TCP Signal，不误报为 Control-state 丢失。
- S3 Representative Read 失败：只触发 Asset Storage Signal；Canonical Markdown 仍来自 GitHub/PostgreSQL。
- Worker/Operation Expired Lease、Failure、Backlog、Budget Stop：分别来自 PostgreSQL Job 与 SQLite Snapshot，不依赖 Log Text 猜测。
- Backup、WAL、任一 Replica 或 Restore Drill Stale：统一 Recovery Evidence Alert，Runbook 要求逐项验证，不能只看 Backup Command Exit 0。

## Supply-chain remediation

扫描发现旧 Debian Runtime/上游预编译工具带来 Critical Finding 后，没有降级或忽略：Production Runtime 收敛到固定 Alpine Digest、移除不需要的 Package Manager/gosu，并用固定 Go 1.25.7 Builder 重建 age 1.3.1。最终全部扫描目标无未接受 Critical Finding。

## Scope Confirmation

没有 Production Host/API、Public Traffic、DNS/EdgeOne、AList/R2、GitHub Write/Settings、Paid AI、真实 Backup/Restore 或旧 Nuxt Repository 访问/修改。Phase 17 Server Migration Readiness 与 Phase 18 Final Audit/Cutover 未开始，仍需各自 Owner 授权。
