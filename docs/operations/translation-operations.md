# 翻译运维（ADR 0028）

付费 AI 在开发机执行。Git 保存块级 JSON 翻译记忆，服务器只导入和拼装英文正文。
Content Push、Public Request、GitHub Actions 均不调用付费 API；生产服务器不持有 AI Key。

## 使用

```bash
./site translate pending --content-root <content-repository> --dry-run
./site translate pending --content-root <content-repository> --execute --budget-usd 3 --key-file <private-key.json>
./site translate status --content-root <content-repository>
./site translate cancel --content-root <content-repository>
./site translate validate --content-root <content-repository>
```

Key 文件在两个仓库外，权限 0600，内容为 `{"apiKey":"<private-key>"}`。
CLI 不回显 Key。默认官方 `deepseek-flash` 非思考模式；不接受任意供应商 URL。
支持 `changed`、`article <source-path>` 和 `all`；未改块复用，原文修改/移动不重译其他块。
Force 需要 `--force --confirm-retranslation RETRANSLATE`。

显式执行前须先提交中文更改。工具绑定 Canonical Content Tree；源变更会停止当前任务。
支持 `--job-id <UUID>` 续跑，必须保留源内容与同一个 Budget。保存在
`~/.local/state/tungchiahui/translation/<repository-identity>/` 的本地状态不是 Production Store。
每个仓库仅一个执行器；状态与费用在请求前 fsync/原子落盘，结果验证后原子写入记忆。
取消在下一个安全边界生效。崩溃/非法响应的未知成本保留最大占用，恢复不会再次发送该块。
若无效响应连续发生，任务停止供人工检查。有效结果保留，未完成块继续中文。

费用以整数微美元记账，按 2026-10-11 Flash peak 上限：输入 0.30 / 输出 1.20 USD 每百万
Token。Estimate 使用保守输入/输出上限，不能当作实际账单。最高费率记账可能高于供应商
Cache/非高峰折扣账单。每次启动的新 Job 有独立 Budget；多任务授权总额须扣除前序已用
和未知占用，不能自动追加预算。模型/费率改变通过 Code Review 更新。

## Git 格式与发布

`translations/en-us/manifest.json` 声明 Schema/Normalization/Locale/Layout；
`translations/en-us/v1/<hash-prefix>.json` 使用 SHA256 前两位稳定分片。
每条记录含原文、译文、Normalization Version、Source Hash、Context Fingerprint 和 Usage。
JSON 稳定排序，无全局时间戳；API Key、执行状态、锁文件和英文 Markdown 不提交 Git。
手工修订译文只修改 `translatedText`，其余身份字段由 CLI 管理，并运行 validate。

完成/阶段性结果经 Review 提交 Content Repository。`translations/en-us/**` Push 触发同一
Content-only Sync，不构建 Next.js Image 或执行 Blue-green。服务器验证精确 Git SHA 与 Blob
SHA，Blob Cache 跳过未变化下载；批量更新变化记忆，每篇受影响英文只重新拼装一次。
中文未变且仅 JSON 改动时，OpenCC 不重算，Search/Page 只刷新 en-US。
删除记忆会让当前关联块回退最新中文。无关旧记忆保留用于未来复用，但没有数据库隐藏来源。
坏记忆明确使 Job 失败；中文已发布，旧有效且匹配当前中文的记忆继续可用。
旧任务不能覆盖已推进的 Git State；回退通过新的 Git Revert Commit 发布。

首次先部署兼容导入器，再提交 Manifest。首次切换须核对/迁移已有有效英文；此仓库生产
检查已有可翻译英文为零。后续 API 付费执行不在服务器：旧 Production Execute 返回 410，
历史 Read/Cancel 仍可用；旧 Remote Fake/Dry-run 接口仅服务测试和历史状态。
Manual Translation Workflow 现在仅验证指定内容 Commit，不持有 AI Key 或付费能力。

## 验证和恢复

测试必须证明：单块修改、移动/重复块复用、JSON-only 增量、删除、幂等、公式/代码/链接
保护、错误记忆隔离、预算/未知请求/恢复，以及 Provider-free Content Sync/Public Request。
Structured `git_memory_content_sync` 与 Job Progress 记录下载文件、变化分片/条目、物化文章
和错误，不记录 Prompt、Key 或连接串。中文失败与记忆失败可区分。
新增表属于 Expand；回退保留表和已付费记忆。PG Backup/PITR 覆盖新增表；Git Snapshot 可
免费重建译文，因此没有新增 Production File Store。清库/重译不是恢复默认方案。

定时观察只读取本地任务状态并发布经过验证的记忆；不得自动重试未知请求或追加预算。
本地任务及观察需要开发机保持运行，观察还要求 Codex 应用可执行该本地任务。
