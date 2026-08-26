# Credential 最小权限与轮换

本文件定义 Production Credential 的唯一职责、持有者、轮换和验证顺序。所有明文值只存在于授权 Host 的 SOPS 解密结果；仓库只保存变量名和加密制品。

## 权限矩阵

| Credential | 唯一持有者 | 最小权限 | 明确不得拥有 |
| --- | --- | --- | --- |
| Web PostgreSQL Login | `web-blue` / `web-green` | `site_app` Public Read | Migration、Backup、Replication、Owner Write |
| Content-worker PostgreSQL Login | `content-worker` | `site_content_worker` Content/Translation/Search Job 与 Owner-authorized Side Effect | Docker、Host Shell、Backup、Schema Owner |
| Control API PostgreSQL Login | `control-api` | `site_control_api` Application Job 与 Owner Dataset CAS | Docker、Migration、Backup、AI Provider |
| Migration PostgreSQL Login | one-shot `database-migrate` | `site_migrator` Versioned DDL | Runtime Traffic、Backup、Replication |
| PostgreSQL Admin Bootstrap | one-shot role bootstrap | 建库与 Login Reconciliation | Web/Worker/Control Runtime |
| Backup PostgreSQL / pgBackRest | recovery process | Backup、WAL、Restore 所需权限 | Application Runtime、Translation |
| Asset S3 | Web asset gateway | 指定 Asset Bucket Read；确需写入时只限批准 Prefix | Backup Bucket、R2、Canonical Markdown |
| S3 Contract Test | Operator test process | 指定非生产 Bucket/Prefix CRUD | Production Asset/Backup Bucket |
| Backup S3 / R2 | recovery process | 各自 Bucket Backup Artifact Read/Write | Asset Bucket、Application DB |
| AI Provider | `content-worker` only | 指定 Provider/Model 与 Server-side Budget | Deploy Agent、GitHub Workflow、Public Browser |
| Deploy Registry Pull | `deploy-agent` only | 批准 Repository Digest Pull | Registry Push、DB、AI、GitHub Write |
| Operator Request-signing Key | Operator workstation / approved CI OIDC | Explicit Capability | DB、Host Root、Docker Socket |
| Alert Webhook | `observability-agent` only | 单一 HTTPS Alert Sink Publish | DB、Docker、Host Write、Application Secret |

`observability-agent` 只有 read-only Host/Control-state Mount、内部 Health Network 和可选 Alert Webhook；没有 PostgreSQL、S3、AI、Registry 或 Docker Credential。`deploy-agent` 没有 AI Credential；`content-worker`、`control-api` 和 Web 没有 Docker Socket。

## 通用轮换流程

1. 建立 Incident/Change Reference，解析精确 Credential、Consumer、Scope 和回滚 Owner。
2. 在 Provider 端创建同等或更小权限的新 Credential；不得扩大 Bucket、Repository、Database Role 或 Capability。
3. 更新 SOPS 加密字段，通过 Ansible 重新生成权限为 `0600` 的单一 Consumer Environment File。
4. 只重启/重建对应 Consumer。Blue/Green Web Credential 轮换时先更新 Inactive Slot，验证后切换，再更新另一 Slot。
5. 验证 Health/Readiness、授权成功、越权拒绝、Audit Continuity、Log/Response 无 Credential。
6. 撤销旧 Credential；再次验证，并记录 Provider-side Revocation Evidence 和完成时间。
7. 如果新 Credential 失败，在旧 Credential 尚未撤销的短重叠窗口回滚 SOPS 版本并重新 Provision；旧值撤销后不得通过恢复旧明文绕过 Provider Rotation。

数据库 Login 由 Version-controlled Bootstrap 以现有 Role Membership Reconcile；不得把 Login 改成 Superuser。age Recipient 轮换时先以新旧 Recipient 重加密并验证解密，再删除旧 Identity。Operator Signing Key 轮换先发布新 Public JWK/Capability，再切换客户端 Private Key，确认 Replay/Audit 后移除旧 Public Key。GitHub OIDC 不保存长期 Bearer Secret；Policy Claim 变化仍需独立 Review。

## 专项验证与失败处理

- Runtime/Migration：运行 Role Membership Gate；四个 Login 必须各只有一个批准 Group Role，且 `rolsuper=false`。
- Backup/WAL/R2：轮换后必须执行非破坏性 `check`、Manifest Read-back 和两副本 Freshness；不要把 Credential 成功当作可恢复证据。
- S3：先对非生产 Contract Prefix 运行完整 Contract；Production Asset Credential 只做代表性 Read，除非变更单明确授权写入。
- AI：先 `--dry-run`，再用明确的小 Budget 做非生产 Contract；Public Request 与 Content Push 仍不得调用 Provider。
- Deploy：用批准 Repository 的不存在 Digest Failure 和已知 Digest Pull 验证 Fail-closed；不得 Retag。
- Alert：发送 Disposable Test Event 并验证 Firing/Resolved；Payload 不含 Token、Header 或 Connection String。

Credential 泄露时按 `runbook.md#security-incident` 保留证据、撤销受影响值并检查 Audit。不要在 Chat、Commit、Issue、Log 或响应中粘贴明文。
