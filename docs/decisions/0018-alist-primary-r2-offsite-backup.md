# ADR 0018：AList Primary Backup 与 R2 Off-site Replica

- Status: Accepted
- Date: 2026-09-07
- Supersedes: ADR 0017

## Context

ADR 0017 把 Production Recovery 收敛为 Local Repository + 单一 R2 Off-site Target。Phase 18
首次真实备份证明该路径可工作，但 Owner 随后澄清长期运维目标：AList 是主要对象存储，数据库、
WAL 与 Control-state 恢复制品应先写入现有 AList Bucket 根目录下的独立 `backups/` Namespace；
R2 保存整个 AList Bucket 的完整异地副本，并在 AList 故障时作为恢复来源。

网站 Asset 已以 AList 为运行时 Source。真实盘点还确认 R2 保存一份历史 Asset 副本，因此同一
Off-site Account 需要以隔离 Prefix 同时保存 Asset 与 Recovery Artifact。AList v3 S3 Gateway
只提供实例级 Access Key/Secret，而不是 Per-prefix Credential；Asset 与 Primary Backup 因此使用
同一 Bucket/Pair，以固定 Namespace、应用只读接口与加密制品补偿隔离。R2 必须使用独立 Credential。

## Decision

- `ASSET_S3_*`：Provider-neutral 网站资源接口；Production 当前为 AList Bucket，应用只读。
- `BACKUP_S3_*`：Primary Recovery Replica；Production 与 `ASSET_S3_*` 指向同一 AList
  Bucket/Access Pair，但 Recovery Engine 只写固定 `backups/` Namespace。
- `BACKUP_OFFSITE_S3_*`：Off-site Recovery Replica；Production 当前为 Cloudflare R2。
- AList 与 R2 Bucket/Access Key 必须彼此独立，Production Endpoint 必须为 HTTPS；只有
  `deploy-agent` 获得两组 Recovery 配置。Public Web 仅通过 Read-only Adapter 使用 AList Asset，
  并对 `backups/` 及历史 Recovery Namespace 返回 404；AList 的匿名/CDN Path 同样不得公开
  `backups/`。未来 AList 支持 Per-prefix Credential 时应收紧权限。
- PostgreSQL Recovery Flow 为：加密 Local pgBackRest Repository + WAL -> Immutable
  Generation/Manifest -> AList Primary 与 R2 Off-site 双端完整 Copy/Read-back SHA-256 Verification。
- Backup 只有在 pgBackRest/WAL、本地主清单、AList Primary 和 R2 Off-site 全部验证成功时才为
  `valid=true`；Control-state age-encrypted Snapshot 同样写入并验证两端。
- Restore 优先从 AList Primary 重建 Repository/Control-state；Primary 不可用或校验失败时，使用
  同一 Generation 的 R2 Off-site Replica。两端均失败时 Fail Closed。
- AList 整桶到 R2 的备份使用 `copy-add-update-preserve-target-only`：复制普通 Asset 与
  `backups/` Recovery Artifact 的缺失/变化对象，写入版本化 Hash Manifest，不传播 AList Delete。
  任何 R2-only 对象清理均为单独、显式批准的 Destructive Operation。
- AList/R2 中 Recovery 使用 `backups/database-backups/`、`backups/control-state/`；仅存在于 R2 的
  Mirror Manifest 使用 `asset-backups/`。命名空间冲突时 Fail Closed。

## Consequences

- AList 是正常 Recovery 的首选远程来源；R2 继续提供独立 Provider/Account Failure Domain。
- AList 实例级 Credential 是已记录的 Provider Limitation：Asset/Primary 依靠固定 Namespace、
  应用 Read-only Adapter、Public Prefix Deny 与 Artifact Encryption 隔离，不能声称具有
  Provider-enforced Per-prefix Least Privilege。
- 每次 Recovery Backup 需要双份远程容量与读回带宽，任一副本失败都会使该 Backup 不能通过部署
  Fresh-backup Gate，但成功副本仍保留供诊断和人工恢复评估。
- 既有 R2-only Generation 不删除，但在 AList Primary 尚无同 Generation 时不满足新的双副本
  `valid` Policy；Control-state Schema Version 7 会在升级时把旧记录的 Primary 状态重置为
  `pending` 并设为 `valid=false`，必须在新配置生效后创建 Fresh Full Backup。
- ADR 0017 的单目标配置不再有效。Production SOPS 必须新增 `BACKUP_OFFSITE_S3_*` 保存当前 R2
  值，并把 `BACKUP_S3_*` 改为与现有 `ASSET_S3_*` 相同的 AList 连接值；不新增 AList Bucket。
