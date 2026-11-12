# S400 与统一身体测量

## 数据与权限

`app.body_measurements` 是实际测量的唯一运行时权威源，包含 UUID、TIMESTAMPTZ、日期精度、
来源、源记录键、16 项可空指标、独立备注、排除统计状态、原始导出 JSON、版本与创建/更新时间。
`health.plan_overrides` 保存全部旧目标区间，包括纯计划占位日期的自定义目标。
`health.legacy_snapshots` 保存原始旧 JSONB、旧 revision、SHA-256、迁移数量和时间。
`health.state` 保存全局导入版本和同步状态。原 `weight_loss` JSONB 保留并冻结写入。

公开页面只渲染静态计划。当前账号的 `site_session` 通过独立 control-api 校验，只有 Owner
可以调用 `/api/ops/health/*`。全部新接口返回 `private, no-store`，写操作验证 Origin 和 JSON。
公共 `/api/personal-data/weight_loss` 固定拒绝读取。PostgreSQL RLS 同时阻止公共应用角色
读取旧 weight_loss 行。新表没有 site_app 授权。同步 Worker 只能读取、插入及更新 smartscale
来源，其 UPDATE 列权限排除备注、排除状态与来源身份。Owner 的逐条更新/删除检查 revision。
登录状态变更、退出和会话校验失败会清除页面健康数据，旧 sessionStorage 草稿也会清除。

## 指标与时间

所有显示、日期筛选、日期精度输入及每日平均使用 `Asia/Shanghai`。旧日期显式转换为
`YYYY-MM-DDT00:00:00+08:00`，保留 `time_precision = date`。具有具体时间的记录为 datetime。
同日多次记录均保留。各指标独立忽略 NULL，排除记录不参与概览与趋势统计。

SmartScaleConnect 0.4.2 的 BodyWater 为百分比，ProteinMass 为 kg，Height 为 cm，
肌肉量、骨骼肌量及骨量为 kg，心率为 bpm，基础代谢按每日 kcal 展示。同步采用上游零值
表示缺失的契约并转为 NULL。手动输入的有效零值依指标范围处理。新增未知字段保留在
raw_payload，其中保存导出的记录，未导出的云端字段无法由网站恢复。

依据上游固定版本源码核对，生产激活时仍需将实际导出字段与 Mi Fitness 显示对账。

- [指标定义](https://github.com/AlexxIT/SmartScaleConnect/blob/v0.4.2/pkg/core/weight.go)
- [小米映射](https://github.com/AlexxIT/SmartScaleConnect/blob/v0.4.2/pkg/xiaomi/client.go)
- [文件写入行为](https://github.com/AlexxIT/SmartScaleConnect/blob/v0.4.2/internal/weights.go)

## 迁移与对账

正式 SQL 为 0014 和 0015，均为 Expand。部署迁移器在 SQL 完成后自动调用同一个 TypeScript
旧数据迁移函数。迁移事务锁定旧行，验证旧契约，保存完整快照，导入实际记录及目标元数据，
逐字段校验时间、数值、备注、空值并核对数量。事务失败保留旧 JSONB。日志仅含数量与摘要。
迁移标记在同一事务提交。重放检测该标记，保护随后编辑或删除过的迁移记录。

一次性工具打包在现有 Service Image 的 `dist/health-import.cjs`。在已授权、受限的本地或
服务器执行环境中，可使用以下命令。DATABASE_URL 的实际值只从受限配置注入。

```sh
node dist/health-import.cjs --migrate-legacy --dry-run
node dist/health-import.cjs --migrate-legacy
node dist/health-import.cjs --dry-run
node dist/health-import.cjs
```

前两项使用 migrator 身份，后两项使用现有非超级用户 content-worker 登录身份。
旧数据 Dry Run 在新表创建前也可执行，只读取旧行和生成数量/摘要报告。
生产真实迁移报告由正式发布产生，本地验证报告使用合成数据。

## 自动同步

导入执行器复用 content-worker，任务放入既有 `app.operational_jobs`，类型为 health_sync。
每五分钟一个幂等调度键，领取、租约、崩溃恢复及重试复用 ContentJobRepository。
文件或数据库异常由任务持久化重试。已有记录继续可读。蓝绿 Slot 无文件挂载和调度职责。
独立 content-worker 使用正常发布的 SHA/digest Service Image 收敛。

读文件时校验大小、两次内容及元数据稳定性，再进行 Zod 校验。整批事务提交，历史记录
只增加或更新对应来源，文件中消失的记录保留。较旧文件快照不会覆盖较新快照。
幂等键由固定 Owner 导入命名空间、设备 Source 和规范化具体时间生成；指标变化不改变键。
同一批中同键不同内容会拒绝整批。导出缺少设备身份时使用明确空组件，同时间冲突拒绝。
多用户文件必须设置精确 User 筛选；固定 Owner 命名空间让所选用户的显示名变化不改变身份。
用户选择匹配不到记录时失败，避免静默处理错误用户的数据。

上游 JSON 写入器按 Unix 秒去重，文件中已经被上游替换的同秒记录无法由网站恢复。
raw_payload 更新与 Owner 备注/排除状态分离。自动记录可备注或排除统计。
同步日志仅含事件、任务状态和数量。最近成功导入及源文件更新时间分别展示，上游小米云端
刷新状态仍由 SmartScaleConnect 负责。

## 一次性服务器接入

以下步骤需要 Owner 先决定由谁执行 SSH/1Panel 操作。代码发布默认禁用健康同步。
正常发布会由既有 Host Adapter 创建隔离目录并收敛 Worker 挂载。
默认部署根目录下的路径为 `/var/lib/tungchiahui/health-data`，它与 SmartScaleConnect
凭据目录分离。使用自定义 dataRoot 时，替换成对应的 `health-data` 子目录。

1. 在 1Panel 查看 SmartScaleConnect 的运行 UID，确认当前输出配置与定时刷新方式。
2. 为 SmartScaleConnect 增加单独目录挂载，将上述主机目录挂载为容器 `/data`。凭据仍使用原有挂载。
3. 保留原同步条目，将 JSON 输出改成 `to: json /data/s400.json`。保持原先的历史追加模式与刷新频率。
4. 目录 owner 使用实际写入 UID，group 为 10050，mode 为 2750。输出文件 group 为 10050，mode 为 0640。建议生产者 umask 为 0027。Host Adapter 保留既有目录 UID。
5. 为迁移首次完整历史，可将现有 s400.json 复制到隔离目录后设置上述权限，再由生产者按原方式刷新。保留旧文件供核对。
6. 先执行一次 JSON Dry Run，核对导出记录数、用户筛选、时区、单位及 Mi Fitness 数值。
7. 在 `/etc/tungchiahui/.env` 设置 `TUNGCHIAHUI_HEALTH_SYNC_ENABLED=true`。多用户导出另设 `TUNGCHIAHUI_HEALTH_SYNC_USER`。
8. 通过既有受审计的配置收敛入口重新收敛 content-worker。普通后续发布自动保持配置。
9. Owner 登录检查首次历史导入、最新时间、文件时间与来源。再次导入确认新增数为零。

挂载固定为只读 `/health-data`，仅 content-worker 获得它，create_host_path 为 false。
Next.js、control-api、deploy-agent 不挂载该目录。读取文件不需要 Docker Socket。
生产 JSON、备份 JSON、账号和 Token 均不进入仓库、公开资源或 CI Artifact。

## JSON 交换

正式格式带 format、schemaVersion、exportedAt、timeZone、完整测量和自定义计划。
文件由 Owner 浏览器下载。导入在服务端再次校验，先展示新增、更新、未变、冲突和计划
变更数量，再以快照 revision 确认整批事务。期间并发写入会返回 409，要求重新预览。
重复导入保留 UUID 和来源键。已存在自动记录的来源指标受到保护，只允许独立备注与排除
状态更新。缺失自动记录的恢复必须通过 raw_payload 重建并核验源键、时间与全部指标。
导入不执行全量替换或删除。旧 CSV 模块仅保留历史格式的离线兼容逻辑，正式页面采用 JSON。

## 回滚与恢复验证

先发布并验收隐私兼容版本 `416fb9501f70ba1da6dd7e482564eda20a0a5192`，再发布统一表版本。
0014 必须具有新鲜可恢复备份和兼容的 Active/Previous Release。部署策略与迁移器均执行
兼容检查，新版本 Web Image 带 health-data-versions=1 Label，回滚同样检查目标能力。

兼容版本通过 Owner 私有 `app.weight_loss_private_compat` 投影继续读取新表。兼容 UI 按日
展示代表记录，最多最近 256 个日期；统一表保留全部明细。完整功能版本逐条展示所有测量。
回滚保留新表、旧快照和同步数据，旧 JSONB 继续冻结。修复后前向发布恢复完整 UI。
冻结 JSONB 不作为回滚后的测量权威源。

PostgreSQL 既有物理备份、WAL/PITR 和恢复演练覆盖新表与受限快照。恢复验证应比较新表
数量、源键、原始旧快照摘要、目标区间、空值和采样字段，再重放同一 JSON 确认幂等。
数据库恢复后按现有账号恢复规程使旧会话失效。恢复到迁移前时间点后，用同一迁移器和
隔离 JSON 重新导入。旧数据及上游 JSON 的保留期限由 Owner 决定。

## 上线检查

- [ ] 隐私兼容版本已部署并通过匿名/Owner 检查
- [ ] 新鲜可恢复备份及回滚目标能力检查通过
- [ ] 旧数据迁移数量、字段与计划元数据对账通过
- [ ] 匿名 HTML/RSC、旧公开 API 和普通账号均无法读取健康数据
- [ ] 非 Owner 数据功能和技术路线页面回归通过
- [ ] 上游目录、写入 UID、只读挂载、权限和用户筛选已确认
- [ ] JSON 首次历史导入、重复导入和后续新增同步通过
- [ ] Owner 手动新增、编辑、删除和 JSON 预览/导入通过
- [ ] 同步失败重试、人工备注保留和蓝绿切换后持续同步通过
- [ ] 数据库恢复验证及会话失效处理留有证据
