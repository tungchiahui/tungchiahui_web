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
/etc/tungchiahui/.env
```

ADR 0022 后，生产 Secret 的手工 source of truth 是部署根目录的一份 Host-local 明文 `.env`。
真实文件必须在生产主机上由授权 Operator 创建，`root:root`、mode `0600`，不得提交到仓库、
不得放入 GitHub Actions、Docker Build Context、Image Layer、Public 目录或日志。该文件只供
Compose CLI 插值；每个容器只获得显式 Allowlist 中属于自身职责的配置。Owner 自行维护受控的
明文本地备份。

首次初始化可使用：

```bash
./site production secrets init --output /etc/tungchiahui/.env
```

该命令生成随机数据库、Revalidation、Repository Cipher、PgBouncer SCRAM 与 Ed25519 Operator
Credential，并拒绝覆盖既有 `.env` 或 Operator Private Key。填入 Asset S3、AList Primary Backup
S3、R2 Off-site Backup S3、GHCR 外部凭据和可选 `OWNER_PASSWORD_HASH` 后运行：

```bash
./site production secrets validate --env-file /etc/tungchiahui/.env
```

单 `.env` 使用分角色变量保存数据库连接：`WEB_DATABASE_URL`、`CONTROL_API_DATABASE_URL`、
`CONTENT_WORKER_DATABASE_URL`、`DATABASE_MIGRATE_URL` 和 `DATABASE_ADMIN_URL`。Compose 在各服务边界映射成该服务实际读取的 `DATABASE_URL`，避免因为单文件而让所有服务共用同一个 DB Login。

PgBouncer userlist 与 backup age identity 仍需要文件形态；`.env` 中保存
`PGBOUNCER_USERLIST_BASE64` 和 `BACKUP_AGE_IDENTITY_BASE64`，Ansible 在生产主机上解码到
`/etc/tungchiahui/secrets` 下的受限派生 runtime 文件。`deploy-agent` 在 Blue/Green 部署期间只用
自身显式获得的 Web Runtime Allowlist 创建候选 Web Slot；不得继承 Template Container 中的
未知或过期环境变量。修改主机 `.env` 后，应通过既有 provisioning/reconcile 重启受影响服务再
部署。Secret 在 Runtime/Deployment 时注入，不得通过 Docker Build Argument、Layer、Image
Environment 或复制文件的方式 Bake 进 Production Image。

## Validation

所有 Runtime Configuration 统一通过 Typed Zod Schema 解析一次。

Invalid Configuration 必须在 Startup 时 Fail Fast，并给出安全 Error，指出缺失/非法变量，但不打印 Secret Value。

Phase 2 Local/Test Infrastructure 使用固定、公开、仅本机有效的 Dummy DB/S3 Credential；它们不是 Secret，也不能由 Production Credential 覆盖。Local/Test Parser 只允许 Loopback/Docker Service DNS、`tungchiahui-local-*`/`tungchiahui-test-*` Bucket 和专用 Control-state Directory，并固定使用 Fake Translation Provider。

Production Parser 必须显式获得 Operator Key 与 GitHub OIDC Policy；Production `content-worker` 禁止 Fake Translation Provider。数据库通过 Host-local `.env` 为 `site_app_login`、`site_control_api_login`、`site_content_worker_login` 和 `site_migrator_login` 提供不同 Credential，并由一次性 Bootstrap 绑定到对应 NOLOGIN Least-privilege Group Role。不得让普通 Runtime Service 使用 PostgreSQL Bootstrap/Superuser Identity。

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

Application Asset、External Contract Test 和 Backup 必须使用明确 Namespace 与部署范围：

```text
ASSET_S3_*
S3_CONTRACT_*
BACKUP_S3_*
BACKUP_OFFSITE_S3_*
BACKUP_REPLICATION_CONCURRENCY
```

`S3_CONTRACT_*` 是 Operator 验收专用的 Provider-neutral 配置，可指向任意明确授权的 S3-compatible 非生产 Target；其中没有 Provider 类型或 Label，也不允许按实现名称选择分支。External Contract 只通过显式 `./site storage contract s3 --confirm S3-NON-PRODUCTION` 读取这些值，普通 Local/Test 和 Production Application Runtime 不读取它们，也不得把这组变量部署给 Production Application、`content-worker`、`control-api` 或 `deploy-agent`。当前 Production 选用 AList，因此 Phase 11 Verification Report 另外记录 AList 非生产实例的兼容证据，但该部署事实不进入通用 Storage Adapter。

Application 使用只读 Adapter；Contract Identity 只允许操作指定 Test Bucket，并只清理随机唯一 Prefix 下自己创建的 Object。ADR 0018 使用 `BACKUP_S3_*` AList Primary 与 `BACKUP_OFFSITE_S3_*` R2 Off-site 两组 Recovery 配置，并为 pgBackRest Repository Cipher 与 Control-state age Key 使用单独 Secret。Production 的 `BACKUP_S3_*` 与 `ASSET_S3_*` 指向同一 AList Bucket/Pair，Recovery Engine 只写固定 `backups/`，Public Asset Gateway 对该 Prefix 和历史 Recovery Prefix 返回 404；R2 Access Key/Bucket 必须独立。Runtime Validation 拒绝 AList/R2 Credential 复用与 Production HTTP Endpoint。`BACKUP_REPLICATION_CONCURRENCY` 是 1–32 的非 Secret 有界并发配置，默认 8。单 `.env` 是 Host-level Source，但不进入容器；职责边界由 Compose 显式 Allowlist、不同数据库/S3/GHCR Credential、容器权限、网络和代码 Runtime Validation 共同维持。Public App 只使用 AList Asset 配置且代码接口只读；`content-worker` 仍没有 Docker Socket，`control-api` 仍不执行高权限 Host/Docker Action。

## 新服务器

Provisioning 必须使用以下内容重新构建 Production Environment File：

- Version-controlled Non-secret Config
- Owner 保存的 `/etc/tungchiahui/.env` 明文备份
- 需要恢复 Control-state/Backup Artifact 时使用的 Authorized age Private Key

不要把没有备份的服务器本地 `.env` 当作唯一副本；它必须有 Owner 管理的明文备份，但备份不得进入仓库或 GitHub Actions。

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

Deployment 的非 Secret Policy 必须显式提供 Backup Freshness Window、Blue/Green/Migration/OpenResty Container Name、Candidate/Public Probe URL 与代表性 Smoke Path/Query。ADR 0020 已取消固定 Deployment Stabilization Duration；Phase 18 的线上观察期只属于最终验收，不是运行时配置或发布拦截。Production 默认代表文章固定为 Phase 18 已审计的 `/blog/2026-09-02-wm-lun-wen-luo-lie`；Disposable Test 必须显式覆盖为其 Seed Route，不得让开发 Seed 成为 Production Smoke Contract。Blue/Green Image 和 SHA 是分离的 Immutable Compose Input。`database-migrate.env` 只包含 `site_migrator_login` 直连内部 `postgres:5432` 的 `DATABASE_URL`；它与 Role-bootstrap Admin Credential 分离，也不经过 Transaction-pooling PgBouncer。动态 Active-slot Config 位于权限受限的专用目录，不进入 Secret 文件，也不允许 `content-worker` 写入。
