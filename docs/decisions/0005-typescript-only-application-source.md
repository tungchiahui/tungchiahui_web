# ADR 0005：Application Source 使用 TypeScript/TSX

- Status: Accepted
- Date: 2026-08-23

## Context

网站将主要通过 Coding Agent 开发。强类型检查和一致的语言约束可以减少 Silent Drift 和低质量 Shortcut。

## Decision

在 TypeScript 是自然格式的 Application 和 Automation Source 中使用 TypeScript/TSX。SQL、YAML、Dockerfile、OpenResty Config 和 Markdown 保持原生格式。不得引入 JavaScript/JSX Application File。

## Consequences

项目强制 Strict Typing 和 Runtime Validation。Native Infrastructure Format 保持可读和标准，而不是人为从 TypeScript 生成。
