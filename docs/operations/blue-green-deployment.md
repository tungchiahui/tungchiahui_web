# Blue-Green Deployment

## 拓扑

```text
                  OpenResty
                      |
               active upstream
                 /          \
           Blue :3001    Green :3002
                 \          /
                  \        /
                    PgBouncer
                        |
                    PostgreSQL
```

正常运行时恰好只有一个 Slot 为 Public Traffic 的 Active Slot。

Inactive Slot 用于下一次 Release 或保留 Rollback。

## Endpoint

每个 Application Version 必须暴露：

```text
/api/health
/api/ready
/api/version
```

### Health

回答 Process 是否存活并且内部功能正常。

### Readiness

回答当前 Instance 是否可以安全接收 Production Traffic。

Readiness 可以检查 Database Access 等 Critical Dependency。

避免让非关键第三方依赖决定 Readiness，否则这些依赖不应能够让整个网站下线。

### Version

返回 Deployment Identity，例如：

```json
{
  "commit": "c904e21",
  "slot": "green",
  "buildTime": "..."
}
```

## Cutover

OpenResty Active-upstream Configuration 原子切换并安全 Reload。

Reload 前先验证 Configuration。

Active Slot、Previous Rollback Target、Current/Last Deployment SHA/Digest 与 Cutover Phase 必须在 PostgreSQL-independent Control-state SQLite 中通过 Transaction 持久化。Phase 14 在 Reload 前记录 Pending Slot/SHA/Digest Intent；切流后提交 Current/Previous State。Crash Reconciliation 同时读取 Persisted Phase、Pending Intent 与实际 OpenResty Slot，不只靠运行中的 Container 推测状态。

动态 Upstream 文件位于独立、setgid 的 Deployment Config Directory。`deploy-agent` 先以临时文件提出配置、运行 `openresty -t`，恢复旧文件；只有验证成功后才原子 Rename 并发送 HUP。OpenResty 只读挂载整个 Directory，使 Rename 后的新 Inode 可见。

## Smoke Test

Cutover 前：

- Health
- Readiness
- Version
- Homepage
- Representative Article
- Locale Route
- Search：`/zh-cn/search?q=ROS2_Control` 页面与 `/api/search?q=ROS2_Control&locale=zh-cn`，验证 200、Locale Route、非空 Result 和 `Cache-Control: no-store`
- Static Asset Fetch

Cutover 后，通过真实 Production Entry 重复关键 Public-path Check。

## Rollback

Rollback 是 Traffic Switch，而不是 Rebuild。

在新 Release 通过定义的 Stabilization Policy 前，Previous Slot 保持完整。

Rollback Operation 与 Lock/Lease 保存在 Control-state SQLite，因此 Production PostgreSQL 不可用时仍能创建和恢复。Rollback 后必须执行能够运行的 Control-plane/OpenResty Check；Application Public Smoke 若因 Database Incident 失败，应明确报告 Dependency Failure，而不是丢失 Rollback State。

当前实现的 Rollback Target 是 Version 5 SQLite 中的 Previous Slot + Last SHA/Digest。Engine 只验证保留 Container 与 Digest 并切流，不运行 Build、Candidate Prepare 或 Migration。在 Stabilization Deadline 前不得用另一 Release 覆盖该保留目标。

## Control Plane Independence

`/api/ops/*` 由独立 `control-api` 提供，并由 OpenResty 直接路由，不属于 Blue/Green Slot。`control-api` 与 `deploy-agent` 的基础启动、状态查询和 Recovery Orchestration 不依赖健康的 Production PostgreSQL。

## 数据库兼容性

两个 Slot 在访问同一个 Database 时可能短时间重叠。

因此，相邻 Release 之间的 Application/Database Compatibility 是强制要求。
