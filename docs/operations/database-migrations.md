# 数据库 Migration 策略

## Tooling

Schema 通过 Drizzle 和 Versioned Migration 表示。

Production Migration 必须可 Review、可复现。

Phase 3 的实现入口：

- `src/database/schema.ts`：当前 Drizzle Type Integration；
- `drizzle/*.sql` 与 `drizzle/meta/_journal.json`：顺序化 SQL 与 Drizzle Journal；
- `drizzle/migration-policy.json`：每个 Migration 的 Expand/Contract、Risk、Fresh-backup Requirement 和 Recovery 说明；
- `src/database/migrate.ts`：Advisory Lock、Policy Gate、Role Bootstrap、Drizzle Runner 与 Applied Hash/Timestamp Verification；
- `ops/database/roles.sql`：Cluster Role、PGroonga 与 Object Grant Bootstrap。

`drizzle-kit generate` 只生成可 Review Artifact；`drizzle-kit push` 不是受支持的 Production Path。Checked-in Migration 被应用后不得改写：Runner 会把数据库中保存的 Hash/Timestamp 与当前 Artifact 比较并拒绝 Drift。

Phase 5 增加 `0002_phase5_job_claiming`：为既有 Application Job 添加带安全 Default 的 Attempt/Available/Claim/Lease Column，并把 Claim Support Index 替换为包含 `available_at` 的 Superset Index。Phase 4 不会创建 `running` Application Job，因此新增 Claim-consistency Constraint 与相邻 Phase 4/5 Code 兼容；该变更按 Expand、Low Risk、No Fresh Backup Required 记录。

## 禁止 Production Push

不要通过未版本化的 Convenience Command 修改 Production Schema。

生成并应用明确 Migration。

## Blue-Green 规则

相邻 Production Application Version 在部署过程中必须能够共存。

使用 Expand/Contract。

## Expand Phase

示例：

- Add Nullable Column
- Add New Table
- Add Compatible Index
- 增加新的 Enum Representation，但不删除旧用法
- 必要时开始 Dual-read/Dual-write

## Deploy Phase

部署可以同时在 Old Schema 与 Expanded Schema 上运行的 Application Code。

需要时通过 Controlled Job 执行 Backfill。

## Contract Phase

只有在旧 Application Version 不再是 Rollback Target 后，才可以：

- Remove Old Column
- Remove Old Table
- Tighten Constraint
- Stop Dual-write
- Drop Obsolete Index

Contract Phase 属于后续 Release。

## Migration Backup Policy

Risky Migration 执行前必须有 Fresh Recoverable Backup。

Deployment CLI 根据 Migration Metadata/Policy 决定这一点，而不是依赖 Operator 记忆。

Migration Orchestration Phase、Lock 与 Audit State 保存在 PostgreSQL-independent Control-state SQLite 中，不能要求先向目标 Production PostgreSQL 创建 Operation Job。实际执行某个 Schema Migration 当然要求 Database 可达；如果不可达，应安全停在明确 Phase，并保留可恢复状态。PostgreSQL Restore/Recovery 使用同一 Control/Recovery Engine。

Phase 3 Runner 已强制解析 Metadata：未经显式 `allowContract` 不执行 Contract Migration；标记 `requiresFreshRecoverableBackup` 的 Migration 在没有 Fresh-recoverable-backup Evidence 时拒绝。Phase 14 已把这些输入接入 Shared Deployment Engine 和 SQLite Operation State。Production one-shot Runner 使用独立 `site_migrator_login` 直连内部 `postgres:5432`，保证 Session Advisory Lock 不经过 Transaction-pooling PgBouncer；它不执行 Cluster Role/Extension Bootstrap，只在 Migration 后应用由 Object Owner 有权设置的 Runtime Grant。Shared Engine 固定 `allowContract=false`，Fresh Evidence 必须来自有效、主副本与 R2 均 Fresh 且位于配置窗口内的 Recovery Record。

## Role Boundary

| Role | 能力 | 禁止 |
| --- | --- | --- |
| `site_migrator` | 在目标 Database 创建/拥有 `app` 与 `drizzle` Schema Object | Superuser、Role/Database 管理、Replication、Extension Bootstrap |
| `site_app` | 读取 `app` Runtime Table | Schema 写入、Extension、Backup、Replication、Migration |
| `site_content_worker` | 对 `app` Table 执行受控 CRUD | Schema/Extension/Role/Replication 管理 |
| `site_backup` | `pg_read_all_data`、`pg_monitor` | Application Write、Schema Migration、Replication |
| `site_replication` | PostgreSQL Replication Attribute | Application Table Grant、Schema Migration、Backup Role Inheritance |

这些是 NOLOGIN Group Role。Phase 12 已通过 SOPS + age Secret 和 Hardened One-shot Bootstrap 配置不同的 `site_app_login`、`site_control_api_login`、`site_content_worker_login`、`site_migrator_login`，每个 Login 只继承对应 Group Role；普通 Runtime 不使用 Bootstrap/Superuser Identity。Local Seed 在 PgBouncer Transaction 内使用 `SET LOCAL ROLE site_content_worker`，Application Compatibility Test 使用 `SET LOCAL ROLE site_app`，不会把 Superuser Session State 泄漏到下一个 Transaction。

## CI

Migration CI 验证：

- Clean Bootstrap
- 从 Previous Production Schema Upgrade
- Representative Production-like Data
- Compatibility Assumption

当前 Migration Suite 使用 Disposable PostgreSQL 18，分别验证 Empty -> Phase 5 Latest、由 `tests/fixtures/database/previous-schema.json` 固定的 Previous -> Latest、重复执行、Applied Hash、Representative Data Preservation、Role Boundary、数据库 Enum/JSON/Claim Constraint 和 transaction-mode PgBouncer + Drizzle Query。任何成功或失败路径都删除 Test Container、Network 和 Volume。
