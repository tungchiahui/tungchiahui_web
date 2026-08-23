# ADR 0007：提供 Hermetic Local PostgreSQL 与 S3 Emulation

- Status: Accepted
- Date: 2026-08-23

## Context

开发必须在没有 Production Credential 的情况下工作，并且必须通过一条命令复现 Infrastructure Behavior。

## Decision

`./site dev` 启动 Local PostgreSQL 和 Adobe S3Mock，应用 Migration，初始化 Local Object-storage State，Seed Development Data，并启动 Next.js。Automated Test 使用独立 Disposable Infrastructure。AList Compatibility 通过专门的 Contract-test Bucket 验证。

## Consequences

Local Work 快速、可复现且隔离。S3Mock 不替代真实 AList Contract Test，从而避免对 Implementation-specific S3 Behavior 产生错误信心。
