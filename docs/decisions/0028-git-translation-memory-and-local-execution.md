# ADR 0028：Git 翻译记忆与本地付费执行

- Status: Accepted
- Date: 2026-10-11
- Supersedes: ADR 0006 的 Git 仅包含中文限制；ADR 0010 的生产付费执行位置

## Context

Owner 明确选择开发机调用 DeepSeek，内容仓库保存块哈希 JSON 记忆，服务器导入数据库并
拼装英文正文。英文 Markdown 不提交 Git。此前未发布的服务器 Provider 草案撤下；服务器
仅接受过只读身份/配置检查，没有新增 AI Key、付费任务或容器变更。

## Decision

中文 Markdown 仍是 Canonical Authoring Source。`translations/en-us/manifest.json` 与
`translations/en-us/v1/<SHA256 前两位>.json` 是英文 Translation Memory 的唯一权威来源。
身份包含 Normalization Version、Source Hash、Locale 和 AST/受保护值 Context Fingerprint。
JSON 稳定排序；原文块、译文和经过验证的 Provider/Model/Usage 都可 Review。生产数据库是
Materialized Representation，生产不向 GitHub 写入；内容 Commit 只触发 Content Sync。

付费执行仅在明确授权的 Authoring Workstation，通过 `./site translate ... --content-root`
运行。官方 `deepseek-flash` 显式 non-thinking；Key 使用仓库外 0600 文件，不进入服务器、
Actions、Image 或 Git。最高费率预算以整数微美元持久记录；请求前预占最大成本，安全译文
原子落盘后结算。未知请求保留最大占用，恢复时不再次发送；取消/源变更/余额不足安全停止。
同一个内容仓库只允许一个本地执行器。非生产本地状态不是 Production Runtime Store。

服务器验证精确 Git Commit/Tree/Blob，并通过 PostgreSQL Blob Cache 只下载变化文件。
MD/JSON 分别验证；错误记忆不会进入正式缓存，中文仍发布，整体 Job 明确报告失败。
源提交推进检查与事务互斥防止旧任务覆盖新状态，Git 回退使用新的 Revert Commit。
只增量 Upsert/Retire 变化记忆，并按块与文档关联每篇受影响英文只物化一次。
纯记忆更新只刷新 en-US Search 和 Page Paths；未变化文章不重复 OpenCC/Markdown 处理。
Public Request/Content Push 永不调用 AI。生产旧 paid-create Endpoint 返回 410；历史任务
Read/Cancel 与非生产 Fake Contract 保留，Manual Translation Workflow 改成无付费验证。

新增缓存/来源表采用 Expand Migration；先部署兼容导入器，再提交 Manifest 启用。
启用前核对/迁移已有有效英文；启用时禁止 Database-only Translation 成为隐藏来源。
删除记忆使相关块回退当前中文。独立公式、代码等仍由 Canonical Source 确定性保留。

## Consequences

- 开发机须保持运行；断点可恢复，Git 管理内容与记忆，PostgreSQL 保持运行时职责。
- 不恢复全站静态编译；Source/Memory Push 不触发 Next.js Build/Blue-Green。
- 费率是 2026-10-11 官方 Flash peak 上限：输入 0.30、输出 1.20 USD/百万 Token。
  记账可能高于 Cache/非高峰折扣后的账单；模型/价格变更须通过代码 Review。
- 保留 Normalization Version 1。完整 Identifier 优先于较短 Glossary Term；新生成普通英文
  连字符词不误判为新增代码，原 Identifier、URL、公式和 AST 保护仍需自动测试。
- 回退应用保留 Expand 表。Git 记忆可通过当前 Commit 免费重建，备份/PITR 包含新增表；
  不删除已付费结果或预算记录。内容回退以新的 Git 提交与相同同步引擎进行。
