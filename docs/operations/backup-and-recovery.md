# 备份与恢复

## 目标

数据丢失和无法恢复的损坏不可接受。

## PostgreSQL 备份

基线：

- pgBackRest
- 按配置执行 Full/Differential/Incremental Policy
- WAL Archival
- PITR Capability
- Retention Policy
- Integrity Verification

## 备份目标

推荐 Flow：

```text
PostgreSQL
    |
 pgBackRest
    |
primary backup repository
    |
AList S3 or validated backup target
    |
Cloudflare R2 independent replica
```

直接使用 pgBackRest-to-AList S3 必须通过显式 Compatibility Test。

如果 AList S3 不满足所需 Repository Semantics，则使用：

```text
pgBackRest -> local backup repository -> verified sync -> AList/R2
```

正确恢复比架构形式上的整洁更重要。

## Backup Command

```bash
./site backup
```

该命令必须：

- 识别 Production DB
- 安全运行/触发 Backup
- 验证完成状态
- 验证 WAL Archive Health
- 记录 Backup Metadata
- 报告 Replica Status

## Restore

```bash
./site restore <backup-or-time>
```

没有 CLI 中明确的 Environment/Confirmation Policy 时，绝不能对 Production 执行 Destructive Restore。

## Restore Drill

按计划执行：

```text
select real backup
      |
disposable PostgreSQL
      |
restore
      |
migration/version check
      |
integrity queries
      |
representative application read checks
      |
destroy disposable environment
```

只有成功完成 Recovery Test 的 Backup 才可信。

## RPO/RTO

在观察真实 Backup/WAL 行为后再添加精确数值目标。

没有 Measurement 时不要虚构 SLA 数字。
