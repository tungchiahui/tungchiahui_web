# 贡献指南

## 开发模型

默认分支代表面向生产的代码。

改动应在聚焦的 Branch 中完成，并通过经过 Review 的 Pull Request 合并。

Web Application Repository 的 PR 合并或 Push 到 `main` 后，只有在 CI Quality Gates 全部通过时才自动构建 Git-SHA-tagged Immutable Image 并通过统一 Deployment Engine 发布到 Production。Content Repository 的 Markdown Push 只触发 Content Sync，不触发 Next.js Build/Blue-Green Deployment。

## 编码前

阅读：

- `AGENTS.md`
- 相关架构文档
- 相关 ADR
- 修改运维行为时阅读相关 Runbook

## 本地环境

使用：

```bash
./site dev
```

除非正在调试环境工具本身，否则不要手工拼装一个不完整的本地环境。

## 必需的质量门禁

合并前：

```bash
./site check
./site test
```

实际实现可以进一步调用 Biome、TypeScript、Vitest、Integration Test、Migration Test、Build Check 和 Playwright。

CI 是权威结果。

## Commit 要求

Commit 应保持聚焦且可回滚。

不要混合：

- 无关的 Refactor
- Dependency Upgrade
- Database Schema Change
- 用户可见功能改动

除非这些内容确实无法解耦，并且已经记录原因。

## 数据库变更

每个 Schema Change 都必须有版本化 Migration。

影响生产的 Migration 必须兼容 Blue-Green，并遵循 Expand/Contract。

## 架构变更

如果某项改动改变了 `docs/decisions/` 中已经记录的决策，应创建一个新的 ADR 来 Supersede 旧 ADR，而不是静默重写历史。

## 依赖

不要只是为了少写一点项目特定代码就增加依赖。

对于成熟的安全、解析或协议敏感功能，如果已有维护良好的依赖，不要自行重新实现。

Renovate 是依赖自动更新工具。它只创建 Dependency Update PR，不得直接修改 `main`；PR 必须同步 `pnpm-lock.yaml` 并通过与普通改动相同的 CI Quality Gates。Core Major Update 默认由人工 Review/Merge，Security Update 提高处理优先级，稳定版/LTS 策略保持不变。

## 文档

当行为、运维、架构、配置或公开契约发生变化时，应在同一个改动中同步更新文档。
