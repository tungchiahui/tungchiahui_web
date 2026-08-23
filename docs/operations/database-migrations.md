# 数据库 Migration 策略

## Tooling

Schema 通过 Drizzle 和 Versioned Migration 表示。

Production Migration 必须可 Review、可复现。

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

## CI

Migration CI 验证：

- Clean Bootstrap
- 从 Previous Production Schema Upgrade
- Representative Production-like Data
- Compatibility Assumption
