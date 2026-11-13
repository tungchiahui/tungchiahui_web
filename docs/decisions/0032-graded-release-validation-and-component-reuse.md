# ADR 0032 — 分级发布验证与组件镜像复用

- Status: Accepted
- Date: 2026-11-13
- Authorization: Owner 明确授权分级检查、组件复用及相关 Workflow、架构文档和工程约束修改。
- Partially supersedes: ADR 0024 的每次完整质量检查与 ADR 0027 的全部组件同 SHA 要求。
- Partially supersedes: ADR 0025 的组件镜像清理，增加保留 Manifest 引用和长期固定数据库镜像保护。

## Decision

保留一个 Main Release、一个 Control Plane 和一个 Deployment Engine。根据实际 Git Diff
进行保守分类。仅文档修改执行文档/源码策略检查。明确列入允许清单的公开界面修改执行
静态/类型/构建、Unit 和完整应用 Integration/E2E。数据库、权限、私有界面、部署、恢复、
依赖及其他路径执行完整 Gate。未知分类、无可靠 Diff 和手动指定版本均执行完整 Gate。
现有只读权限验证 Workflow 每日对 main 执行完整 Foundation、Recovery 和 Migration。
开发检查与构建使用独立的可取消队列，新 push 可取代过时开发任务。生产部署保留单独
的不可取消互斥队列，正在执行的 Host Operation 继续由同一 Engine 完成。

Web SHA 继续标识一次完整发布。不可变 Web Manifest 同时绑定 Service/Recovery Digest
及各自 Source SHA。旧 Manifest 的组件 Source SHA 默认使用 Web SHA。所有组件继续
验证唯一批准仓库、精确 Digest 与对应 OCI Revision。

组件依赖来自实际打包依赖图和显式运行资源。已安装组件的全部输入相同时继续使用其
Source SHA，否则使用该集合最后变更提交。依赖锁、编译配置、
Dockerfile、迁移和拓扑也进入依赖集合。相同 Source SHA 的已发布组件通过 Digest 与
Revision 核验后复用。Service/Recovery 内容不变时，Compose 保持现有容器身份。

首次切换兼容旧 Host Coordinator。只读发布计划核对已安装 Executor，并从其精确 Git
提交检查组件 Manifest 能力。旧版、状态不可用或 Executor 存在 Pending 代际时，组件继续使用本次 Web SHA
构建。启用新能力并成功发布后，后续复用自动生效。无需新增生产配置开关。

正常前向部署的 Migration 由共享 Web Engine 执行一次。Host 收敛处理固定资源、服务与
执行代码。Bootstrap 继续创建其所需控制面 Schema。Rollback/补偿保留 Expand Migration。

## Safety and verification

权限、Origin/CSRF、Secret、数据库兼容性、备份、镜像身份、健康与切流 Smoke 保持原有边界。
仅文档修改可正常完成 Workflow，结果明确为文档验收。应用发布只有完整收敛后才成功。

测试覆盖分类边界、Gate 的允许跳过与失败拒绝、旧 Manifest、组件身份不匹配、冷启动兼容、
依赖变更失效，以及真实蓝绿部署时复用组件的容器 ID。Foundation/Recovery 继续使用隔离
PostgreSQL、S3Mock 和 Control-state，并覆盖不同 Migration Journal 的升级与回退。
GHCR 清理在删除前读取保留 Web Manifest 的组件 Digest，保护被引用的旧组件。
Manifest 读取失败时拒绝该轮清理，避免破坏仍在保留期内的镜像集合。
PostgreSQL 镜像由独立数据库维护管理，常规 Web 镜像清理保留其版本。运行中的数据库
镜像长期固定，版本退役须同时核对恢复代际，Web 发布数量不代表它已失去恢复用途。

生产 PostgreSQL 继续单独维护。CI 候选镜像扫描与实际运行 PostgreSQL Digest 的安全验收
分别记录。生产发布、main 推送和服务器操作仍按 Owner 要求逐项授权。
