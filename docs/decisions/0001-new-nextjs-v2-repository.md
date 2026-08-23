# ADR 0001：在新的 Next.js Repository 中构建 V2

- Status: Accepted
- Date: 2026-08-23

## Context

旧站是一个成熟的 Nuxt 实现，包含 Static-generation Assumption、自定义 Content Behavior 和现有 Public URL。机械转换现有 Repository 有可能继续保留 V2 原本准备替换掉的旧架构。

## Decision

创建新的 Next.js V2 Repository。旧 Nuxt Repository 保持只读，只作为 Behavior、Route 和 Visual Reference。使用 V2 架构重新实现 Feature，而不是逐行翻译 Vue/Nuxt Code。

## Consequences

Migration 需要明确的 Feature Inventory，但新的 Codebase 可以从干净状态开始。Legacy Implementation Debt 不会变成隐藏 Compatibility Layer。Public Behavior 和 URL 是有意保留，而不是偶然保留下来。
