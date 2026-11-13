# ADR 0033 — 受审计的 PostgreSQL 镜像定向维护

- Status — Accepted for local implementation and validation
- Date — 2026-11-13
- Authorization — Owner 授权本地实现、分析和完整 Gate。每次 SSH、main 推送、Workflow 修改与生产操作继续逐项事前授权。
- Clarifies — ADR 0015、0027、0032

## 决策

在既有 Infrastructure Operation 的 `server-migration` 闭合 Target 中增加
`postgres-image-upgrade`，包含 `preflight` 和 `execute`。沿用独立 Control API、
Operator Capability、Nonce/Idempotency、Core Schema 8、全局排他 Claim、Host Executor
Lease/Fence、版本化 Host Adapter 和 Recovery Engine。常驻 deploy-agent 的普通 Recovery
Polling 继续处理 Backup/Restore；Host Coordinator 领取数据库镜像维护，并通过固定的一次性
Recovery Job 调用同一备份与副本验证实现。

本轮支持已演练的 PostgreSQL 18.4、PGroonga 4.0.8、pgBackRest 2.59.1 系统库修补。
Target 固定生产 Environment、批准仓库中的旧/新 SHA-256 Digest、候选源码 SHA 和 Full Backup ID。
Execute 另外绑定已成功的 Preflight Operation、明确 Confirmation 和单独授权的真实恢复演练
报告 SHA-256。该 SHA 是 Operator 提交的证据引用，生产执行前由 Owner/Operator 审阅报告内容。

预检核对实际容器 Image ID/RepoDigest、候选 OCI Revision、二进制/扩展版本、
Collation、四语言索引查询、私有角色边界、Compose 与实际数据/备份/配置/Socket 挂载、
空间、Backup 新鲜度和双副本完整读回。预检保存 `.env` Hash、拓扑、Web Active/Previous
状态、Consumer 容器身份与运行状态、Timer 原启用/活动状态。Execute 重新验证该基线，并绑定
成功 Preflight 的同一 Immutable Generation 完整读回证据及 Backup 新鲜度。

执行前在共享 Deployment Config 目录写入维护标记。OpenResty 对业务入口返回 503、
Retry-After 和 no-store，保留独立基础设施查询、Backup 与 Restore 控制。
Control API 自身也通过 SQLite 检查维护状态，关闭数据库业务 Handler。
停止既有 Consumer 和 Timer 后等待 Client Backend、WAL Sender、事务与 Prepared Transaction
排空。确认 PostgreSQL 干净退出和 Control Data 的 shutdown 状态，再生成受限冷副本、
逐文件 SHA-256 Manifest 并 fsync/完整读回。

只通过既有 Compose 定向重建 PostgreSQL，保留数据、Socket、网络和 Hardening。
校验运行 Digest、版本、全业务表与 Migration Ledger 摘要、角色/ACL、四语言真实索引搜索、
临时写入读回和 WAL Restore Point。amcheck 在事务内临时加载并回滚，检查支持的 Heap/B-tree。
随后通过同一 Recovery Engine 创建 Full Backup、check/verify 和双副本读回，再按原状态恢复
Consumer/Timer，验证 PgBouncer 与站点 Health/Ready，清除维护标记。

每个外部变更前持久化 Intent；Phase、Result 和 Audit 在同一 SQLite Transaction 中提交。
过期 Lease 由稳定 Supervisor Fence，清理原维护 Recovery Job，再重新领取原 Operation。
已完成冷副本必须重新校验，候选启动可重放；Backup Intent 绑定最早开始时间，完成后的
pgBackRest Label 和持久化 Receipt 可复用。未知状态继续保持维护态。

候选失败后优先以旧精确 Digest 启动同一数据目录并重新验证，保存失败和回退结果。
回退验证失败时进入 `needs-attention`，保留维护标记和排他状态。可恢复故障修复后，Operator
可使用显式 Confirmation 和稳定 Retry Key 审计重试旧镜像补偿。Owner 单独授权恢复后，
Restore 请求可携带准确 `maintenanceOperationId`，在同一 SQLite Transaction 中审计交接原
Operation 并创建既有 Restore Operation。原维护 Target、Result 和 Audit 保留，业务入口
继续关闭。完成恢复、Session Verifier 轮换和新鲜恢复证据后，新一轮预检/维护继承原 Consumer
和 Timer 运行意图，验证成功或安全回退后解除保持状态。

## 恢复与验证

Core Schema 8 的 Table/Constraint 保持兼容，新增 Target、Phase 和 Result 进入既有加密
Control-state Snapshot。生产维护需先发布带此能力的独立服务、Host Executor 和 OpenResty
配置，再核对实际安装版本。正常 Web 发布继续捕获并保留实际 PostgreSQL Image Reference。

完整 Gate 覆盖状态机、Fence、排他窗口、幂等、预检 Drift、各阶段重启、候选失败回退、
回退失败保持状态和显式 Restore 交接。Foundation 使用隔离 Registry、S3Mock 和合成数据，
运行真实镜像替换、冷副本、四语言索引、权限/摘要、维护入口、崩溃接续和升级后双副本备份。
Recovery 保留 Full/Diff/Incr、PITR、Off-site Fallback 与 Control-state 恢复。

生产真实备份的隔离恢复与生产数据库切换分别等待 Owner 授权。执行清单见
[数据库镜像维护方案](../operations/postgres-image-maintenance.md)。
