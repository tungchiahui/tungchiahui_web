# 安全策略

## 原则

生产系统遵循 Defense in Depth 和 Least Privilege。

安全要求属于架构的一部分，不得仅仅为了简化本地开发而移除。

## Secrets

禁止提交明文生产 Secret。

生产 Secret 使用 SOPS + age 加密，并且只在授权系统上解密。

不得把仅服务器使用的环境变量暴露到 Client Bundle。

每类 Runtime、Migration、Backup、S3、AI、Deploy、Operator 与 Alert Credential 的唯一 Consumer、最小权限与轮换流程定义在 `docs/operations/credential-rotation.md`。不得用一个 Credential 跨越这些边界。

## 数据库

应用使用专门的最小权限 PostgreSQL Role 连接数据库。

Application Role 不得：

- 拥有数据库
- 成为 PostgreSQL Superuser
- 创建任意 Extension
- 管理 Replication
- 修改 Backup Configuration

Migration 和运维权限与应用 Runtime 权限分离。

## S3

以下用途使用独立 Credential：

- Application Asset Operation
- CI Contract Test
- Backup Operation

网站资源允许 Public Read，不代表允许 Public Write。

## HTTP

生产流量必须使用 HTTPS。

设置并验证适当的安全响应头，包括：

- 在 HTTPS 正确性确认后启用 HSTS
- Content-Security-Policy
- X-Content-Type-Options
- Referrer-Policy
- 适用时的 Permissions-Policy

## 输入校验

每个 Trust Boundary 都必须在运行时校验不可信输入。

在应用边界使用 Zod 或等效的已批准 Schema。

## Logging

绝不记录：

- Password
- Database Credential
- S3 Secret
- age Private Key
- Bearer Token
- 完整 Authorization Header
- 敏感 Cookie

Telemetry Field Name 必须 Fail-closed 拒绝上述类别；Error Text 仍需 Redaction。OpenResty Access Log 不记录 Query String、Client IP、Authorization、Cookie 或 Request Body。Request Correlation 使用随机 `x-request-id`。

## 依赖

核心 Runtime 和公开服务依赖的安全更新应优先处理。

Renovate 自动创建可 Review 的 Dependency Update PR，不得绕过 PR 直接修改 `main`。所有升级必须通过现有 CI Quality Gates，并同步维护 `pnpm-lock.yaml`。Core Major Update 默认不自动 Merge；Security Update 提高优先级；稳定版/LTS 优先，生产不默认跟踪 Beta/Canary。

## Container Hardening

Production Docker Image 必须使用 Multi-stage Build，并将 Runtime Stage 保持尽量 Minimal。Runtime Container 使用专用 Non-root User，不把 Secret Bake 进 Image，也不使用 `latest` 作为 Production Identity。

实际可行的 Service 使用 Read-only Root Filesystem。必须写入的数据只进入明确授权的 Writable Volume/tmpfs；不得为了一个写路径让整个 Container Filesystem 保持可写。Drop 不需要的 Linux Capability，并限制 Device、Network、Volume 与 Host Namespace Access。

`content-worker` 和 `control-api` 不得获得 Docker Socket 或 Unrestricted Host Shell。只有 `deploy-agent` 可以获得完成部署/恢复所需的最小 Docker/Host Permission；该权限需要单独身份、审计与受控 Command Surface。

## Incident Response

运维响应流程记录在 `docs/operations/runbook.md`。

发生 Incident 时，第一优先级是保留证据并恢复安全服务，而不是直接在生产环境进行高风险现场修改。

Phase 16 Security Gate 扫描 Source/Config、Client Bundle、Image Layer、Runtime Log 与 Response，并对 Production Dependency/SBOM/Image 执行 Critical Vulnerability 和 Secret Scan。Critical Finding 不得以风险接受的默认理由被跳过；任何例外必须由 Owner 明确批准并记录范围、期限与补救计划。

## Control-plane API

管理操作使用：

```text
https://www.tungchiahui.cn/api/ops/*
```

即使这个 Namespace 与公开网站共享 Hostname，也必须将其视为高权限控制面。

OpenResty 必须把 `/api/ops/*` 直接路由到独立 `control-api`，不得经过或依赖 Next.js Blue/Green Slot。`control-api` 不得成为新的万能 Root Service；高权限 Host/Docker Action 交给权限受限且可审计的 `deploy-agent`。

要求：

- 不允许 CDN Cache
- `Cache-Control: no-store`
- 严格认证
- Capability Authorization
- Rate Limit
- Replay/Idempotency Protection
- Structured Audit Logging
- 不返回包含 Secret 的响应

Deploy、Rollback、Restore 与 Recovery 的最小状态保存在 Production PostgreSQL 之外的 host-local SQLite Control-state Store。该文件只挂载到明确需要的 Control-plane Service，目录权限最小化；使用 Transaction、WAL、同步落盘、Lock/Lease 与 Append-oriented Audit Record。它不保存业务 Content/Translation/Search Data，也不是第二个业务数据库。

Break-glass Recovery 只允许经过明确授权的 Operator 通过稳定 Host/Inventory Identity 调用同一底层 Recovery Engine，并记录 Actor、Reason、Target、Result 和 Timestamp。不得把 Break-glass 设计成匿名 Endpoint、永久 Root Token 或绕过审计的任意 Shell。

## 站主浏览器登录

ADR 0021 允许 `/api/ops/owner/*` 使用独立的单站主密码会话，仅能编辑技术路线与减脂数据。
密码使用 scrypt 验证；随机会话 Token 只在 HttpOnly、SameSite=Strict、生产 Secure Cookie 中传递，
PostgreSQL 的隔离 `owner_auth` Schema 只保存摘要与 12 小时有效期。写请求检查同源 Origin，登录限流。
此 Cookie 不授予 Deploy、Restore、Translation 或其他 Operator Capability；既有签名/OIDC 认证不变。
生产未配置 `OWNER_PASSWORD_HASH` 时不开放登录。密码轮换与恢复后撤销要求见
`docs/operations/credential-rotation.md` 和 `docs/development/personal-trackers.md`。

## GitHub Actions 认证

优先使用 GitHub Actions OIDC 并严格校验 Claims，而不是使用权限宽泛的长期 Bearer Secret。

不得仅仅为了触发 Job，就允许 GitHub Actions 直接访问生产 PostgreSQL。

如果 Production Content Worker 可以持有 AI API Credential，则不要把生产 AI API Credential 放进 Translation Workflow。

## Operator CLI 认证

本地 `./site` CLI 不得要求 Production DB Credential。

使用经过批准的远程 Operator 认证机制，优先考虑非对称 Request Signing 或等效的短期 Credential 设计。

## Worker 权限分离

`content-worker` 和 `deploy-agent` 必须拥有不同的身份与权限。

Content Parsing/Translation 被攻破，不应自动意味着获得 Docker/OpenResty 管理权限。

## Public-IP Independence

不要围绕“家庭公网 IPv4 将长期稳定存在”建立安全 Allowlist 或认证假设。

源站可能变为 IPv6-only。

主要信任边界应建立在 Cryptographic Authentication 和稳定域名身份上，而不是“来自这个公网 IP，所以可信”。
