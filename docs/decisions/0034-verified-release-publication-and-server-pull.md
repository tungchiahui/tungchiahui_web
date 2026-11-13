# ADR 0034 — 验证后发布与服务器主动拉取

- Status Accepted
- Date 2026-11-13
- Authorization Owner 审阅 Actions 简化方案后明确要求“执行”。
- Partially supersedes ADR 0027 的 main CI OIDC 投递与等待部署，以及 ADR 0032 的成功 Run 基线查询。

## 背景

生产发布曾在质量检查与服务器切换成功后，因 GitHub JWKS 获取或 CI 状态轮询失败而显示失败。
公开界面 Unit 存在 React Root 清理后的延迟回调，E2E 也受 Umami/Bing 外部请求影响。
Owner 要求借鉴 SDUTVINCI/sdutvinci_web 的服务器主动拉取方式，并保留现有审计和恢复能力。

## 决策

正常发布依次执行 main Push、分级 Quality Gates、不可变组件构建或复用、验证后发布元数据、
服务器主动拉取、现有完整 Blue-Green Engine、独立状态回报。Main Release 的成功表示质量
检查与不可变制品发布成功。GitHub Production Deployment 的成功表示服务器已有完整收敛回执。

Main Release 在 build 聚合成功后，以 GITHUB_TOKEN 的 deployments:write 创建版本化 GitHub
Deployment Payload，绑定 Web SHA/Digest、Service/Recovery Source SHA、Run ID 和自动执行意图。
发布器按相同 SHA 与完整 Payload 复用已有记录。未知写入结果通过下一次查询接续，已成功状态
保持成功。只读 GitHub 请求对网络、429 和 5xx 做三次有界重试，永久错误立即失败。

既有 systemd Host Coordinator 每分钟读取固定仓库的 main 与最近生产发布。复用已有 Registry
只读 Credential。仅接纳 github-actions[bot] 发布、SHA 自洽、明确自动执行、同一 main Push
Main Release 已 completed/success 的制品。若 main 已前进，只允许精确 GitHub Compare 证明
中间全为文档修改，比较截断、重命名来源含运行源码或未知路径均等待当前源码的新发布。

自动拉取默认为关闭。Operator 通过签名的 configure-release-pull Operation 显式启停，固定
Confirmation 为 RELEASE-PULL-PRODUCTION。启停与最近检查阶段通过签名 Status 可查询，持久化在 host-local SQLite 附加表，并留下
原 Operation/Audit。中断的配置任务由同一 Supervisor Fence 后接续。首次安装通过已授权
./site deploy 完成，再启用自动拉取。禁用后已存在的 Operation 继续按自身生命周期处理。

服务器以 github-publication:<id> 创建幂等的普通 Deploy Operation，使用 SQLite 全局排他、
Lease/Fence、原 Host Adapter、Digest/OCI Revision 验证、Migration、Blue-Green、Smoke 和回退。
存在部署、恢复、维护或 needs-attention Operation 时延后检查。进程重启后读取持久化开关和
同一 Idempotency Key。已确定失败的部署由 Operator 审阅后通过原入口重试。

独立 Production Deployment Status Workflow 使用 GITHUB_TOKEN deployments:write，每十五分钟、
Main Release 成功后或手动触发时读取固定公网只读回执。公开 GET /api/ops/releases/status
只投影已完整收敛、当前 Web/Host 一致、无 Pending 且 Executor 健康的版本身份，并支持精确
SHA/Digest 的 pending/completed/failed/cancelled 查询。响应包含公开版本元数据，不含 Operation
ID、Actor、Reason、主机配置、错误详情或业务数据。该路由经过参数验证、方法限制与既有
Rate Limit。特权控制继续要求原签名/Capability。回执查询只使用 host-local SQLite。

独立 Workflow 逐项核对 Web SHA/Digest 和 Service/Recovery SHA，再写入 GitHub Deployment
success/failure。网络暂时不可达保持 pending，由后续执行复验。人工回滚后按实际 Current
回执重新激活相应成功记录。检查/构建成功与生产失败分别显示，真实失败保留可见状态。

分级 Gate 和组件计划的基线改为最近由回执确认的成功 Deployment Payload。无可靠基线、
非祖先或未知路径继续完整 Gate。公开 UI 的明确测试允许清单补齐。数据库、权限、部署、
恢复、依赖和每日 CI 仍执行完整基础设施、恢复与迁移测试。

JWKS Client 按 URL 复用缓存。同一请求、同一 Issuer/Audience/JWKS 只验证一次签名，再匹配
各 Workflow Policy。远端验证不可用保留 503 类错误，认证失败与策略不匹配有独立分类。

外部内容测试夹具仅由隔离 Compose 的 test 模式 Preload 和 Playwright Context 加载，覆盖
Umami/Bing。应用入口继续验证真实生产配置。Reader Unit 显式卸载 React Root。

## 验收与运维

Unit 覆盖开关、Operator 边界、发布真实性、幂等、失败重试、并发排他、文档差异/重命名、
只读回执隐私与 JWKS 共享验证。完整 Foundation 通过发布夹具驱动真实 Registry Digest、
同一 Supervisor/Engine 蓝绿切换、匿名回执核对与回滚，并核对未变组件容器身份。

生产首次发布需先安装新 Host Coordinator，再授权启用开关，观察当前发布已确认。
状态回报延迟或 GitHub 不可达时，通过 ./site status 和原签名控制入口查询真实 Operation。
异常时可审计禁用拉取，并使用原 ./site deploy、rollback 或恢复入口。GitHub 主流程成功与
Production Deployment 状态均应纳入日常检查。镜像继续采用 GHCR，TCR 待实际网络对比后另行决策。
