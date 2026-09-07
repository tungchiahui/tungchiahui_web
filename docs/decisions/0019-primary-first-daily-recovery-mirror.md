# ADR 0019：Primary-first Daily Recovery Mirror

- Status: Accepted
- Date: 2026-09-07
- Supersedes: ADR 0018 的并行 Recovery Replication 与未定义 Schedule；保留 ADR 0018 的 Provider、Namespace、Encryption、Restore Priority 和 Asset Preserve-delete 决策

## Context

Phase 18 首次真实双副本备份只有约 56 MiB，但 pgBackRest Repository 包含 2,761 个对象。原实现
对每个目标串行 PUT，再串行 GET 做完整 SHA-256 读回；R2-only 基线耗时 676.565 秒，AList + R2
运行耗时 1,366.115 秒。AList 还是主要 Recovery Store，R2 的运维定位则是 AList 的异地保留型
镜像。并行把 Local Repository 分别传到两端既不能表达该主次关系，也让失败重试必须重新创建完整
Backup。

生产主机已有 PostgreSQL WAL 约每 60 秒归档到本地加密 pgBackRest Repository，但没有自动 Base
Backup 或远程复制 Timer。Owner 接受最多约 24 小时的异地主机丢失 RPO，并要求每日任务尽量在
Asia/Hong_Kong 凌晨 3 点附近执行。

## Decision

- Recovery 数据路径改为严格顺序：Local pgBackRest -> AList Primary PUT/完整读回验证 -> 从已验证
  AList 对象读取 -> R2 PUT/完整读回验证。AList 失败时不得写 R2。
- 单个远端阶段使用最多 8 路有界并发；Manifest、Key Set 和每个对象的 SHA-256 Gate 不放宽。
- 每个 Primary/Off-site 阶段记录 Transfer、Verification 和 Total Seconds 的结构化事件；不得记录
  Endpoint、Credential、Connection String 或对象正文。
- AList 已 Fresh 而 R2 失败时，允许经同一 Control API/SQLite/Deploy-agent Operation Path 只重试
  Off-site Mirror。Retry 必须重新验证记录身份、Primary Manifest/完整对象，并从 Primary 读取；不得
  重跑 pgBackRest 或伪造新的 Backup 完成时间。
- Provision 支持安装 Host Timer，但默认既不安装也不启用。Owner 明确批准安装/启用后，Timer 于每天 03:05
  Asia/Hong_Kong 幂等创建一次 Recovery Operation：周日 Full，其余日期 Differential。Timer 只负责
  创建受审计 Operation，长任务仍由 Deploy-agent Claim/Lease/Fencing 和同一 Recovery Engine 执行。
- 本地 WAL 继续持续归档。pgBackRest 在每次成功 Backup 后自动执行 Expire：保留 2 个 Full、
  Differential Retention Count 4，以及 2 个 Full 范围所需 WAL。它不是独立的每日清理 Timer。
- AList/R2 已上传 Generation 本阶段不做隐式删除。AList 删除仍不传播到 R2；任何 Remote
  Generation 清理必须先形成精确清单并由 Owner 单独批准，不能绑在每日 Backup 成功路径内。
- 普通 Asset 的 AList -> R2 `copy-add-update-preserve-target-only` 仍为独立 Operation；它不连接
  PostgreSQL，也不由数据库 Timer 隐式触发。

## Consequences

- R2 成为 AList 字节级 Recovery 镜像，而不是 Local Repository 的平行上传目标；正常 Restore
  顺序仍为 AList 后 R2。
- 两个远端阶段不再互相争抢请求，但端到端时间为两阶段之和。有界并发消除数千个小对象逐一等待
  RTT 的主要瓶颈；真实改善幅度必须由新的 Production Backup Measurement 证明。
- Daily Off-site RPO 约为 24 小时；本地主机仍可借助约 60 秒 WAL Archive 做更细 PITR。该数值是
  Schedule/Risk Choice，不是恢复成功或 RTO 承诺。
- Timer 默认不安装且关闭，避免代码部署本身未经批准就创建 Production Backup。安装/启用 Timer、首次定时运行、
  Remote Delete 和 Restore Drill 仍分别遵守 Production/Destructive Authorization Gate。
