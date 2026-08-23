# 代码质量标准

## TypeScript

应用代码使用 TS/TSX。

要求的 Compiler Posture：

```text
strict
noUncheckedIndexedAccess
exactOptionalPropertyTypes
noImplicitOverride
```

避免用 Type Assertion 替代 Validation。

## Runtime Validation

校验：

- Environment Variable
- HTTP Request Payload
- 依赖的 External API Response
- Content Ingestion Input
- 不可信 Frontmatter
- Operational Command Argument

## Formatting 与 Linting

Biome 是默认 Formatter/Linter。

除非某种特定且不受支持的格式确实需要另一工具，否则避免重叠的 Formatter Stack。

## Server/Client Boundary

优先使用 Server Component。

仅在以下情况需要时使用 Client Component：

- Browser API
- Local Interactive State
- Effect
- Event Handler
- Client-only Library

绝不能通过把 Server Module Import 到 Client Boundary 而暴露 Server Secret。

## Dependency Hygiene

- 移除无用依赖
- 保持 Import 明确
- 不要无必要地增加重复 Platform/Library 行为的 Utility
- 优先使用小而内聚的 Module，而不是巨型 Utility File

## Error Handling

Error 必须携带足够 Context 以诊断 Failure，但不得暴露 Secret。

具有运维意义的 Failure 应输出 Structured Log 和适当 Metric。

## Comment

Comment 应解释 Why、Invariant、Protocol Constraint 或不明显的 Tradeoff。

不要逐行描述显而易见的代码。
