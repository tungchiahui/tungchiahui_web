# 本地开发

## 支持的入口

```bash
./site dev
```

这是正常的开发命令。

## Host Prerequisite

尽量减少 Host Prerequisite：

- Docker Engine / Docker Desktop compatible runtime
- Git
- Node.js `24.19.0`
- pnpm `11.23.0`

Docker CLI 必须指向本机 `unix://` 或 Windows `npipe://` Context。Phase 2 CLI 会拒绝 `ssh://`/`tcp://` Remote Docker Endpoint，避免把本地生命周期命令发往远程或生产主机。

在可行情况下，其他 Infrastructure Dependency 通过 Container 运行。

## 本地拓扑

```text
Next.js dev server     127.0.0.1:3000
        |
        +---- PgBouncer        127.0.0.1:16432
        |        |
        |        +---- PostgreSQL 18 + PGroonga  127.0.0.1:15432
        |
        +---- S3Mock Dev       127.0.0.1:19090

Local control-api      127.0.0.1:18080
        |
        +---- .local/control-state/control.db

Fake deploy-agent      127.0.0.1:18081
Local OpenResty        127.0.0.1:18443
Local content-worker   Docker network only
```

端口只绑定 Loopback，可通过 `.env.example` 中的 `SITE_*_PORT` 变量覆盖。容器内部连接只使用 `postgres`、`pgbouncer`、`s3mock`、`control-api` 等 Docker Service DNS，不使用 Container IP。

## `./site dev` 做什么

1. 校验所需 Developer Tool
2. 在安全时创建 Local Configuration
3. 启动 Development PostgreSQL
4. 启动 S3Mock
5. 等待 Health
6. 创建所需 Test/Dev Bucket State
7. 运行当前 DB Migration
8. 应用幂等的 Development Seed Data
9. 启动不具 Production Host/Docker 权限的 Local `control-api`、`content-worker` 与隔离的 Control-state SQLite
10. 启动 Next.js Dev Server 和按 Path 分流的 Local OpenResty
11. 报告 Endpoint 和 Service Status

Phase 3 已用真实 Drizzle Runner 和 Deterministic Seed 替换零 Migration Hook。每次 Start 直接连接 PostgreSQL 执行 Policy/Role/PGroonga/Migration Gate，再通过 transaction-mode PgBouncer 以 `site_content_worker` 权限 Seed 两个 Document、Translation/Job/Ingestion Fixture，以及空的 `tech_footprint`/`weight_loss` Development Dataset。重复 Start 不重复 Row，也不重置已有数据。

Phase 4 的 `control-api` 已是独立 TypeScript HTTP Service：Local Operator 使用签名 Fixture，Application Job/Owner Dataset 走 PostgreSQL，Infrastructure Operation/Replay/Audit 走 SQLite。Local OpenResty 把 `/api/ops/*` 直接送往该 Service，普通请求送往 Next.js。

Phase 5 的 `content-worker` 已实现 PostgreSQL Claim/Retry/Progress 和 GitHub 单向 Ingestion。普通 `./site dev` 不隐式访问外部 GitHub，因此 Polling 默认 Idle；Disposable Integration 使用同一 Worker/Repository 和本地只读 Snapshot 执行真实 Job。开发者只有在明确配置 `GITHUB_CONTENT_REPOSITORY` 并启用 Polling 后才读取外部 Repository；Public Repository 不需要 Token，Private Token 必须 Read-only。

Phase 6 的 Next.js Dev Server 提供真实 zh-CN Public Surface、`/api/health`、`/api/ready`、`/api/version` 和签名的内部 Revalidation Endpoint。S3Mock Start Hook 幂等写入 `/api/assets/fixtures/phase-6.svg` 使用的确定性对象；本地 Secret 只用于隔离环境。Content Worker 在 Polling 启用时必须同时配置 Revalidation Endpoint/Secret，失败交付通过 PostgreSQL Job Progress 重放。

## 隔离

本地开发不得要求：

- Production DB Password
- Production S3 Write Credential
- Production Translation Secret，除非正在显式测试该 Integration

默认 Local Configuration 必须降低意外访问 Production 的可能性。

## 本地数据

为了方便，Developer Data 可以在多次 `./site dev` 之间持久保存。

Automated Test Data 不得共享同一个 Database/Volume。

Local Control-state Directory 也必须与 Production 隔离。Local `control-api`/Fake Deploy Agent 不得挂载 Production Docker Socket、OpenResty Config 或 Recovery Directory。

## Reset

CLI 应提供一个显式的 Destructive Reset Command，例如：

```bash
./site dev reset --environment local --confirm RESET-LOCAL-DATA
```

Reset 先显示精确的 Environment、Compose Project、Volume 范围和 Control-state Directory。缺少 Environment 或固定 Confirmation Token 时命令以非零状态拒绝执行。

绝不能把 Destructive Reset Behavior 隐藏在普通 `dev` Start 中。

## 本地后台任务

开发 Content/Translation Job 行为时，`./site dev` 还应支持本地等效的 `content-worker`。

Local Translation Test 默认使用 Fake/No-cost Provider。

普通本地开发不需要 Production Paid AI Credential。

Translation Provider 固定为 Deterministic Fake Provider，Cost 永远为 `0`。Fake Deploy Agent 只有 Health Capability，不挂载 Docker Socket、OpenResty 或 Production Recovery Directory，也不能执行真实部署。`control-api`、`content-worker` 与 Fake Deploy Agent 均使用 Read-only Root Filesystem、`no-new-privileges`、Drop-all Capability 且无 Docker Socket。

## Stop 与测试隔离

```bash
./site dev stop
./site test
```

`dev stop` 删除容器和 Network，但保留 Development PostgreSQL/S3Mock/Next Cache Volume 与 `.local/control-state`。普通 `dev` Start 从不隐式删除数据。

每次 `./site test` 使用唯一 Compose Project、动态 Loopback Port、Disposable Volume、独立 Bucket Namespace 和临时 Control-state Directory。无论测试成功还是失败，`finally` Cleanup 都会删除该 Project 的 Container、Network、Volume 和临时目录。
