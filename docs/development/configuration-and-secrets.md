# 配置与 Secret

## 分类

### Environment-specific Configuration

示例：

```text
DATABASE_URL
S3_ENDPOINT
S3_BUCKET
CDN_BASE_URL
SITE_BASE_URL
REVALIDATION_SECRET
TRANSLATION_API_KEY
```

这些值属于 Environment Configuration。

### Code-level Invariant

示例：

- Supported Locale Union
- Route-generation Algorithm
- Translation Segmentation Rule
- Content Type
- Cache-key Format

这些应属于 Typed Source Code，而不是 Stringly-typed Environment Variable。

## 文件

### Repository-safe

```text
.env.example
ops/env/production.env
```

这些文件只包含 Variable Name 和安全的默认非 Secret 值。

### 本地

```text
.env.local
```

Gitignored。

### Production Secret

```text
ops/secrets/production.env.sops
```

使用 SOPS + age 加密。

Secret 在 Runtime/Deployment 时注入，不得通过 Docker Build Argument、Layer、Image Environment 或复制文件的方式 Bake 进 Production Image。需要文件形式 Secret 时，使用权限受限的明确 Runtime Mount/tmpfs，并确保不会进入 Image Layer 或一般 Log。

## Validation

所有 Runtime Configuration 统一通过 Typed Zod Schema 解析一次。

Invalid Configuration 必须在 Startup 时 Fail Fast，并给出安全 Error，指出缺失/非法变量，但不打印 Secret Value。

Phase 2 Local/Test Infrastructure 使用固定、公开、仅本机有效的 Dummy DB/S3 Credential；它们不是 Secret，也不能由 Production Credential 覆盖。Local/Test Parser 只允许 Loopback/Docker Service DNS、`tungchiahui-local-*`/`tungchiahui-test-*` Bucket 和专用 Control-state Directory，并固定使用 Fake Translation Provider。

## Secret Lifecycle

Production Secret Change 应当是有意且可审计的。

为以下内容记录 Rotation Procedure：

- DB Application Credential
- DB Migration Credential
- S3 Credential
- Backup Credential
- Translation API Credential
- Deployment/Revalidation Secret
- age Recipient/Key

## 新服务器

Provisioning 必须使用以下内容重新构建 Production Environment File：

- Version-controlled Non-secret Config
- Encrypted Secret Material
- Authorized age Private Key

不要把旧服务器上手工编辑的 `.env` 当作 Configuration 的唯一副本。

## 基于域名的生产控制

正常 Configuration 中不得持久保存家庭公网数字 IP。

稳定名称：

```text
PUBLIC_SITE_URL=https://www.tungchiahui.cn
CDN_BASE_URL=https://cdn.tungchiahui.cn
PRODUCTION_ORIGIN_HOST=ddns.tungchiahui.cn
```

`ddns.tungchiahui.cn` 解析为 IPv4+IPv6 还是 IPv6-only，属于 DNS/DDNS Concern。

Local CLI Control 应指向 Public Site Control Namespace，而不是直接指向 Origin：

```text
https://www.tungchiahui.cn/api/ops/*
```

## GitHub Actions Credential

在可行情况下，GitHub Actions 应优先使用短期 OIDC Credential 做 Production Control-plane Authentication。

不要在 Workflow 中存储生产环境的：

- Database Credential
- AI Translation API Key
- Host Root Credential

如果只是为了触发 Content Sync、Translation 或 Deployment Job。

`control-api`、`deploy-agent` 与 Control-state SQLite 使用各自最小权限身份。SQLite 目录是明确的 host-local Writable Volume；不得把 Production Database Credential 当作 `control-api` 启动或执行基础 Restore/Recovery 的必需配置。
