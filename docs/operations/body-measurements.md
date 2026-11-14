# S400 与统一身体测量

## 数据与权限

`app.body_measurements` 是实际测量的唯一运行时权威源，包含 UUID、TIMESTAMPTZ、日期精度、
来源、源记录键、16 项可空指标、独立备注、排除统计状态、原始导出 JSON、版本与创建/更新时间。
`health.plan_overrides` 保存全部旧目标区间，包括纯计划占位日期的自定义目标。
`health.legacy_snapshots` 保存原始旧 JSONB、旧 revision、SHA-256、迁移数量和时间。
`health.state` 保存全局导入版本和同步状态。原 `weight_loss` JSONB 保留并冻结写入。

公开页面仅展示标题、说明及站点登录入口。个人计划与实际测量均在 Owner 登录后展示。
当前账号的 `site_session` 通过独立 control-api 校验，只有 Owner
可以调用 `/api/ops/health/*`。全部新接口返回 `private, no-store`，写操作验证 Origin 和 JSON。
公共 `/api/personal-data/weight_loss` 固定拒绝读取。PostgreSQL RLS 同时阻止公共应用角色
读取旧 weight_loss 行。新表没有 site_app 授权。同步 Worker 只能读取、插入及更新 smartscale
来源，其 UPDATE 列权限排除备注、排除状态与来源身份。Owner 的逐条更新/删除检查 revision。
登录状态变更、退出和会话校验失败会清除页面健康数据，旧 sessionStorage 草稿也会清除。

## 私有身体数据看板（2026-11-14）

Owner 确认将个人计划改为私有。Root Layout 的公共 next-intl Payload 排除 `HealthPlan`，
公共 `Weight` Message 只保留通用标题、导航与说明。经过 Owner 校验的现有 Snapshot 接口
接收受验证的 `locale`，在同一个快照上附加目标配置与该语言的计划文案。页面不通过匿名
HTML/RSC 提供目标日期或饮食模板。退出、账号切换或验证失败会卸载全部私有看板及弹窗。

目标从 2026-06-11 的 98 kg 延续至 2026-08-14 的 90 kg。8 月 14 日至 10 月 25 日含首尾
维持 90 kg，10 月 26 日从 90 kg 重新起步，至 2027-01-10 为 80 kg。75 kg 保留为长期目标，
后续日期待定。这些是 Owner 指定的计划节点。新阶段从 8 月 14 日起优先于旧目标元数据，
更早的明确自定义目标继续应用。旧目标与自定义元数据保留在数据库及版本 1 JSON 中，
重复导入不会重新启用已经被新阶段替代的目标。计划配置由版本管理，无新增数据库迁移。

趋势默认展示最近 90 天的 14 天局部加权平滑，窗口可选 7/14/30 天。每个自然日先独立
求均值，再使用按日期距离的 tri-cube 权重做局部线性回归，拟合值限制在窗口有效样本范围内。
浅色点保留实测日均值，悬停、手机点按及键盘滑块同时标示平滑值与实测均值。原始散点、
每日平均及 7 个自然日的移动平均继续提供。日均与平滑模式按自然日查看，原始模式保留时间
精度。移动平均先计算日均，各有效日等权，空缺日期不补值，显示窗口之前的 6 天可参与计算。
平滑计算使用窗口前的有效记录，过滤到所选截止日期，切换开始日期不改变同一天的拟合值。

曲线采用有界单调三次 Hermite 控制点，相邻有效测量日之间存在缺测日时，连接段使用蓝色
虚线。短缺测和长缺测均采用同一连续曲线，实线/虚线交接共享控制斜率。估算值仅在图表
查看时由曲线计算，标记“缺测估算”及前后有效日期，无测量次数，不进入数据库、导出或
统计。最后一个测量日之后保持截至最后有效测量。空指标与排除记录按各指标独立判断缺测。
目标仅在计划期间绘制，默认横轴覆盖选定实际记录区间，完整计划开关可展开未来目标。

总览展示体重、体脂率、肌肉量、腰围、BMI、体水分率、内脏脂肪等级及基础代谢，共 8 张
指标卡，手机两列、大屏四列。各卡独立寻找最新有效值，展示各自日期及最近 30 个自然日内
首末日均差和平滑迷你趋势，全部指标区域继续提供完整指标查看。
概览的距阶段目标使用最近 7 个自然日内有效日均值，累计变化使用最新体重相对 98 kg 起点。
周/月回顾先求各指标每日平均，再等权汇总周期平均；周从北京日期的周一开始，月按自然月。
记录天数统计至少有一项有效指标的日期。只有相邻且均有体重的周期计算变化，空缺周期留空。
周变化图展示最近 12 周，日历展示当前周及此前 12 周。点击周期或日期联动趋势和历史筛选。

体重页复用既有专注页面策略隐藏悬浮播放器，周期跳转为顶部导航预留空间。
手动新增与编辑使用 Base UI Dialog。自动记录指标保持只读，备注和排除状态仍可编辑。
全部指标、饮食活动参考及 JSON 管理以可展开区域展示，JSON 预览、CAS 冲突及来源保护沿用
原接口。四语言与深色/移动界面随应用维护。回滚保持旧 JSON 交换及数据库结构兼容，旧版本
界面可能再次展示原公开静态计划，生产发布及回滚须确认本轮隐私展示要求。

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
