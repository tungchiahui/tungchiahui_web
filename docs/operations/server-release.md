# 服务器执行完整发布（ADR 0027）

## 日常开发和发布

开发电脑只需 GitHub 权限及本地开发工具。换电脑后可 clone、开发、测试、push。
提交合并到 main 后，GitHub 执行完整 Quality Gates，构建不可变镜像，并通过 OIDC
调用现有 `https://www.tungchiahui.cn/api/ops/*`。服务器接续任务，开发电脑可以关机。
没有 Ansible、个人 SSH Alias、本地 sudo 或密码窗口参与日常发布。

Web 镜像同时绑定同一 SHA 的 Service 与 Recovery Digest。服务器先用目标 Recovery
镜像的一次性 deploy-agent worker 执行现有蓝绿 Engine，再收敛固定配置、独立服务和
定时器，重跑内部/公网 Smoke，验证候选执行代码能启动，最后提交完整发布结果。
`./site deploy ... --wait` 和 CI 都要求结果包含该 SHA/Digest 的 `hostRelease.status=converged`。

CI 等待响应失败后，服务器 Operation 可能已经完成。再次运行同一版本时，客户端先读取
Status；只有 Current SHA/Digest、有效 Previous Slot/SHA/Digest、健康的已安装 Executor、无 Pending/未完成 Operation
全部一致，才通过 `GET /api/ops/deployment-receipts/<SHA>/<Digest hex>` 取回 SQLite 中的
真实已完成 Deploy Record。该路由要求原 `infrastructure-operation:read` Capability、绑定
认证/Nonce，并校验完整发布结果。随后匿名检查公网 Version/Health/Ready，并再次检查
Status 未变化，才确认成功。没有记录、版本/执行器不一致、未完成 Operation 或检查失败
均不能确认成功；正在收敛的同版本不会创建重复任务。

此路径只确认同一个 Deployment Engine 的既有结果，保留原失败记录与 Previous Slot，
不重新执行部署、变更权限、改写状态或把 bare Current SHA 当作完成。原引擎仍拒绝直接
重复部署已 Active 的版本。公开检查复用已有三次有界网络重试，且不发送控制面认证头。

Control API 自升级会暂时断开状态查询。每个 GET 仍执行原三次有界连接重试；耗尽后的
已分类瞬时网络/5xx 错误允许等待循环在原总 Deadline 内重新查询同一 Operation，
不创建另一个部署。鉴权/权限拒绝、无效响应和任务 failed/cancelled/needs-attention
仍立即失败，总等待期限保持不变。基础设施演练使用同样的错误分类恢复查询。

系统组件：

- `control-api`：原有认证、授权、幂等与 Operation HTTP，不持有 Docker Socket。
- `tungchiahui-host-release.service`：服务器上的 deploy-agent Host Adapter，领取 Deploy/Rollback。
- 一次性 deploy-agent worker：复用 Compose 的受限身份、挂载、环境与现有蓝绿 Engine。
- 常驻容器 deploy-agent：继续 Backup/Restore/Retention；生产容器关闭 Deployment Polling。
- content-worker：原有内容工作，不增加 Host/Docker 权限。

主机执行器不提供 HTTP 或任意 Shell 接口。只允许固定服务、固定配置与已验证镜像。
所有敏感输入仍来自服务器 `/etc/tungchiahui/.env`，root:root/0600；不进入 CI 或镜像。

## 首次接入现有服务器

这是一次服务器管理员动作。Docker/Compose、systemd 和现有生产拓扑必须可用；
安装入口验证它们，不替换当前 Docker 软件源或升级 PostgreSQL。
先在 main 发布新镜像，暂时关闭 `PRODUCTION_DEPLOYMENT_ENABLED` 以阻止旧部署服务领取任务。
完整 Quality 与镜像必须成功；停用部署期间最终发布结果应为失败/未完成。

记录并审核该 SHA 的 Web/Service/Recovery Digest。确认没有正在执行的 Infrastructure
Operation、生产备份可恢复、两 Web Slot 和 PostgreSQL 的原始身份已保存。
网络较慢的首次冷启动，应先在服务器使用其 Registry Read 身份预拉取上述三个精确
Repository/Digest，再执行 Bootstrap；不得把开发机上的镜像或凭据当作正常发布依赖。
下载过程中不要把尚未输出进度误判为死锁。Bootstrap 被中断后，先核对原 Operation、
存活进程和持久 Checkpoint；确认进程已退出后按服务器控制台审计流程 Fence 原 Lease，
再由同一入口 Reconcile/Requeue，保留中断与失败记录。
在服务器管理员控制台执行：

```bash
./site production bootstrap --sha <40位SHA> --web-digest sha256:<64位Digest>
```

服务器上的仓库入口需要本项目锁定的 Node/pnpm。也可使用已验证 Recovery Image 的
`/app/host/node`（Debian 主机二进制）和 `/app/host/host-bootstrap.cjs`，把它们提取到服务器
root-only 临时目录后调用：

```text
<server-temp>/node <server-temp>/host-bootstrap.cjs <SHA> <WebDigest>
```

提取只创建停止的镜像容器并复制固定文件，不运行特权容器或挂载宿主根目录。
首次读取私有镜像所需的 Registry Read 身份必须在服务器配置，不进入开发电脑或 Actions。
初始化保持现有 Web Slot、PostgreSQL Image、`.env` 和数据；安装固定 systemd Unit，
保留现有两个 Timer 的启用状态，并切换独立服务到审核的镜像。
完成后检查 `./site status` 中 hostExecutor.installed/healthy，以及四个独立服务的健康与 SHA。
连续运行两次应无配置/服务变更。

恢复 `PRODUCTION_DEPLOYMENT_ENABLED=true`，重新执行新版本 Deploy Job。首次完整自动发布
必须验证 Web 和四个独立服务、原 PostgreSQL 容器、定时器与 `hostRelease` 结果。
之后正常发布不需要重复安装或服务器密码。

## 自更新与维护范围

每次发布替换 deploy-agent 容器和执行工作的 Host Coordinator。稳定 Supervisor 是已安装
Bootstrap Protocol 1；它从 SQLite 的当前 Generation 启动工作代码，升级工作代码不会终止
正在执行的发布。Bootstrap Protocol/systemd 沙箱或操作系统依赖升级属于服务器控制台维护。

镜像仓库认证与 Manifest 获取可能暂时没有进度数据。Host Artifact Pull 使用独立的
120 秒静默等待窗口，并以 10 分钟总时限终止持续无结果的拉取；普通 Docker 操作仍使用
原 30 秒窗口。等待时限不影响镜像 SHA/Digest 校验、Health/Readiness、Smoke 或 Cutover
门禁。获取失败发生在持久 Convergence Checkpoint 之前时，Operation 明确为
`host-release-rejected`，生产运行版本保持可用，可通过同一 Control Plane 重试。

普通 main 发布保持当前 PostgreSQL Image。改变 PostgreSQL/pgBackRest 的宿主挂载配置需要
明确的服务器维护与 Recovery Validation，普通发布会拒绝此类变更。数据库 Expand Migration
仍走原有 Fresh Backup、Blue/Green Compatibility 与 Migration Policy 门禁。
Secret/数据库身份轮换也应按生产配置维护流程执行，不能当作普通代码更新隐式完成。

## 中断、回退和恢复

Core SQLite Schema 8 保持兼容；同一 Control-state DB 的 Host Component Journal 1 记录
Generation、Previous/Pending、快照与收敛阶段。已有一致快照、age 加密异地复制和 Restore
Drill 同样覆盖这些表；没有引入新的业务持久化或第二个 Deployment Engine。

服务器 Supervisor 持有 30 秒租约并持续续租。新实例接管时先 Fence 旧 Operation，再终止
固定名称的残留一次性任务，按持久 Phase 接续。Deploy 与 Recovery 的 claim 在同一事务中
互斥。候选启动或收敛失败时用保留 Web Slot 回退并恢复非敏感配置和独立服务，不撤销
Expand Migration、不覆盖 `.env`、不删除数据库或备份。

`host-release-recovery-required` 表示自动回退未通过，必须在服务器控制台检查原 Operation
与审计，保留现场和证据。禁止删除失败记录或编造可恢复备份。公网控制不可达时依旧使用
授权的服务器控制台调用同一恢复 Engine，现有 Break-glass 审计要求保持有效。

### 受控 Host Release 恢复

当原 Operation 为 `failed` / `host-release-recovery-required` 且持久 Checkpoint 为
`compensating` 或 `reverted` 时，使用仓库内的服务器控制台入口
`host-recovery.cjs`。它不修改原 Operation、原 Checkpoint phase、数据库 Migration 或
Blue/Green Slot，而是创建一个新的、排他的 `server-migration` Operation
（`action=host-release-recovery`）记录受控恢复：

1. 校验原 Operation 的失败状态、Checkpoint 阶段、Active Web SHA/Digest、Host
   Runtime Current/Previous/Pending 与 Checkpoint 完全一致；任一漂移即拒绝。
2. 如 Web 仍在失败目标上，调用同一个 Deployment Engine 的合成 Rollback 回到
   Checkpoint 的 Active Slot；不手工切换 Blue/Green。
3. 用 Checkpoint 的固定文件与镜像重新收敛 Host，但显式关闭 Migration：
   `applyMigrations=false`。目标 Release 的 Expand Migration 已记录在
   PostgreSQL，恢复旧镜像时不得重放其较短的 Journal。
4. 若 PgBouncer/OpenResty 进程启动时间早于其配置文件最后替换时间，则强制 Rebind，
   确保运行中的进程确实加载了恢复后的配置；否则不无谓重启连接池或代理。
5. 复核固定 Convergence 字段、服务健康、配置文件与进程代际，并调用同一个
   Release Job 的 `verify` Smoke。
6. 追加 `host_release_recovery_verified` 审计事件到原 Operation，并以
   `host-release-recovered` 完成恢复 Operation；原失败记录与 Checkpoint 保留为审计证据。

恢复使用当前已审核的 Provision 代码，因此会在缺失时创建受管的
`${TUNGCHIAHUI_DATA_ROOT}/health-data` 目录（空目录，root:runtime-group，2750）。
这是下一次 S400 发布所需的固定挂载源，不是业务数据回滚；恢复结果通过
`preparedHealthDataDirectory` 如实记录。

服务器控制台执行（Recovery Image 必须是已通过 CI 的不可变 Digest）。先运行只读
`--check`，确认 `convergenceDifferences`、`topologyRebindPlan`、`webRollbackRequired`
与 `healthDataDirectoryPresent` 符合预期；该模式不初始化/Reconcile Control-state、
不创建 Operation、不写审计、不修改 Host：

```bash
sudo docker pull ghcr.io/tungchiahui/tungchiahui_web-recovery@sha256:<digest>
sudo docker create --name tungchiahui-recovery-artifact \
  ghcr.io/tungchiahui/tungchiahui_web-recovery@sha256:<digest>
sudo install -d -m 0700 /root/tungchiahui-host-recovery
sudo docker cp tungchiahui-recovery-artifact:/app/host/node /root/tungchiahui-host-recovery/node
sudo docker cp tungchiahui-recovery-artifact:/app/host/host-recovery.cjs \
  /root/tungchiahui-host-recovery/host-recovery.cjs
sudo docker rm tungchiahui-recovery-artifact
sudo /root/tungchiahui-host-recovery/node \
  /root/tungchiahui-host-recovery/host-recovery.cjs \
  <original-operation-id> /etc/tungchiahui/host-runtime/settings.json --check
```

确认后去掉 `--check` 执行受控恢复。恢复成功后，先只读核对恢复 Operation 结果、
原 Operation 审计、两个 Slot 与备份新鲜度，再通过正常工作流部署目标 main SHA。
恢复本身不会安装新的 Host Generation；新的 Coordinator 仍在下一次正常发布收敛成功后提交。

`./site status` 报告 Host Executor 的版本和租约健康。安装后租约失效会使 deploy-agent
健康检查降级；现有观测和健康检查能够发现执行器停止。


## 首次迁移的旧网页回退

首次 Bootstrap 在同一 SQLite 记录管理员审计过的原 Web SHA/Digest。该版本可能没有新的
Service/Recovery Manifest Label。回退至这个准确的保留 Slot 时，仍调用同一蓝绿 Engine，
保留已安装的独立控制/恢复服务与 Host Adapter，结果明确标记 `retained-web-restored`，不冒充
旧 SHA 的完整镜像集合已收敛。后续具有完整 Manifest 的版本仍执行整套服务与执行器回退。
这是首次迁移的兼容边界，不增加第二个蓝绿流程，也不撤销数据库 Expand Migration。

## 发布失败诊断（兼容旧版 Host Coordinator）

当 GitHub Actions 只显示 `Full release failed at web-engine` 时，可先检查服务器
`journalctl -u tungchiahui-host-release.service` 中的 `host_release_failed` 事件。
旧 Host Coordinator 可能在读取日志之前删除失败的容器。因此新候选版本
`release-job` 会在现有 Control-state SQLite `control_audit_events` 中追加
`release_job_diagnostic` 审计事件。仅有效的 Operation 租约持有者可追加，
保存脱敏错误类型、信息及阶段，不改变 Operation 状态或租约。
Host Coordinator 升级后也会在删除容器前解析结构化错误，忽略其余原始容器输出。

在服务器控制台只读查看失败 Operation（以下使用默认 dataRoot，需安装 sqlite3）：

```bash
sudo sqlite3 -readonly /var/lib/tungchiahui/control-state/control.db \
  "SELECT created_at, details_json FROM control_audit_events \
   WHERE operation_id = '<operation-uuid>' AND event_type = 'release_job_diagnostic' \
   ORDER BY event_id DESC LIMIT 3;"
```

如果没有此事件，可能是旧版一次性容器、启动前异常或诊断审计失败。
请依据实际诊断检查迁移兼容版本、备份、镜像、网络或 Smoke Test，
不要绕过数据库迁移和回滚门禁。

## 发布前源代码兼容性预检查

Main Release 的生产部署 Job 在调用 Deployment Engine 前，运行
`tools/deployment/release-preflight.ts`。它只读控制面当前 SHA，并使用 Git 中两版
Migration Journal 与镜像 Dockerfile 能力标记做保守兼容性筛查。

如果当前版本不支持待新增的 `0014_private_body_measurements`，Job 提前拒绝发布，
并提供 `416fb9501f70ba1da6dd7e482564eda20a0a5192` 的过渡发布方法。
该检查不会直接更改服务器状态。历史兼容 SHA 白名单仅用于验证已有审计的桥接发行版，
新版本使用镜像能力标记。

此检查依据 Git 历史预测版本兼容性，无法取代 PostgreSQL 实际迁移记录、可恢复备份
或 Deployment Engine 的最终门禁。高风险迁移仍需人工确认过渡版本已上线。

## 2026-11-12 Host Action 脱敏诊断

完整 S400 的 Operation `c6dee55b-ee63-4e7a-a14f-bc92ac7278c9` 在
`converge-services` 失败，自动补偿停在 `compensating`，状态仍为
`host-release-recovery-required`。蓝色隐私兼容版是记录中的 Active。

新 Host Coordinator 对 Compose 故障仅报告受控子命令、退出码、错误类别、
白名单服务名；不转发原始 stdout/stderr、命令参数或环境值。失败和补偿错误
分别追加 `host_release_execution_failed` 与 `host_release_compensation_failed`
审计事件。审计写入失败也单独记录脱敏告警。

只读查看新版本追加的诊断（旧已失败 Operation 不会自动生成该记录）：

```bash
sudo sqlite3 -readonly /var/lib/tungchiahui/control-state/control.db \
  "SELECT created_at,event_type,details_json FROM control_audit_events
   WHERE operation_id='c6dee55b-ee63-4e7a-a14f-bc92ac7278c9'
   AND event_type IN ('host_release_execution_failed','host_release_compensation_failed')
   ORDER BY event_id;"
```

**代码诊断修复不能自动恢复已经失败的生产 Operation。** 应先验证 Active Web、
实际数据库迁移、备份及现有配置，再由受控恢复机制根据持久 Checkpoint 恢复。
禁止直接修改 SQLite phase、强制切换 Green、跳过健康检查或盲目重跑发布。

### 避免无谓的依赖服务强制重建

旧实现把 `compose.yaml` 的任意变化当成 `--force-recreate pgbouncer/openresty` 的理由，
包括仅针对 Content Worker 的 S400 挂载修改。这样可能中断正在使用 PgBouncer 的连接。
新实现仅在 `pgbouncer.ini` 或 `openresty.conf` 文件被原子替换时强制重建相应服务；
仅 Compose 变更仍调用 `docker compose up --wait`，由 Compose 根据每个服务自身
的配置差异决定是否重建，Health Gate 不变。

### 2026-11-12 生产只读诊断结论

- 失败目标 `269129479` 的 `compose.yaml` 为 `content-worker` 新增
  `${TUNGCHIAHUI_DATA_ROOT}/health-data` 只读 Bind（`create_host_path: false`），
  而当时运行的 `3fedee1b` Host Coordinator 尚未创建该目录。独立服务收敛在
  `content-worker` 挂载处失败；兼容版本身不需要该挂载。
- 旧实现因 `compose.yaml` 变化强制重建 PgBouncer/OpenResty。PgBouncer 停止导致
  Content Worker 连接中断（与 20:31:32 的 `Connection terminated unexpectedly` 一致）；
  OpenResty 于 20:31:39 载入目标配置。独立服务未被重建，仍运行兼容版镜像。
- 自动补偿的 Web Rollback 成功（12:31:47），随后 `restoreHostConvergence` 用
  `3fedee1b` 旧服务镜像再次运行 `database-migrate`。PostgreSQL 已由目标 Release 记录
  16 条 Migration，而旧镜像 Journal 只有 14 条；Runner 以
  `Migration journal mismatch` 拒绝，补偿停在 `compensating`（12:31:50 结束）。
- 补偿在失败前已把四份配置恢复为 Checkpoint 内容，因此磁盘文件 MATCH；但
  `openresty-topology.sha256` 仍是目标指纹，OpenResty 进程仍持有目标配置。
  `health-data` 不存在；独立服务与 Web 仍是兼容版镜像；数据库 16 条 Migration 已完成。
- 修复后补偿与恢复均不重放旧镜像 Migration；按进程启动时间与配置 mtime 检测过期
  运行配置并定向 Rebind；`host-recovery.cjs` 提供不修改原 Operation 的受控恢复。

### 2026-11-13 实际恢复与发布结果

- 只读 `--check`：`checkpointPhase=compensating`、`convergenceDifferences=[]`、
  `webRollbackRequired=false`、`topologyRebindPlan={openresty:true,pgbouncer:false}`、
  `healthDataDirectoryPresent=false`，与现场诊断完全一致。
- 受控恢复 Operation `9d0c08fc-65f1-4f93-bf28-45b19516999e` 以
  `host-release-recovered` 完成：`convergenceVerified=true`、
  `webRestoredByEngine=false`、`openresty` 已 Rebind、`pgbouncer` 未重建、
  `health-data` 已创建；原 Operation `c6dee55b...` 仍为
  `failed/host-release-recovery-required`，Checkpoint 仍为 `compensating`，
  仅追加 `host_release_recovery_verified` 审计。
- 合并提交 `b4132005798f66e5464f3c8adb4d5bbc52f7ccc4` 的 Main Release
  `43271881580` 全部 Job success。公网 `/api/version` 返回该 SHA、slot=green；
  Deployment Runtime current 同上、previous/last=`3fedee1b`、无 Pending；
  Host Executor current 同上、previous=`3fedee1b`；四个独立服务与 web-green 均为
  新 SHA，web-blue 保留 `3fedee1b`；PostgreSQL 镜像未变；`hostRelease.status=converged`。
- 数据库仍为 16 条 Migration；匿名 Health API 返回 401/403；content-worker 只读挂载
  `health-data` 且 `HEALTH_SYNC_ENABLED=false`；备份双副本 fresh，Timer 正常。
