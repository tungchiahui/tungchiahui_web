# 可观测性

## 目标

发生 Production Incident 时，必须能够诊断问题，而不是猜测哪一层失败。

## 层级

Phase 16 的可执行 Catalog/Alert Policy 位于 `src/observability/policy.ts`，采集器是独立 `observability-agent`。该 Agent 只有内部 Health Network、只读 Host/Control-state Mount 和可选 HTTPS Alert Sink，不持有 PostgreSQL、S3、AI、Registry 或 Docker Credential。内部 `/health`/`/metrics` 不经 OpenResty 暴露。

| Component | Owner | Health/Metric | Safe Log | Alert/Runbook |
| --- | --- | --- | --- | --- |
| OpenResty | Operations | Public/Origin HTTPS、Status/Latency | JSON Access，无 Query/IP/Auth/Cookie | Availability/Latency/Origin |
| Next.js | Web | `/api/health`、`/api/ready`、Version | unified JSON request event | Availability/Latency/DB |
| control-api | Operations | internal `/health` + SQLite/Job Snapshot | unified JSON request/audit event | Control state/Audit/DB |
| content-worker | Content | internal `/health` + PostgreSQL Job Snapshot | unified JSON job/error event | Backlog/Lease/Budget |
| deploy-agent | Operations | internal `/health` + SQLite Operation Snapshot | unified JSON operation event | Operation/Recovery |
| PostgreSQL | Database | Next/Job Snapshot | bounded dependency failure | Database Incident |
| PgBouncer | Database | internal TCP Probe | container log + probe event | Pool Saturation |
| S3 | Storage | representative gateway object read | bounded gateway/probe event | S3 Incident |
| Backup/WAL/R2 | Recovery | latest validated SQLite evidence | audited operation event | Backup/Restore |
| Host | Operations | read-only bytes/inodes | snapshot event | Disk Pressure |
| observability-agent | Operations | internal `/health`/`/metrics` | alert/snapshot JSON event | Control-state incident |

### Public Availability

外部 Uptime Check：

- Homepage
- Health-safe Public Endpoint
- Representative Content Route

### OpenResty

观察：

- Request Rate
- Upstream Status
- 4xx/5xx
- Latency
- Active Slot

### Next.js

Structured Log 应包含安全字段，例如：

```text
timestamp
level
request_id
route
method
status
duration_ms
deployment_commit
slot
```

不得包含 Secret。

### control-api / Recovery State

独立观察：

- `control-api` Health/Latency/Authentication Failure/Rate Limit
- OpenResty `/api/ops/*` Direct-routing Correctness
- Control-state SQLite Integrity/Schema Version/WAL/Checkpoint Health
- Infrastructure Operation Phase、Lock/Lease、Heartbeat 与 Stuck/Expired Lease
- Active/Previous Slot 和 Current/Last Deployment SHA 对账
- Break-glass Invocation 与 Audit Continuity

这些检查不得要求健康的 Production PostgreSQL；否则 Database Incident 时会同时失去 Recovery Observability。

### PostgreSQL / PgBouncer

监控：

- Connection Usage
- Pool Saturation
- Query Latency
- Slow Query
- Lock
- Database Size
- Extension/Search Health
- 启用时的 Replication State

### Host

监控：

- CPU
- Memory
- Disk Space
- Filesystem/Inode Usage
- I/O
- Container Health
- Restart Count

### Backup

监控：

- Last Successful Backup
- WAL Archive Freshness
- R2 Replica Freshness
- Last Successful Restore Drill

## Alert

Alert 应可操作。

示例：

- Disk Space 接近 Critical Threshold
- Production Public Check 失败
- Database 不可用
- 重复 5xx Spike
- Backup 过期
- WAL Archive 失败
- Restore Drill 失败

避免对没有 Operator Action 的 Noise Metric 告警。

Alert 只在状态变化时发出 `firing`/`resolved`，每个 Rule 必须有 Severity、Owner Component 和精确 Runbook Anchor。Production 激活时可选 Webhook 必须使用 HTTPS；Delivery Failure 本身只记录安全的 Error Type/Message，不记录 Token 或完整响应。

## Control-plane 与 Worker Job

观察：

- Queued/Running/Failed Content-sync Job
- Queued/Running/Failed Translation Job
- Translation Pending-block Count
- Translation Token/Cost Usage
- Budget-stop/Partial Job
- deploy-agent Operation Failure
- Job/Operation Age 与 Stuck Detection

其中 Content/Translation/Search 属于 PostgreSQL-backed Job；Deploy/Rollback/Restore/Recovery 属于 SQLite-backed Infrastructure Operation。Dashboard/Alert 必须明确区分，不得把 Database 不可用误报为 Control Plane 整体消失。

Durable Job/Operation 如果保持 `running` 超过预期 Execution Window，必须能够检测并告警。

Phase 9 Translation Worker 每个完成 Segment 输出结构化 `translation_segment_completed`，只包含 Job/Segment ID、Provider、Model、Input/Output Token 和 Cost；Job detail 持久保存 Estimate、Actual、Provider-call、Completed/Remaining Count 与 Error Summary。不得记录 Prompt Credential、API Key、Authorization Header、Connection String 或完整 Provider Request。Budget Stop 以 `translation_jobs.status=partial` 和剩余计数观测；Revalidation Retry 通过 Durable Progress 中的精确 Document ID 恢复。

## Network/Origin Health

分别监控 Public Path 和 Origin Path：

```text
public: www.tungchiahui.cn -> EdgeOne -> origin
origin: ddns.tungchiahui.cn -> OpenResty
```

Monitoring Model 不得假设 Public IPv4 一定存在。

当 IPv4 被移除、Origin 变为 IPv6-only 时，如果使用 Direct-origin Monitoring，Origin Check 必须继续通过支持 IPv6 的 Monitoring Path 工作。

默认代表性 Storage Probe 是 `/api/assets/monitoring/health.svg`。它必须是无敏感内容、稳定且可公开读取的 S3 Object；监控必须经过应用 Asset Gateway，不得通过 Filesystem Static Page 假装验证 S3。

## Telemetry 安全 Contract

TypeScript Event 统一包含 `timestamp`、`level`、`component`、`event`、`request_id` 与有界 Scalar Attribute。禁止 Attribute Name 包含 Authorization、Cookie、Credential、Password、Private Key、Secret、Token 或 Connection String；Error Message 再对 Bearer、PostgreSQL URL、age Key 和 PEM Private Key 做 Redaction。

OpenResty JSON Access Log 不记录 Query String、Client IP、Authorization、Cookie 或 Body。若诊断需要关联请求，使用 `x-request-id`，不要临时打开敏感 Header/Body Logging。
