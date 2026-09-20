# ADR 0022：生产使用单一 Host-local 明文 Env 文件

## Status

Superseded by [ADR 0023](./0023-scoped-production-runtime-configuration.md)

## Context

生产部署已经进入 V2 Blue-Green 路径，但日常操作仍包含两类额外复杂度：GitHub PR 与 `main` 各跑一轮质量/发布 Action，以及 SOPS 文档在 Controller 侧解密后拆分多个 per-service env 文件。

Owner 明确选择保留 Blue-Green、不可变 SHA/Digest、独立 `control-api`、`deploy-agent` 权限分离和备份/恢复机制，但希望日常发布简化为：直接 push `main`，GitHub Actions 通过质量门后构建镜像并自动请求生产蓝绿部署；生产 Secret 不再由 GitHub Actions 或仓库持有，而是由生产部署根目录的一份 `.env` 管理。

## Decision

生产 Secret 的手工管理 source of truth 改为单一 Host-local 明文文件：

```text
/etc/tungchiahui/.env
```

该文件必须由 Owner/授权 Operator 在生产主机上创建，`root:root`，mode `0600`，不进入仓库、GitHub Actions、Docker Build Context、Image Layer、Public 目录或日志。Owner 接受同一生产主机上的运行服务可以看到同一 `.env` 中的其他服务 Secret，并接受自行维护明文本地备份。

Compose 仍以每个服务的最小权限运行身份启动。为了不把所有服务强制共用同名 `DATABASE_URL`，单一 `.env` 使用分角色变量：`WEB_DATABASE_URL`、`CONTROL_API_DATABASE_URL`、`CONTENT_WORKER_DATABASE_URL`、`DATABASE_MIGRATE_URL` 和 `DATABASE_ADMIN_URL`。Compose 在各服务边界把它们映射为该服务实际读取的 `DATABASE_URL`。Docker daemon 可读取主机 `0600` 文件作为 `env_file`；`deploy-agent` 在 Blue/Green 部署时使用自己启动时由 `env_file` 注入的生产 env 键来创建候选 Web Slot。修改主机 `.env` 后，必须通过既有 provisioning/reconcile 重启受影响服务，使新 env 进入对应进程。

PgBouncer userlist 与 backup age identity 仍需要文件形态。它们不再是手工维护的第二套 Secret；`.env` 保存 `PGBOUNCER_USERLIST_BASE64` 和 `BACKUP_AGE_IDENTITY_BASE64`，Ansible 只在目标主机上将其解码为 `/etc/tungchiahui/secrets` 下权限受限的派生 runtime 文件。

GitHub Actions 合并为一条 `release.yml`：仅 `main` push 和显式 `workflow_dispatch` 触发。该 workflow 顺序执行质量门、构建四个 Git-SHA-tagged immutable images、解析 Web manifest digest，并在 `PRODUCTION_DEPLOYMENT_ENABLED=true` 时通过 OIDC 调用同一个 `./site deploy ... --wait` 控制面。Workflow 不持有生产 `.env`、DB Secret、Host Credential、AI Key 或 Docker Socket。

`./site deploy <sha>` 在未显式传 `--image-digest` 且没有 `SITE_DEPLOYMENT_IMAGE_DIGEST` 时，会从批准的镜像仓库解析 digest；解析失败时要求 Operator 显式传入 digest。

## Consequences

- 日常发布路径变为 Owner 本地直接 push `main`，不再保留 PR-triggered Quality Gate 作为默认部署前步骤。
- SOPS/age 不再是生产 Secret 管理的强制源格式；仓库只保存 `.env.example` 变量结构和校验逻辑。
- 生产 `.env` 泄露的 blast radius 大于 per-service env 拆分；补偿控制是 host-local `0600`、不入仓库/Actions/Image/Public、日志脱敏、runtime validation、最小权限数据库角色和保留 Blue-Green/Recovery Gate。
- 新服务器恢复时，除版本化仓库、镜像和数据备份外，还需要 Owner 提供 `/etc/tungchiahui/.env` 明文备份。
- `content-worker` 仍不得获得 Docker Socket；`control-api` 仍不得直接执行高权限 Host/Docker Action；Blue-Green、pre/post smoke、rollback 与备份新鲜度策略不变。
