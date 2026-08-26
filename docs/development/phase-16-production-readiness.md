# Phase 16 Observability、Security 与 Production Readiness

## 设计结果

Phase 16 增加独立、只读的 `observability-agent`，统一采集 Public 与 Direct-origin HTTPS、Next.js、Control API、Content Worker、Deploy Agent、PostgreSQL/PgBouncer、S3-backed 代表对象、Host Filesystem 以及 Backup/WAL/R2/Restore Drill 证据。它不持有 PostgreSQL、S3、AI、Registry 或 Docker Credential；Production PostgreSQL 不可用时，Control-state SQLite Integrity、Operation/Audit 和 Recovery Evidence 仍可读取。

所有 TypeScript Service 使用统一 JSON Telemetry Envelope：`timestamp`、`level`、`component`、`event`、`request_id` 和有界安全属性。字段名拒绝 Authorization/Cookie/Credential/Password/Private Key/Secret/Token/Connection String，错误文本再对 Bearer、PostgreSQL URL、age Key 与 Private Key 做 Redaction。OpenResty Access Log 使用 JSON 且不记录 Query、Client IP、Cookie、Authorization 或 Request Body。

## Health、Metric 与 Alert

组件 Catalog 和 Alert Policy 位于 `src/observability/policy.ts`。Control API Health 额外返回：

- PostgreSQL Application Job Backlog、Oldest Age、Expired Lease、24h Failure 与 Translation Budget Stop；
- SQLite Integrity/Schema、Audit Count/Max ID、Operation Age/Lease/Failure；
- 最新 Backup Validity、WAL Presence、Primary/R2 Freshness。

`observability-agent` 的内部 `/health` 与 `/metrics` 不暴露到 Public OpenResty。它产生 Firing/Resolved Transition，避免每次 Poll 重复告警；可选 Alert Webhook 必须是 HTTPS 且 Token 只存在于 agent 专属 SOPS Environment。Alert 覆盖 Availability、Latency、PostgreSQL、PgBouncer、Job/Operation Stuck、Backup/WAL/R2/Restore、Disk/Inode、S3 Asset 和 Origin IPv6，均链接到 `docs/operations/runbook.md` 的可操作章节。

Public Probe 与 Origin Probe 使用不同 URL/Server Name；Origin AAAA 解析可配置为必须条件。S3 Probe 读取 `/api/assets/monitoring/health.svg`，Activation 前必须在 Production Asset Bucket 建立该稳定、无敏感内容的代表对象。未建立对象时只产生明确的 Storage Alert，不会绕过应用网关或写 Bucket。

## HTTP 与 Runtime Hardening

Next.js 和 OpenResty 都施加 HSTS、CSP、MIME、Referrer、Permissions、Frame 与 COOP Policy。OpenResty 只接受 TLS 1.2/1.3，Public/Control 使用独立 Rate Zone；TRACE 等非批准 Method 返回 405，`/api/internal/*` 在 Public Origin 返回 404，`/api/ops/*` 强制 `no-store` 并直接到独立 Control API。既有 Zod Boundary、Capability Authz、Request Signing/OIDC、Idempotency/Replay Store 和 Owner Dataset CAS 保持不变。

Owner Dataset 的最终 Trust Review 结论是：公开读只返回已验证 Payload；写入只存在于 Control API，使用 Capability、签名/OIDC、Replay/Rate Limit、Zod 和 Expected Revision CAS；不使用 Cookie/localStorage Edit Token，因此不存在 Cookie CSRF 或 Legacy Token Copy。Rotation 按 `docs/operations/credential-rotation.md` 执行。

## 供应链与性能边界

Production Runtime 改为精确 Digest 的 Alpine Node/OpenResty Base，并从 Runtime 移除 npm/corepack/yarn；PostgreSQL Runtime 移除未使用的 `gosu`。Recovery Image 用固定 Go 1.25.7 Builder 重建 age 1.3.1，避免上游预编译 Binary 的已修复 Go TLS Critical Finding。Trivy 0.74.0 以 Digest 固定，产生 CycloneDX SBOM，并使任何 Critical Vulnerability/Secret Finding 失败；npm Production Audit 和 Repository Config/Bundle/Image Policy Scan 也是 Gate。

Production-like Gate 使用 Disposable Host/Database/Certificate/Registry/Secret：80 并发 Public Request、80 并发 Readiness、Public/Control Abuse Burst、注入 `pg_sleep` Slow Query、PostgreSQL/Next Failure、Image Pull Failure，以及既有 Cache/Backlog/Retry Test。测试只记录该次本机证据，不把数字声明为 SLA。Disk/Backlog/Availability Alert 以确定性 Threshold Injection 验证 Firing、Noise Suppression 和 Clear，避免破坏 Host Disk。

Web Container 保持 Read-only Root，Next Runtime Cache 只写入明确的 `/app/.next/cache` tmpfs。PostgreSQL 故障恢复序列先等待数据库 Healthy，再重启 PgBouncer 与 Web Slot，清除失败的 Backend/DNS Pool State 后验证 Public Readiness；这也是 Runbook 的恢复顺序。

## Rollback、Recovery 与边界

本阶段没有 Database Migration。Observability Agent、Header/Rate Policy 和安全扫描均为可回滚的应用/配置变更；删除 Agent 不改变 Runtime Data。SQLite Version 5、PostgreSQL Schema 和 Phase 13/14 Shared Recovery/Deployment Engine 未改变。任何配置回滚都必须保留 Phase 15 OIDC/Registry Separation、Phase 13 PostgreSQL-independent Recovery 和 Previous Slot。

没有执行 Production、Public Cutover、DNS/EdgeOne、AList/R2、GitHub Write/Settings、Paid AI、真实 Backup/Restore 或旧 Nuxt Repository 操作。
