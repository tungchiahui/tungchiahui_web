# ADR 0027：服务器执行完整发布与初始化，移除 Ansible

- Status: Accepted
- Date: 2026-10-04
- Authorization: Owner 明确要求取消 Ansible 和个人开发机依赖，并授权实施所讨论方案。
- Partially supersedes: ADR 0023 的手工 scoped reconciliation；ADR 0024 的 Ansible Bootstrap 职责。

## Decision

main CI 继续完整 Quality Gates、SHA/Digest Image Set 和 OIDC。生产执行仍通过现有
`/api/ops/*`、Infrastructure Operation、Control-state SQLite 和共享 Blue-green Engine。
把 Ansible 承担的固定服务器动作迁入 TypeScript Host Adapter；彻底移除项目 Ansible
Runtime、Playbook、Inventory、依赖和测试调用。开发机只需要 GitHub 权限及本地开发工具。

服务器 systemd 托管 deploy-agent 的 Host Release Executor。它不接受公网请求、任意命令、
任意写路径或未经验证的镜像。它只领取已授权的 Deploy/Rollback Operation，并校验 Web
Manifest 中同一 SHA 的 Service/Recovery Digest。每次发布使用该不可变 Recovery Image 的
一次性 deploy-agent worker 调用现有 Deployment Engine；不会创建第二个蓝绿实现。

稳定 Supervisor 使用 Bootstrap Protocol 1；每次发布升级 Host Coordinator 和 deploy-agent 容器。
Host Adapter 负责固定配置文件、受限目录/派生 Secret、固定服务、定时器和执行器升级。
仅它与 deploy-agent worker 获得部署所需 Host/Docker Capability；control-api/content-worker
权限不扩大。`.env` 仍仅在生产主机 root:root/0600 保存，不进入 CI 或发布制品。

固定拓扑与 Host 执行代码随 Recovery Image 发布。生产 PostgreSQL Image 不随普通 main
发布替换。Web Cutover、Migration Fresh Backup/Compatibility、Health/Smoke 等门禁保留。
发布完成必须同时证明 Web、必要独立服务、配置与执行器已收敛。重试/崩溃恢复保存 Phase、
Previous Generation、Lease/Fence 与审计；失败恢复配置/服务和保留的 Web Slot，不撤销 Expand
Migration，不覆盖 `.env` 或删除数据/备份。

Host Recovery Metadata 与版本化组件 Journal 使用同一 Control-state SQLite 内的附加表；
已有 Core Schema 8 的字段及语义保持兼容。这些附加表同样进入一致性快照及加密异地副本。
服务器上的 Supervisor 与更新 Worker 分离：候选 Worker 启动验证失败则回到已验证版本；
重启后可从持久状态继续。正常发布不请求本地 sudo/SSH Password。

首次接入现有生产拓扑使用服务器控制台上的版本化 Bootstrap CLI。新服务器先按恢复 Runbook
恢复生产拓扑与数据，再使用同一入口接入执行器。校验既有 Docker/Compose/systemd 系统依赖、
配置运行身份与 systemd Unit 仍需一次管理员权限；不依赖特定开发电脑。保留明确的服务器控制台
Break-glass 入口，调用同一个 Operation/Engine。Timer 原名称、启用状态与同日 Idempotency
保留。Bootstrap 连续执行两次，第二次必须无配置/服务变更。

## Verification / Recovery plan

隔离 Production-foundation 验证 Bootstrap Idempotency、全部服务升级、部署服务自升级、
候选启动失败回退、进程退出/重启接续、旧 Fence 拒绝、保持当前 Web 服务/数据、主机控制面
和 PostgreSQL 故障隔离；Recovery Drill 验证新增 Host Metadata 快照与恢复。保留完整
Unit/Integration/Migration/Build/Security/E2E/S3 Gate。只在全部验证完成后执行一次生产 Bootstrap，
随后从 GitHub 完成一次真实 main 发布，验收开发机离线不影响生产任务。


## 首次迁移的旧网页回退

首次 Bootstrap 在同一 SQLite 记录管理员审计过的原 Web SHA/Digest。该版本可能没有新的
Service/Recovery Manifest Label。回退至这个准确的保留 Slot 时，仍调用同一蓝绿 Engine，
保留已安装的独立控制/恢复服务与 Host Adapter，结果明确标记 `retained-web-restored`，不冒充
旧 SHA 的完整镜像集合已收敛。后续具有完整 Manifest 的版本仍执行整套服务与执行器回退。
这是首次迁移的兼容边界，不增加第二个蓝绿流程，也不撤销数据库 Expand Migration。
