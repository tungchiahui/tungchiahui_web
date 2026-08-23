# 安全策略

## 原则

生产系统遵循 Defense in Depth 和 Least Privilege。

安全要求属于架构的一部分，不得仅仅为了简化本地开发而移除。

## Secrets

禁止提交明文生产 Secret。

生产 Secret 使用 SOPS + age 加密，并且只在授权系统上解密。

不得把仅服务器使用的环境变量暴露到 Client Bundle。

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

## 依赖

核心 Runtime 和公开服务依赖的安全更新应优先处理。

自动更新工具应创建可 Review 的 PR，而不是静默修改生产环境。

## Incident Response

运维响应流程记录在 `docs/operations/runbook.md`。

发生 Incident 时，第一优先级是保留证据并恢复安全服务，而不是直接在生产环境进行高风险现场修改。

## Control-plane API

管理操作使用：

```text
https://www.tungchiahui.cn/api/ops/*
```

即使这个 Namespace 与公开网站共享 Hostname，也必须将其视为高权限控制面。

要求：

- 不允许 CDN Cache
- `Cache-Control: no-store`
- 严格认证
- Capability Authorization
- Rate Limit
- Replay/Idempotency Protection
- Structured Audit Logging
- 不返回包含 Secret 的响应

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
