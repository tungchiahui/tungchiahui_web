# ADR 0017：单一 Off-site S3 Backup Target

- Status: Superseded by ADR 0018
- Date: 2026-09-06
- Supersedes: ADR 0003

## Context

ADR 0003 同时选择 AList 作为 Asset/Primary Backup Object Store、Cloudflare R2 作为第二套
Off-site Replica。Phase 18 真实部署确认 Owner 的运维模型只有两组对象存储职责：网站资源一组，
备份一组。网站资源当前使用 AList，数据库与 Control-state 的异地备份当前使用 R2。

本地加密 pgBackRest Repository 已保留完整 Backup/WAL，并在上传前执行 pgBackRest Check、
Manifest 与逐对象 SHA-256；再强制复制相同 Generation 到两个远程 Bucket 增加了 Credential、容量、
失败面和恢复操作复杂度，却不符合 Owner 的实际目标。

## Decision

- `ASSET_S3_*` 是 Provider-neutral 网站资源接口；当前 Production Provider 是 AList。
- `BACKUP_S3_*` 是唯一 Provider-neutral Off-site Backup 接口；当前 Production Provider 是
  Cloudflare R2。
- PostgreSQL Backup Flow 是：加密 Local pgBackRest Repository + WAL -> 完整 Manifest/Hash ->
  `BACKUP_S3_*` Off-site Copy。
- Control-state SQLite 的 age-encrypted Snapshot 使用同一个 Backup-only Target，但使用独立 Object
  Prefix、Manifest 与 `latest.json`。
- Asset 与 Backup 必须使用不同 Bucket 和 Access Key；Production Endpoint 必须使用 HTTPS。
- 不再接受或注入 `BACKUP_R2_*`。未来增加第二个远程 Provider/Account 必须有新的 ADR 和独立
  Failure-domain 说明，不能复制一组环境变量来伪装独立性。

Backup 只有在本地 pgBackRest Check/WAL Evidence、完整 Off-site Upload 和逐对象 Read-back Hash
全部通过后才标记为 Valid。Restore 必须能从 Off-site Target 独立重建本地 Repository。

Control-state SQLite 以 Additive Version 6 增加 `offsite_replica_status`；旧
`primary_replica_status`/`r2_replica_status` Column 暂时保留并由写入层兼容，后续 Release 才可按
Expand/Contract 原则移除。

## Consequences

- Production 只需一组 Backup-only R2 Bucket/Credential，配置和恢复路径更直接。
- Application/Automation/CLI/Domain Type 仍只依赖通用 S3-compatible Contract，不绑定 AList 或 R2。
- 本地主机故障仍可从 R2 恢复；R2 故障时本地 Repository 仍存在，但在 Off-site Read-back 恢复前
  Backup 不算 Fresh/Recoverable，也不得通过 Deployment Fresh-backup Gate。
- 相比两套独立远程 Provider，云端 Failure-domain 冗余较少；通过 Immutable Generation、Retention、
  WAL、完整读回校验、Control-state 加密副本和定期 Restore Drill 管理风险。
- Canonical Article Markdown 继续只存在于 GitHub，不进入 Asset 或 Backup Object Store。
