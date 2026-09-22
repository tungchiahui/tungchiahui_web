# ADR 0024：生产配置收敛检查与并行发布门

## Status

Accepted

## Context

ADR 0023 已定义单一 Host-local `.env` 和 Service Allowlist，但生产检查发现两个落地偏差：旧 Web
Slot 仍可能保留采用旧拓扑创建时注入的全量 Secret；Ansible Inventory 中的站点策略又会覆盖
`.env`，使“唯一人工配置源”只在文档上成立。发布流水线还把互相独立的质量门与镜像构建串行执行，
典型耗时超过二十分钟。

## Decision

`/etc/tungchiahui/.env` 同时是 Secret 与 Owner-managed Production Policy 的唯一人工 Source of
Truth。Ansible 只提供 Bootstrap、Host Fact、动态 Container Identity 和本次 Release Image/SHA，
不得再保存或覆盖 Polling、Probe、Rate Limit、Ingress Port、代表性 Smoke Path 等站点策略。

生产配置使用严格、拒绝未知键的 Zod Schema。`./site production doctor` 必须在不打印值的前提下
检查 `.env`/Compose/派生文件元数据、键集合、派生文件内容，以及所有运行容器是否越过 Compose
Allowlist 或仍持有旧值。启用本决策时必须一次性重建两个 Web Slot；只更新磁盘 Compose 不构成
Runtime 收敛证据。

生产配置的异地恢复副本必须使用与生产 Backup Identity 不同、保存在生产主机之外的 age
Recipient 加密。Export/Restore 都先校验完整配置，拒绝覆盖现有文件；Restore 输出固定为 mode
`0600`。普通 Repository、Actions Artifact 和生产 Image 不得持有该制品或解密 Identity。

`release.yml` 保留完整 Merge Gate，但将静态检查/Build、Unit、Production Infrastructure/Recovery、
Integration/E2E、Migration 分为并行 Job，并以稳定的 `quality-gate` Fail-closed 汇总。PostgreSQL、
Recovery、Service 镜像在质量门后并行使用 Buildx/GitHub Cache 构建；Web 镜像只依赖 Service
Digest，并继续作为 Release Manifest Anchor。四个 Digest 汇总后才允许 OIDC Blue/Green Deploy。
不得通过跳过 Gate、使用 `latest` 或改成服务器轮询来缩短耗时。

## Consequences

- 日常发布仍只有 `push main -> full gates -> immutable image set -> shared control plane`，但关键路径
  从所有工作串行缩短为最慢质量 Job加 Service/Web 两段构建。
- GitHub Hosted Runner 的冷启动、依赖安装与 Integration Gate 仍决定耗时；“固定五分钟”不是安全
  契约，需要更快时应另行决策自托管隔离 Runner，而不是弱化测试。
- `.env` 新增或删除键时，Schema、`.env.example`、Compose Allowlist、Doctor 与文档必须一起更新。
- 被旧拓扑污染的 Retained Slot 在完成一次性双槽重建前不得视为可安全回滚目标。
