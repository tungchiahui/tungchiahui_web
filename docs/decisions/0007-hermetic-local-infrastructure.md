# ADR 0007：提供 Hermetic Local PostgreSQL 与 S3 Emulation

- Status: Accepted
- Date: 2026-08-23

## Context

开发必须在没有 Production Credential 的情况下工作，并且必须通过一条命令复现 Infrastructure Behavior。

## Decision

`./site dev` 启动 Local PostgreSQL 和 Adobe S3Mock，应用 Migration，初始化 Local Object-storage State，Seed Development Data，并启动 Next.js。Automated Test 使用独立 Disposable Infrastructure。真实 S3-compatible Implementation 通过通用 Contract Suite 和专门的非生产 Bucket 验证；当前 Production 选型的 Evidence Target 是 AList。

## Consequences

Local Work 快速、可复现且隔离。S3Mock 不替代真实 Provider Contract Test，从而避免对 Implementation-specific S3 Behavior 产生错误信心；Adapter 与 Test Harness 本身不绑定 AList。
