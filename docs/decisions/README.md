# 架构决策记录

Architecture Decision Record（ADR）用于记录重要决策及其理由。

ADR 是不可变的历史记录。

如果决策发生变化：

1. 创建新的 ADR
2. 将之前的 ADR 标记为 Superseded
3. 链接两份记录

不要为了让历史看起来更整洁而重写旧的 Decision Rationale。

## Status 值

- Proposed
- Accepted
- Superseded
- Rejected

## 当前 ADR

- `0001-new-nextjs-v2-repository.md`
- `0002-postgresql-runtime-content-store.md`
- `0003-s3-for-static-assets-and-backups.md`
- `0004-blue-green-application-deployment.md`
- `0005-typescript-only-application-source.md`
- `0006-github-zh-cn-content-source-of-truth.md`
- `0007-hermetic-local-infrastructure.md`
- `0008-expand-contract-database-migrations.md`
- `0009-near-zero-downtime-planned-db-migration.md`
- `0010-explicit-budgeted-ai-translation.md`
- `0011-domain-addressed-control-plane-and-ddns-origin.md`
- `0012-one-way-github-content-synchronization.md`
- `0013-separate-content-worker-and-deploy-agent.md`
- `0014-decouple-control-api-from-nextjs-slots.md`
- `0015-postgresql-independent-control-plane-recovery-state.md`
- `0016-shared-host-loopback-ingress.md`
- `0017-single-offsite-s3-backup-target.md`
