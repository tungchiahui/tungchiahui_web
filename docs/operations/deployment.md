# 生产部署

## Deployment Identity

每个已部署 Application Image 都是 Immutable，并由 Git Commit SHA 标识。

Identity 示例：

```text
Git SHA: c904e21b...（完整 40 位）
Digest:  sha256:2c26b46b...（完整 64 位十六进制）
```

不得使用 `latest` 作为 Deployment 或 Rollback 的 Source of Truth。

## 入口

Web Application Repository 的正常 Production Trigger：

```text
push/merge to main
 -> CI Quality Gates
 -> build Git-SHA-tagged immutable image set
 -> POST /api/ops/deployments
```

Quality Gates 未全部通过时不得构建/发布 Production Candidate，也不得 Cutover。

首次上线使用 Repository Actions Variable `PRODUCTION_DEPLOYMENT_ENABLED` 作为显式 Activation
Gate。变量不存在或不等于 `true` 时，成功的 `main` Quality Run 仍发布完整 Immutable Image Set，
但 Deploy Job 必须保持 Skipped。只有 Production Environment Protection、Origin Provision、Control
API 与 Pre-cutover Gate 均通过后才设置为 `true`；该变量不能绕过 Quality Gate。

Human-triggered/Retry/指定版本：

```bash
SITE_DEPLOYMENT_IMAGE_DIGEST=sha256:<digest> ./site deploy
./site deploy <40-char-git-sha> --image-digest sha256:<digest> --reason <text>
```

GitHub Actions 和 `./site deploy` 向同一个独立 `control-api` 完成认证，执行相同 Policy，并调用同一个底层 Deployment Engine；不得维护 CI/Manual 两套实现。

Application Workflow 只接受成功的同仓库 `main` Quality run，或显式验证过成功 Quality run 且仍属于 `main` 历史的完整 SHA。Build Job 只持有 Repository Read 与 Package Write，并以同一完整 SHA 发布 Web、Service、Recovery、PostgreSQL 四个不可变镜像；Web Manifest Digest 继续作为 Blue/Green Deployment Identity。Deploy Job 只持有 Repository Read 与 OIDC，进入受保护的 `production` Environment，并由单一 non-cancelling Concurrency Group 序列化。Workflow 不持有 Production DB、AI Provider、Host Login、Origin Pull Credential 或 Docker Socket。

正常 Remote Operation 使用：

```text
https://www.tungchiahui.cn/api/ops/deployments
```

它不需要直接使用 Public IP 寻址，也不需要直接访问 Production DB。

## Control/Execution 分离

`control-api` 校验请求并在 host-local SQLite 创建 Durable Deployment Operation。该 State 不依赖 Production PostgreSQL。

## 共享主机入口

生产 Compose 只把 V2 OpenResty 发布为 `http://127.0.0.1:3100`。已有 1Panel OpenResty
负责 `ddns.tungchiahui.cn:8443` 的公网 TLS、HTTP 行为和证书，并静态反向代理到该回环入口。
外层配置不参与每次应用发布；原子 Blue/Green Cutover 仍由 V2 OpenResty 完成。

外层代理必须保留原始 `Host`，覆盖并传递可信的 `X-Forwarded-For` 与
`X-Forwarded-Proto`，且不得缓存 `/api/ops/*`。不得把外层代理直接指向 `web-blue`、
`web-green`、`control-api` 或任何容器 IP。

内部 `deploy-agent` 执行高权限 Deployment Action。

不得向 `content-worker` 或 `control-api` 授予 Docker Socket/Unrestricted Host Permission。只有 `deploy-agent` 获得完成声明操作所需的最小 Docker/OpenResty/Host Capability。

Phase 14 已在该边界上交付唯一 Shared Engine：Production Compose 中仍只有 `deploy-agent` 挂载 Docker Socket；Adapter 只执行声明的 Image/Container Inspect、Inactive/Migration Lifecycle、OpenResty Validate/HUP 与既有 Recovery Request。`control-api` 只写 SQLite 并快速返回，不执行 Docker 或 Migration。

## High-level Flow

```text
Git commit
   |
CI Quality Gates
   |
build immutable Git-SHA image set
   |
deployment operation
   |
deploy-agent preflight
   |
inactive slot start
   |
health/readiness/smoke
   |
OpenResty cutover
   |
post-cutover smoke
```

每个 Phase 在 Control-state SQLite 中持久化，至少记录 Active/Previous Slot、Current/Target SHA、Image Digest、Operation Status、Lock/Lease、Actor 与 Audit Event。Restart 后必须基于持久 Phase 安全 Resume、Rollback 或要求人工处置。

## Preflight

操作 Inactive Slot 前：

- Target Registry Manifest Digest 可从唯一批准 Repository 精确 Resolve/Pull
- Pulled `RepoDigest` 等于请求 Digest，OCI Revision Label 等于请求的完整 Git SHA
- Production Config Validation 通过
- Encrypted Secret 可以 Resolve
- 如果 Release/Phase 需要 Database，则其可达且 Required Migration State 已知
- Backup Policy 满足 Migration Risk 要求
- Active Slot 和 Rollback Target 已确认
- Disk Space 足够

Production PostgreSQL 不可用不得阻止 `control-api`、Deployment Operation State 或 `deploy-agent` 启动。依赖 Database Readiness/Migration 的普通 Application Release 可以安全停在 Preflight/Recovery Phase，但基础 Deploy/Rollback/Restore/Recovery Control 仍可执行和查询。

只有 `deploy-agent` 从运行时加密 Secret 获得 approved Registry 的 Package-read Identity。GitHub Actions 的短期 Package-write Token 不下发到 Origin；Registry 认证失败、404、Digest 或 SHA Label 不匹配都必须在 Candidate Mutation 前失败。Rollback 验证已运行的 Retained Container，不重新 Pull 或 Build。

## Deployment Failure

Traffic Cutover 前：

- 保持 Active Slot 不变
- 安全时拆除 Failed Inactive Candidate
- 报告 Failure
- 不切流

Traffic Cutover 后：

- 如果 Post-cutover Check 失败，并且 Schema 仍兼容 Rollback，立即切回 Previous Slot
- 保留 Evidence/Log 供诊断

## Application Deploy 与 Content Publish

Content Ingestion 不需要 Blue-Green Application Deployment。

Application Deployment 用于：

- Code
- UI
- Style
- Runtime Behavior
- API Behavior
- Schema-compatible Application Change

Content Push 和 Translation 是独立的 Durable Job Flow。

Content Repository 的 Markdown Push 只触发 Content Sync；它不得构建 Next.js Docker Image 或触发 Blue-Green Deployment。

## Docker Production Hardening

- Image 使用 Multi-stage Build，只把 Runtime 必需 Artifact 带入最终 Stage
- Runtime Image 尽量 Minimal，Container 使用专用 Non-root User
- Secret 在 Runtime 注入，不 Bake 进 Image/Layer
- Production Identity 只使用 Git SHA 与固定 Digest，不使用 `latest`
- 实际可行的 Service 使用 Read-only Root Filesystem
- 必要写路径使用精确的 Writable Volume/tmpfs；Control-state SQLite 使用专用 Host-local Volume
- Drop 不需要的 Linux Capability，不共享不必要的 Host Namespace/Device
- `deploy-agent` 的 Docker/Host Access 使用最小 Scope、独立身份和完整 Audit
