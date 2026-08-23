# ADR 0010：让付费 AI 翻译显式且受预算约束

- Status: Accepted
- Date: 2026-08-23

## Context

英文翻译会消耗付费 Model Token。即使 Owner 暂时不想花 Translation Token，Content Publishing 也必须保持快速可靠。Public Request 永远不能造成意外付费使用。

## Decision

Content Ingestion 只复用已有 Translation-memory Hit，并把 Missing/Changed Segment 标记为 Pending。Pending English Segment 渲染当前 zh-CN Source 作为 Fallback。Paid Translation 只能由 Project CLI 或独立 Manual GitHub Actions Workflow 触发的显式 Production-side Translation Job 执行。必须支持 Dry-run Estimate 和 Server-side Budget Enforcement。

## Consequences

Git Push/Content Publication 永远不会被 AI 阻塞，也不会隐式花费 Paid Token。Translation 可以后续执行、部分执行，或者严格限制 Budget。Translation State 与 Token/Cost Usage 成为可观测的 Production Data。
