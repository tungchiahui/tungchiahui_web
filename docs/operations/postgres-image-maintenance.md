# PostgreSQL 镜像安全维护

## 本轮范围与基线

本轮先处理 2026-11-13 实际运行镜像扫描中的系统库漏洞，保持 PostgreSQL 18.4、
PGroonga 4.0.8、pgBackRest 2.59.1、数据路径与 UID/GID 70/70。该选择缩小首次维护的
兼容性变量。PostgreSQL 引擎补丁与 PGroonga 版本升级另按下文继续安排。

| 对象 | 已验收身份 |
| --- | --- |
| Web/main | `3272b43da91a012fff36a98e2e54d17478dbc805` |
| 数据库 Source SHA | `93287c38f16bcbe70b1291b82b06e82b23e4ae95` |
| 数据库 Registry Digest | `sha256:a95122c0c897d7fb1fb19c3708ad7f6681d0cd1b80a87c08ab381ac8c8b9deff` |
| 数据库 Image ID | `sha256:b881eaeef51d0f43fdb052b8d90dc8ad84c53edcd13c4af7f2db5215b7e3a186` |
| 旧镜像归档 SHA-256 | `3cc24f34eed97da8602d3d6c6301531d195981055f38e9f4667e54807a90f82e` |

旧镜像已恢复到 GHCR，开发机受限副本位置见 `current-state.md`。首次扫描为 1 条 Critical、
34 条 High。已有 `96b0d7f7…` 候选 Digest `ef1388d9…` 在相同漏洞库下为 0 条 Critical、
33 条 High。因此本轮为 `postgres.Dockerfile` 固定各受影响运行库的修复版本，包括
Brotli、c-ares、Kerberos、OpenSSL、curl、libssh2、libuuid、libxslt、musl 和 zlib。
镜像使用固定 PGroonga Base Digest，最终制品仍须绑定提交 SHA、OCI Revision 与 Registry Digest。
PostgreSQL 与 Recovery 的 pgBackRest Build Stage 按官方构建依赖使用 `libpq-dev`。
Web/Service/Recovery 的依赖准备与既有测试镜像对齐，安装前复制相同 `tsconfig.json`，使相同
锁文件和供应链策略的依赖安装层可复用。完整 Backup/Restore 验证覆盖这些构建调整。

## 本地恢复兼容验证

扩展既有 `pnpm test:recovery`，通过可选精确来源镜像执行跨镜像验证。命令为

```sh
pnpm test:recovery \
  --source-postgres-image ghcr.io/tungchiahui/tungchiahui_web-postgres@sha256:a95122c0c897d7fb1fb19c3708ad7f6681d0cd1b80a87c08ab381ac8c8b9deff \
  --recovery-image ghcr.io/tungchiahui/tungchiahui_web-recovery@sha256:ff0e5dc4998ec3b3cbbeaed9d0f26580a544a22ea7096096efa606d17a73ac88
```

来源参数限定为本项目 PostgreSQL 仓库的完整 Digest。`--recovery-image` 限定本项目 Recovery
仓库的完整 Digest，用于复现实际已安装恢复工具的兼容性。省略该参数时构建当前源码的
Recovery 镜像。两种路径分别记录验收结果。候选数据库按当前工作树配方构建。
本机已有完整匹配 RepoDigest 的镜像可直接复用，缺失时拉取并再次核对 RepoDigest。
源码 Recovery 演练使用独立本地测试 Tag，支持与 Foundation 分别引用各自构建的恢复工具。
本地工作树制品的 OCI Revision 仅用于测试定位，正式维护应使用已提交配方产生的不可变制品。
测试创建独立数据目录、Socket、加密 Repository、Control-state、随机 Loopback 端口及
隔离 S3Mock，复用现有 Recovery Engine。测试结束清理本轮容器与临时目录。

演练顺序为

1. 旧镜像初始化完整 Drizzle Schema、开发合成数据及 Owner 身体测量测试数据。
2. 运行既有健康数据权限、并发幂等导入、备注保留、JSON 交换与失败重试契约。
3. 使用旧镜像创建 Full Backup，执行双副本完整验证和 Off-site-only Retry。
4. 干净停止数据库，将同一测试数据目录切换到候选，比较所有业务表及 Migration Journal
   的排序摘要，验证四 Locale 的 PGroonga 索引搜索和私有数据角色边界。
5. 候选写入合成标记，干净停止并切回旧镜像，确认标记与业务摘要保留，再切回候选。
6. 在候选下产生前后时间标记，执行 Differential、Incremental、WAL 及每日 Protection 重放。
7. 将旧 Full Generation 经原恢复流程恢复并由候选启动，核对业务摘要与时间边界。
8. 清空本轮 S3Mock Primary，验证无效 PITR 拒绝后可重试，并从 Off-site 完成有效 PITR。
9. 在旧镜像上启动候选期间生成备份所恢复的数据，再切回候选，核对搜索、权限和摘要。
10. 执行 `pg_amcheck`，恢复加密 Control-state，验证 Audit Digest 与 Host Generation。

摘要覆盖 `app`、`health`、`account_auth` 和 `drizzle` 的全部表，排除专门用于 PITR 时间边界
的两张测试标记表。输出只包含摘要和合成数据统计。PGroonga 通过真实索引查询验证，
`pg_amcheck` 的覆盖范围按 PostgreSQL 支持的关系类型记录。

本轮结果与制品身份在下方验收段落和 `current-state.md` 记录。

### 2026-11-13 本地跨镜像验收

实际候选 Image ID 为
`sha256:d947e9ad43cf34ef77944682d4e0a6021f838fdce1a04aa7011981a9921bd299`，
配方 SHA-256 为 `070e392967a9521e5de4b0d01fcf2d0cc2faa243d023df46b99303fafc11d8be`。
使用上述旧 PostgreSQL Digest 和当前生产 Recovery Digest，完整跨镜像矩阵于
2026-11-13 15:06（Asia/Hong_Kong）完成，结果为 pass。

实际版本为 PostgreSQL 18.4、PGroonga 4.0.8、pgBackRest 2.59.1。16 项 Migration Ledger、
业务表摘要、候选写入后的同目录回退、旧 Full→候选、候选备份/PITR→旧镜像、四语言
索引搜索、私有角色边界、`pg_amcheck` 支持的关系、Off-site Fallback、无效 PITR 后重试、
每日 Protection 幂等重放及 Control-state/Host Generation 审计恢复均通过。
本轮合成数据摘要为 `191f3c07219df8b33edb638eb37cf5ba83daad3614ea6bbd77f08456fe46b22c`。
Full/Diff/Incr 的双副本验证耗时约 16.4/26.5/43.9 秒，PITR 恢复并启动约 11.0 秒。
这些数值来自本地小型合成夹具。

Trivy 固定 Digest 为
`sha256:62b1e65e8869bc4b4c6aa4fa2b21595256c7c2f6018a9d9ad61caf87187c1969`，
漏洞库 UpdatedAt 为 `2026-11-13T00:58:46.183130125Z`。最终完整扫描命中 0 条 Critical、
0 条 High、4 条 Medium，Secret 为 0；CycloneDX SBOM 包含 156 个 Component。
余下四条为 Groonga 静态管理资源所含 `jquery-ui 1.12.1` 的
`CVE-2021-41182`、`CVE-2021-41183`、`CVE-2021-41184` 和 `CVE-2022-31160`。
后续结合 PGroonga/Groonga 官方制品更新处理这些资源。nghttp2 已固定为 `1.70.0-r0`。

开发机证据位于 `.local/postgres-maintenance/` 的 `recovery-compatible.log`、
`candidate-final-scan.json` 和 `candidate-final-sbom.json`。首次演练夹具修正了容器内源码
路径及搜索 SQL 的 `app, public` Search Path，最终运行使用修正后的完整工具。
当前源码 Recovery 构建完成后，再以该工具与实际旧数据库 Digest 重跑完整跨镜像矩阵，
15:51（Asia/Hong_Kong）通过。其 Image ID 为
`sha256:4f946f4c15bf7e0dce700d93cc4da4fe361bc0e75357f82423f94bdeb1e65b82`。
该轮业务摘要为 `49e1b319807e283ba91a9c13827a8ef4c6c9931e8a14454fa2fade6d2eabab3a`，
PITR 恢复并启动约 10.7 秒。最终默认 `test:recovery` 再次通过，PITR 约 10.9 秒。

完整 Foundation 通过 Bootstrap 幂等、蓝绿发布、整机发布/回滚、执行器重启/启动失败恢复、
六个服务身份不变的组件复用、PostgreSQL-down 控制/部署隔离、IPv4/IPv6、物理流复制与
迁机/提升/回退窗口、权限/日志泄漏/安全与负载、SBOM 和 Critical 扫描。最终报告
`status=pass`、`productionTraffic=false`。本地静态、类型、生产构建、安全边界、455 项 Unit、
16 项 Migration、完整应用 Integration/S3Mock 与 54 项 E2E 均通过。

重复 Foundation 曾因 `.RepoDigests[0]` 指向此前临时 Registry 而触发仓库身份拒绝。
夹具现按本轮精确仓库与完整 SHA-256 选择 PgBouncer 引用，回归测试覆盖多仓库、缺失
引用和非法 Digest。失败断言补充执行器与 Operation Audit 诊断。该修复后完整重跑通过。
最终证据为 `foundation-verified.log`、`recovery-current-final.log` 和
`recovery-default-verified.log`；演练容器、网络、卷与临时数据已由各 Gate 清理。

## 生产维护分步授权

Owner 要求每次 SSH、main 推送、Workflow 修改及生产操作事前逐项授权。历史授权为一次性。
本地演练完成后，每个阶段给出精确对象、预期写入、停止条件与结果，等待对应授权。

### 1. 只读预检

申请一轮指定 SSH，目标身份使用已批准 Host Alias 或 `ddns.tungchiahui.cn`。核对实际数据库
Image ID/RepoDigest、版本、健康、数据卷、可用空间、Drizzle Hash Ledger、角色与扩展版本、
PGroonga Collation/Locale、WAL 归档状态、双副本有效备份和 Active/Previous Slot。
检查 Host Executor、未完成 Operation、当前定时任务与健康同步开关。只输出必要统计与摘要。

该轮输出确定容量与维护时间估计。单实例 PostgreSQL 的替换需要短时数据库停机，
Web Blue/Green 仍共享该数据库。小型本地夹具的耗时仅作为演练记录。

### 2. 固化候选与恢复证据

在工作分支提交可 Review 的配方与测试。正式镜像通过完整 Gate 后产生，用准确的
Source SHA、Digest、OCI Revision 和包清单记录身份，并按相同 Trivy Digest 与漏洞库
扫描旧/新镜像，保存完整 JSON 和 SBOM。main 推送及其关联发布另行请求明确授权。
若需调整 Workflow，先提交具体 Diff 供 Owner 授权。

通过既有 `/api/ops/*` 和 SQLite Operation 创建新鲜 Full Backup，要求本地 check/verify、
AList Primary 与 R2 Off-site 全量读回成功，并保存 Control-state 与加密生产配置快照。
生产备份的隔离读回恢复演练需要独立授权，目标为一次性目录与容器。记录恢复代际、
源/目标镜像、Migration/业务摘要、PGroonga 查询、健康数据核对和耗时。

### 3. 数据库专用维护窗口

先根据已核实拓扑给出精确执行清单。将网站动态请求置于受控维护态，保留独立 Control API
与恢复状态查询。暂停并记录 Content/健康同步、备份和发布调度，等待正在运行任务结束，
核对数据库连接与事务已排空。维护使用既有 Host Adapter/deploy-agent 权限边界，
以同一 SQLite 排他租约和 Audit 保存旧/新 Digest、Phase、操作者与失败结果。

本地实现已增加 `server-migration` Target `postgres-image-upgrade`，通过同一 Host Coordinator、
SQLite 排他租约与审计执行定向维护。`provisionHost` 的普通 services 收敛继续捕获实际运行的
数据库引用。契约与边界见 [ADR 0033](../decisions/0033-audited-postgres-image-maintenance.md)。
生产调用前须先按单独授权发布这些服务、执行器与 OpenResty 配置，并核对安装版本。

候选先拉取到主机并验证身份。干净停止 PostgreSQL，确认退出，再保存受限的冷数据副本
与 Repository/配置引用。按渲染并验证的现有 Compose 拓扑只重建数据库服务，保持原数据
挂载、Socket、网络、只读根目录、能力限制和运行用户。切换记录同时保存下次 Host 收敛
会捕获的实际数据库引用。

验收数据库 ready、实际运行 Image ID/Digest、版本、Migration Hash、业务摘要、四 Locale
索引搜索、Owner/普通角色边界、PgBouncer 重连及站点健康。然后恢复原任务状态，验证一项
授权的可回读写入、WAL 新段归档及升级后 Full Backup 的双副本。最终确认 Active/Previous
Web Slot、Host Executor、定时器和 SQLite Audit 一致，并记录停机时间与恢复点。

### 4. 失败回退与恢复

候选启动或验证失败时保持维护态，保存日志摘要并干净停止候选。按本轮相同二进制版本
的回退证据，以旧精确 Digest 启动当前数据目录并重新验收。回退的安全状态按旧镜像扫描
结果记录，继续安排修复。

数据目录出现完整性问题时，保护现场，使用已验收的冷副本或同一 Recovery Engine 的
精确 Backup/PITR 恢复。恢复前向 Owner 说明目标时间点与该点之后的写入影响并取得授权。
数据库恢复后按既有规程使旧浏览器会话失效，验证身体测量源键、备注、空值、旧快照摘要、
计划与 JSON 重放幂等。恢复成功后再恢复业务任务。

## 后续引擎补丁与镜像退役

PostgreSQL 官方当前列出 18.7。引擎补丁维护应读取目标 Release Notes，确认可取得的
PGroonga 官方配套镜像及 Digest、扩展二进制、Groonga/ICU 版本、Collation Version 和索引
兼容性，再按本节矩阵重演。PGroonga 官方升级表列出 4.0.8→4.0.9→4.1.0 的兼容路径。
涉及扩展 SQL 更新、索引重建或 Collation Refresh 时，分别列入维护写入和回退方案。
PostgreSQL Minor Release 的存储兼容规则仍须结合扩展、Collation 和真实恢复验证使用。

旧 PostgreSQL Image 在 GHCR、本地主机和受限离线归档中保留，退役时逐个检查仍保留的
Recovery Generation 所需镜像。ADR 0032 的 PostgreSQL 清理保护继续生效。候选扫描结果、
生产运行扫描结果、升级后的新备份恢复结果分别记录。

- [PostgreSQL 版本政策](https://www.postgresql.org/support/versioning/)
- [PostgreSQL 数据目录升级规则](https://www.postgresql.org/docs/18/upgrading.html)
- [PGroonga 升级兼容表](https://pgroonga.github.io/upgrade/)
- [pgBackRest 恢复说明](https://pgbackrest.org/user-guide.html#restore)

## S400 后续接入顺序

数据库维护验收与恢复证据就绪后，按 `body-measurements.md` 提交下一轮精确接入清单。
现有已核实生产者 UID/GID 为 0/0，网站隔离目录为 root:10050/2750。
接入动作包括核对生产者精确镜像与当前配置，为 `/data/s400.json` 增加独立输出挂载、
设置文件 0640/组 10050、检查原有历史追加与刷新模式、私有 Dry Run 和 Mi Fitness 对账，
再按授权开启健康同步并定向收敛 content-worker。验收首次导入、重复零新增、后续新增、
人工备注保留、失败重试与 Owner 页面时间。每次连接与生产配置变更继续事先授权。


## 受审计入口与生产授权清单

本节命令中的占位值在指定只读预检和候选发布后填写，并随每次授权请求提供完整展开值。
生产源站使用 `ddns.tungchiahui.cn` 或已批准 Host Alias。控制路径沿用
`https://www.tungchiahui.cn/api/ops/*`。

### 入口契约

维护的恢复子任务采用专用 90 分钟 Host 命令上限，Supervisor 在执行期间续租并校验
Fence。生产约 276 MB、3,244 个对象的 Full 保护实际耗时约 36.5 分钟。两端只读复验并行，
每端使用配置的有界并发并读回全部对象。普通 Host 命令默认上限为 20 分钟。
备份遵循 AList 复制/验证 → R2 镜像/验证顺序。
Execute 绑定成功 Preflight 的同一 Immutable Generation 读回证据，并重新核对全部 Host
基线、Backup Identity 和新鲜度后进入维护。

```sh
./site postgres-image preflight \
  --old-digest <approved-old-sha256-digest> \
  --new-digest <approved-new-sha256-digest> \
  --candidate-sha <candidate-source-sha> \
  --backup-id <fresh-verified-full-backup-id> \
  --reason <approved-preflight-reason> \
  --idempotency-key <stable-preflight-key>

./site postgres-image execute \
  --old-digest <same-old-sha256-digest> \
  --new-digest <same-new-sha256-digest> \
  --candidate-sha <same-candidate-source-sha> \
  --backup-id <same-full-backup-id> \
  --preflight-operation <successful-preflight-uuid> \
  --restore-evidence-sha256 <approved-isolated-production-restore-report-sha256> \
  --confirm POSTGRES-IMAGE-UPGRADE-PRODUCTION \
  --reason <approved-maintenance-reason> \
  --idempotency-key <stable-execution-key>
```

CLI 返回可查询的 Operation ID。通过既有
`GET /api/ops/infrastructure-operations/<id>` 查询 Phase、Target、Result、失败摘要和租约。
相同 Actor、Target、Reason 与 Idempotency Key 返回同一 Operation。更换目标需使用新 Key。
执行中断由 Supervisor Fence 后接续同一 Operation；回退失败的 `recovery-required` 保持状态
等待明确恢复处理。

`restoreEvidenceSha256` 是 Owner/Operator 审阅的独立恢复报告引用。入口验证格式并在 Target
中持久记录该 SHA。报告需要绑定 Backup ID/Manifest、旧/新镜像、恢复目标、Ledger/业务摘要、
四语言搜索、权限和耗时；生产报告完成后才能填写真实值。自动预检另外完整读回两端备份对象。

预检会写 SQLite 审计、拉取缺失的精确镜像并运行临时版本检查容器，pgBackRest check
可能产生 WAL/归档检查活动。Execute 持久化拓扑、配置 Hash、Consumer/Timer 状态和完整
Active/Previous Web State。执行期间 `.env` 或拓扑变化会拒绝继续并保持受控恢复路径。

### 分步授权表

| 授权步骤 | 精确对象与预期操作 | 验收与停止条件 |
| --- | --- | --- |
| 指定只读 SSH | 指定 Host Alias，读取 PostgreSQL Image ID/Digest、数据卷、版本、空间、Ledger、角色、PGroonga/Collation、WAL/备份、Host Executor、Operation、Timer 与健康同步状态 | 实际旧 Digest 必须与保留证据一致，未完成 Operation 或拓扑差异先解释并处理 |
| main 发布 | 给出待审提交和完整 Diff，由既有 CI 构建/复用不可变组件并完成普通 Blue-Green 发布 | 验证实际 Control API、Recovery Image、Host Coordinator、Supervisor 与维护 Proxy 配置，确认数据库容器身份保持 |
| 新鲜恢复保护 | 单独授权 Full Backup、双副本读回、Control-state 和加密配置快照 | 两端完整 Hash 验证、WAL 与 Snapshot 均有效，任一失败即停止 |
| 生产真实备份隔离恢复 | 单独授权准确 Generation、临时目录/容器/网络、资源上限、旧/新目标镜像和本次清理范围 | 使用生产备份恢复合成矩阵对应检查，输出摘要，私有内容保持受限，形成经审阅报告和 SHA-256 |
| API Preflight | 绑定已发布候选 Source SHA/Digest、新鲜 Full Backup 和稳定 Key | 核对 OCI/二进制/扩展、双副本、空间、挂载、四语言搜索和权限，取得成功 Operation ID |
| 数据库切换 | 单独授权完整展开的 Execute 请求、恢复报告 SHA、维护时间预期、旧镜像回退与冷副本路径 | 动态入口维护、排空、干净停止、冷副本、候选启动、业务/权限/索引/amcheck/WAL、升级后 Full 双副本、PgBouncer/站点 Ready 均通过 |
| 失败恢复 | 同目录旧 Digest 回退属于该次切换清单；冷副本或 Backup/PITR 数据恢复再次申请精确恢复点和写入影响授权 | 回退验证失败保持维护态，使用下方显式交接，恢复验收与 Session Verifier 轮换后重新预检 |

每次 SSH、main 推送、Workflow 修改、生产操作均须在执行前得到对应授权。表格本身是审阅
清单。既有 Workflow 已具备相关组件构建路径，本轮源码变更集中在现有服务、CLI 和测试。

### 状态与现场证据

正常阶段依次为 `prepared`、`quiescing`、`drained`、`stopped`、`cold-copy-verified`、
`candidate-starting`、`candidate-verified`、`backup-verified`、`resuming` 和 `verified`。
失败补偿为 `rolling-back`、`rollback-verified` 或 `recovery-required`。

冷副本位于 `<dataRoot>/postgres-maintenance/<operation-id>/`，目录受 Host 管理员权限限制。
`data/` 保留原所有权/权限，`manifest.json` 记录逐文件 SHA-256；Result 记录 Manifest Hash。
文件和目录经 fsync，完成标记前的部分副本可按同一 Operation 重建，完成副本重试时完整读回。
冷副本的保留与退役在后续单独批准的精确清单内处理。

Result 保存原运行意图、配置 Hash、精确 Image ID、Backup Manifest、数据库/角色摘要、
冷副本 Hash、新 Full Backup 和开始时间。Audit 另存每阶段 Fence、实际运行 Digest、WAL
Restore Point LSN 与验证结果，停机时间可由阶段时间戳计算。既有 Control-state 指标和
未完成 Operation 告警可识别长期维护/needs-attention。Public 503 提供 Retry-After/no-store，
独立基础设施状态查询保留。普通 Owner/业务控制请求在直接访问 Control API 时也返回 503。

完整性检查在事务中临时加载 amcheck，调用支持的 Heap/B-tree 检查后回滚。
临时写入读回也在事务内回滚，WAL Restore Point 通过后续 pgBackRest/WAL 检查验证归档。
检查函数及覆盖范围遵循 [PostgreSQL 18 amcheck 文档](https://www.postgresql.org/docs/18/amcheck.html)。

### 修复可恢复故障后的补偿重试

主机可用性、配置或网络故障修复后，可单独授权补偿重试。该入口复用原 Operation，
保留原 Target/Reason 与全部失败 Audit，追加本次操作者、原因和稳定 Retry Key。
执行器重新领取后优先验证并恢复旧精确 Digest 和原 Consumer/Timer 状态。

```sh
./site postgres-image retry \
  --operation-id <held-maintenance-uuid> \
  --confirm POSTGRES-MAINTENANCE-RETRY \
  --reason <approved-compensation-reason> \
  --idempotency-key <stable-retry-key>
```

相同 Retry Key/Actor/Reason 返回同一 Operation 当前状态。尚未完成数据库排空的故障，
补偿会先重新排空并取得摘要，再以旧镜像验证。同一故障再次失败时继续保持维护态。
涉及冷副本或 Backup/PITR 的数据替换，使用下方独立 Restore 授权。

### 回退失败后的显式 Restore 交接

```sh
./site restore <approved-backup-id-or-time> \
  --environment production \
  --maintenance-operation <held-maintenance-uuid> \
  --confirm RESTORE-PRODUCTION \
  --reason <separately-approved-recovery-point-and-write-impact>
```

该请求要求 Operator 身份和准确的 `needs-attention/recovery-required` Operation。
同一 SQLite Transaction 保存交接 Audit，将原维护记录保留为 failed 并创建既有 Restore
Operation。原 Target、Result、阶段证据与失败 Audit 保留，维护标记继续存在。
Restore 使用同一 Recovery Engine、Replica/PITR 和确认策略。

恢复后保持业务入口关闭，按 `backup-and-recovery.md` 轮换 Owner Session Verifier，核对身体
测量、旧快照、计划、备注与 JSON 重放幂等，再创建新鲜 Full Backup 和恢复证据。
新预检/维护继承原 Consumer 与 Timer 的运行意图，并绑定当前实际容器与配置。
该轮验证成功或验证后的安全回退，才解除原维护保持状态。

正常公网控制路径不可用时，同一 Restore 支持既有显式 Break-glass 模式；调用所需 SSH
仍须单独授权。其请求同样携带 `--maintenance-operation`，并写入同一 SQLite Audit。

### 本地验收范围

Unit 覆盖闭合契约、CLI、Operator 权限、重复请求、租约排他、过期 Fence、预检漂移、
各阶段故障/接续、冷副本读回、回退失败保持、HTTP 维护关闭和显式 Restore 交接。
Foundation 使用一次性本地 Registry 和 S3Mock、真实 PostgreSQL/Compose/OpenResty，
验证预检身份保持、维护 503/控制状态可读、候选验证失败后的旧 Digest 回退、候选启动后
崩溃接续、原状态恢复、新 Full Backup 双副本、四语言索引、角色/业务摘要及冷副本。
隔离测试使用本地 Replica 配置调用同一 Recovery Helper，生产配置继续要求 HTTPS。

本轮运行日志位于开发机 `.local/postgres-maintenance/maintenance-*.log`。
完整 Gate 的最终状态在 `current-state.md` 顶部交接记录填写。


Foundation 支持 `pnpm test:infra --trivy-cache <verified-public-cache-root>`，将已校验官方 OCI
制品中的 `trivy/db/trivy.db` 与 Metadata 复制到本次隔离目录。Scanner 保留正常新鲜度判断、
Critical/Secret 失败条件和 SBOM；缓存 Metadata 的 DownloadedAt 记录实际校验下载时间。
本轮官方 Layer Digest 为 `sha256:fd406c50cad6892a16b258bef67be31ebfd4ddfb00da80ce869b461e73116d4f`，
DB SHA-256 为 `324ef75b4ba84ec45caf6e427bb3c7f57732beae1933afc6cbafd8fe1a85f441`，
UpdatedAt 为 `2026-11-13T07:00:07.938173847Z`。该路径用于下载中断后的可复现本地验收。

## 2026-11-13 生产执行前证据

Owner 已在本对话授权完成指定生产维护闭环，并随后授权 ADR 0034 发布流程改造。
改造完成后继续同一维护任务，S400 接入等待本阶段交接后的下一次授权。

正式候选为 `sha256:6ce616e9a4ae1efe73827051a517b2b7f59ad58affd59897f3e897f663e176ed`，
Source SHA `d6629b0cf4a3d791ee307bb363c4931de97e8b75`。使用上文官方 Trivy DB 的精确
制品扫描为 0 Critical、0 High、4 Medium、0 Secret，SBOM 156 个组件。相同漏洞库下旧
`a95122c0…` 为 1 Critical、72 High。此前 1/34 属于早期漏洞库。精确扫描报告位于受限
`.local/postgres-maintenance/production-candidate-exact-scan.json`，SHA-256 为
`f57175008b0f1d22de1039526c0719b1b6db2f0c6b5e4c87d1b16cd76b700418`。

真实 Full `20261113-112533F` 的 Generation 为
`20261113-112533F-4b959844-6901-4917-b023-5721e58300ab`，Manifest SHA-256 为
`cb7732667f5f90a7c63913c2950f8f120b4f632941730c952f40e86195769b42`。
本地 Repository 的 3,244 项对象逐项与真实 R2 代际 Manifest 校验。通过同一 Recovery
Engine 完成旧镜像恢复、新镜像恢复与同目录旧镜像回退，23 表和 16 项迁移一致，四语言
索引 52 个匹配与 amcheck 通过。有效报告 `production-real-restore-report.json` SHA-256 为
`f8e6a30c92c7a5e19895407832a241e848768b56c29534dd2f12a76a8c617ba7`，容器边界已核对。
缺少边界的早期报告已作废。额外的直接远端 R2 Fallback 恢复因读取缓慢主动停止。

Preflight `353efc72-22ca-4c89-9e87-5e3ceb596649` 触及旧 20 分钟子命令限制，已审计为失败。
`c79a6f65e` 使用维护恢复专用 90 分钟上限和并行双副本复验。正式 Execute 等待新的成功
Preflight ID，绑定上述有效恢复报告、仍在时效内的 Full 和精确旧/新 Digest。
