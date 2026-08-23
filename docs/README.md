# 文档索引

本目录包含 Website V2 的规范性架构、开发、运维、迁移和决策记录。

## 规范优先级

文档发生冲突时，按以下顺序处理：

1. 最新已批准 ADR
2. 架构文档
3. 规格文档
4. 运维/开发指南
5. 示例和说明性内容

`AGENTS.md` 约束 Coding Agent 的行为，并且必须反映这些决策。

## 从这里开始

完整设计介绍请阅读：

```text
docs/architecture/system-design.md
```

然后阅读：

```text
docs/architecture/overview.md
docs/architecture/network-and-origin.md
docs/architecture/control-plane-and-jobs.md
```

开始实施前阅读：

```text
docs/planning/implementation-plan.md
```

该计划定义 Phase 0–18 的执行顺序、硬 Gate、Commit/停止规则和 Accepted ADR Coverage；它不替代规范或 ADR。

## 目录

- `specification/` — 系统必须实现什么
- `architecture/` — 系统如何设计
- `development/` — 工程师和 Agent 如何进行本地开发
- `operations/` — 生产系统如何部署、翻译与恢复
- `migration/` — 从旧 Nuxt 实现迁移到 V2
- `planning/` — 阶段化实施顺序、依赖、Gate 与进度
- `decisions/` — 不可随意重写的架构决策记录
