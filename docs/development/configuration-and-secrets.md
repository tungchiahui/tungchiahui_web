# 配置与 Secret

## 分类

### Environment-specific Configuration

示例：

```text
DATABASE_URL
ASSET_S3_ENDPOINT
ASSET_S3_BUCKET
ASSET_CDN_BASE_URL
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
ops/production/compose.yaml
ops/production/ansible/inventory/production.yml
```

这些文件只包含 Variable Name 和安全的默认非 Secret 值。

### 本地

```text
.env.local
```

Gitignored。

### Production Secret

```text
ops/production/secrets/production.sops.yaml
```

使用 SOPS + age 加密；提交前必须以 `production.sops.yaml.example` 的结构创建真实密文，禁止提交对应明文。Ansible 在 Controller 解密并以 `no_log` 安装分 Service Runtime File，真实密钥值不经过 Build Argument。

Secret 在 Runtime/Deployment 时注入，不得通过 Docker Build Argument、Layer、Image Environment 或复制文件的方式 Bake 进 Production Image。需要文件形式 Secret 时，使用权限受限的明确 Runtime Mount/tmpfs，并确保不会进入 Image Layer 或一般 Log。

## Validation

所有 Runtime Configuration 统一通过 Typed Zod Schema 解析一次。

Invalid Configuration 必须在 Startup 时 Fail Fast，并给出安全 Error，指出缺失/非法变量，但不打印 Secret Value。

Phase 2 Local/Test Infrastructure 使用固定、公开、仅本机有效的 Dummy DB/S3 Credential；它们不是 Secret，也不能由 Production Credential 覆盖。Local/Test Parser 只允许 Loopback/Docker Service DNS、`tungchiahui-local-*`/`tungchiahui-test-*` Bucket 和专用 Control-state Directory，并固定使用 Fake Translation Provider。

Phase 12 Production Parser 必须显式获得 Operator Key 与 GitHub OIDC Policy；Production `content-worker` 禁止 Fake Translation Provider。数据库通过 SOPS Payload 为 `site_app_login`、`site_control_api_login`、`site_content_worker_login` 和 `site_migrator_login` 提供不同 Credential，并由一次性 Bootstrap 绑定到对应 NOLOGIN Least-privilege Group Role。不得让普通 Runtime Service 使用 PostgreSQL Bootstrap/Superuser Identity。

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

## S3-compatible Asset 与 Contract 配置

Application Asset、External Contract Test 和 Backup 必须使用不同 Namespace 与 Identity：

```text
ASSET_S3_*
S3_CONTRACT_*
BACKUP_S3_*
```

`S3_CONTRACT_*` 是 Operator 验收专用的 Provider-neutral 配置，可指向任意明确授权的 S3-compatible 非生产 Target；其中没有 Provider 类型或 Label，也不允许按实现名称选择分支。External Contract 只通过显式 `./site storage contract s3 --confirm S3-NON-PRODUCTION` 读取这些值，普通 Local/Test 和 Production Application Runtime 不读取它们，也不得把这组变量部署给 Production Application、`content-worker`、`control-api` 或 `deploy-agent`。当前 Production 选用 AList，因此 Phase 11 Verification Report 另外记录 AList 非生产实例的兼容证据，但该部署事实不进入通用 Storage Adapter。

Application 使用只读 Adapter/最小权限 Asset Identity。Contract Identity 只允许操作指定 Test Bucket，并只清理随机唯一 Prefix 下自己创建的 Object。Phase 13 使用 `BACKUP_S3_*` 作为主备份对象目标，使用 `BACKUP_R2_*` 作为独立异地目标，并为 pgBackRest Repository Cipher 与 Control-state age Key 使用单独 Secret。Runtime Validation 拒绝 Asset/Primary/R2 复用 Access Key 或相同 Target Identity；Production S3/R2 Endpoint 必须是 HTTPS。只有 `deploy-agent` 注入这组 Secret，Public App、`control-api` 和 `content-worker` 不获得它们。

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
ASSET_CDN_BASE_URL=https://cdn.tungchiahui.cn
PRODUCTION_ORIGIN_HOST=ddns.tungchiahui.cn
```

`ddns.tungchiahui.cn` 解析为 IPv4+IPv6 还是 IPv6-only，属于 DNS/DDNS Concern。

Local CLI Control 应指向 Public Site Control Namespace，而不是直接指向 Origin：

```text
https://www.tungchiahui.cn/api/ops/*
```

Phase 9 CLI 使用 `SITE_CONTROL_API_URL`；远程 Human Operator 通过 `SITE_OPERATOR_KEY_ID` 和仓库外 `SITE_OPERATOR_PRIVATE_KEY_PATH` 指向 Ed25519 JWK。Loopback Local/Test 使用固定测试签名，GitHub Actions 使用短期 OIDC。以上 Client 都不读取 Production Database 或 Translation Provider Secret。Production Provider Credential 只允许在 `content-worker` Runtime 注入；具体 Provider 尚未由 Accepted ADR 选定，不得为便利把 Vendor Key 加入 Workflow 或 Developer 默认环境。

## GitHub Actions Credential

在可行情况下，GitHub Actions 应优先使用短期 OIDC Credential 做 Production Control-plane Authentication。

不要在 Workflow 中存储生产环境的：

- Database Credential
- AI Translation API Key
- Host Root Credential

如果只是为了触发 Content Sync、Translation 或 Deployment Job。

`control-api`、`deploy-agent` 与 Control-state SQLite 使用各自最小权限身份。SQLite 目录是明确的 host-local Writable Volume；不得把 Production Database Credential 当作 `control-api` 启动或执行基础 Restore/Recovery 的必需配置。

Phase 14 的非 Secret Deployment Policy 必须显式提供 Backup Freshness Window、Stabilization Window、Blue/Green/Migration/OpenResty Container Name、Candidate/Public Probe URL 与代表性 Smoke Path/Query。Blue/Green Image 和 SHA 是分离的 Immutable Compose Input。`database-migrate.env` 只包含 `site_migrator_login` 直连内部 `postgres:5432` 的 `DATABASE_URL`；它与 Role-bootstrap Admin Credential 分离，也不经过 Transaction-pooling PgBouncer。动态 Active-slot Config 位于权限受限的专用目录，不进入 Secret 文件，也不允许 `content-worker` 写入。
