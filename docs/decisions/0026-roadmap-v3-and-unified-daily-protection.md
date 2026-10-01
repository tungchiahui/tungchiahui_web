# ADR 0026：Tech Roadmap V3 与统一每日 Protection

- Status: Accepted (Owner request; production activation remains a separate operation)
- Date: 2026-10-01
- Supersedes: ADR 0019 中“普通 Asset Backup 不由数据库 Timer 触发”的部分

## Context

Owner 要求在线管理 Tech Roadmap，且将数据库、控制状态和资产纳入同一个每日任务。原 V2
只保存 Slug-keyed 进度；改层级会破坏引用。V3 迁移还会使原 V2-only Web 无法读取，因此必须
先有兼容版本，再进行数据 Backfill，不能把一次普通部署当作安全的版本切换。

## Decision

- `app.owner_managed_datasets.tech_footprint` 继续是唯一 Runtime Source of Truth；V3 JSONB
  同时保存层级定义、LocalizedText、UUID 和执行状态。CAS、Owner Session、Origin、草稿和
  独立 Control API 边界保留。没有 CMS、GitHub 写回或 Tech 专属备份/恢复格式。
- 0009 是数据 Backfill，保留表结构；先发布生成的临时兼容版本（migration journal 到 0008，
  V2/V3 可读、V2 状态写入可用、Tech UI 只读），然后以该版本作为 Active/Previous 部署最终版。
  Deploy-agent 检查 Active Image 的 V3 读取能力，Migration Policy 在证据缺失时拒绝执行。
  原 V2-only Image 不得成为迁移后的 Rollback Target。没有同 Release 的 Destructive Contract。
  Scoped Control Service reconciliation 仅执行 through-0008 的结构迁移，不执行 0009 Backfill。
  Rollback 不执行 Migration；兼容校验针对保留的目标 Image，备份前置只约束实际数据转换。
- `tungchiahui-backup.timer`/service 名称保持不变，唯一入口于 `03:05 Asia/Hong_Kong` 调度
  `daily-protection` Recovery Operation：Sunday Full，其余 Differential；Persistent=true、
  AccuracySec=1min、RandomizedDelaySec=0。Key 为 `scheduled-daily-protection:production:YYYY-MM-DD`。
  升级发现旧 `scheduled-backup:production:<date>` Operation 时保留当天身份，避免重复补跑。
- 每日顺序为 pgBackRest/check/verify → AList 完整读回验证 → 从 AList 镜像 R2 完整验证 →
  age 加密 SQLite Control-state Snapshot 双副本 → 同一个 `backupAssets` Preserve-target-only
  Asset Mirror → 小型 Daily Manifest 双副本 PUT/GET/SHA-256。各组件保留现有格式。
- SQLite Operation 持续记录完成组件、当前阶段和失败组件。失败保留已验证数据库 `valid=true`；
  同 Operation 重入仅执行缺少组件。AList fresh/R2 failed 用现有 Offsite Retry；本地已有当天
  同类型完成 Backup 时复用 pgBackRest Label，重新 check/verify/replicate，无新 Base Backup。
  30 秒续租，阶段检查 Fence；过期进程不得完成 Operation 或启动下一组件。
- Daily Manifest 在 `backups/daily-manifests/YYYY-MM-DD.json`，包含日期、环境、备份标识、
  Generation/Manifest Hash、Control-state Ciphertext Key/Hash 和 Asset Summary/Manifest Hash；
  不包含凭据或业务正文。两个目标逐个读回核对后才完成每日 Operation。Manifest 暂长期保留。
- ADR 0018/0019 的 Provider、Primary-first、AList → R2、WAL/PITR、Encryption、Restore Priority、
  Replica Verification 和本地 pgBackRest Retention 不变。ADR 0025 的 90 天、最新四条 Verified
  Full Chain 与独立清理授权不变；每日流程不删除 Asset、target-only、Control-state 或未知对象。

## Recovery validation

Disposable Restore Drill 在同一个数据库备份中保存代表性 V3 层级、UUID、标题、进度/状态/备注
和 revision，PITR 后验证完整引用与唯一 ID。Owner Session verifier rotation 规则不变。
每日 Assets 失败、Manifest Corruption、同日幂等和组件重试必须有自动化证据。Production Drill
与指定非生产 AList Bucket Contract Test 继续各自遵守授权与凭据边界。
