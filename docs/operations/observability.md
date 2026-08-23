# 可观测性

## 目标

发生 Production Incident 时，必须能够诊断问题，而不是猜测哪一层失败。

## 层级

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

## Control-plane 与 Worker Job

观察：

- Queued/Running/Failed Content-sync Job
- Queued/Running/Failed Translation Job
- Translation Pending-block Count
- Translation Token/Cost Usage
- Budget-stop/Partial Job
- deploy-agent Job Failure
- Job Age / Stuck-job Detection

Durable Job 如果保持 `running` 超过预期 Execution Window，必须能够检测并告警。

## Network/Origin Health

分别监控 Public Path 和 Origin Path：

```text
public: www.tungchiahui.cn -> EdgeOne -> origin
origin: ddns.tungchiahui.cn -> OpenResty
```

Monitoring Model 不得假设 Public IPv4 一定存在。

当 IPv4 被移除、Origin 变为 IPv6-only 时，如果使用 Direct-origin Monitoring，Origin Check 必须继续通过支持 IPv6 的 Monitoring Path 工作。
