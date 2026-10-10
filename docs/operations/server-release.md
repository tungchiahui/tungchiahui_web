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

`./site status` 报告 Host Executor 的版本和租约健康。安装后租约失效会使 deploy-agent
健康检查降级；现有观测和健康检查能够发现执行器停止。


## 首次迁移的旧网页回退

首次 Bootstrap 在同一 SQLite 记录管理员审计过的原 Web SHA/Digest。该版本可能没有新的
Service/Recovery Manifest Label。回退至这个准确的保留 Slot 时，仍调用同一蓝绿 Engine，
保留已安装的独立控制/恢复服务与 Host Adapter，结果明确标记 `retained-web-restored`，不冒充
旧 SHA 的完整镜像集合已收敛。后续具有完整 Manifest 的版本仍执行整套服务与执行器回退。
这是首次迁移的兼容边界，不增加第二个蓝绿流程，也不撤销数据库 Expand Migration。
