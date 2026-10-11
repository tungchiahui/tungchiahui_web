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

主标题与 Wiki 目录名也进入同一套块级记忆。默认 pending/changed/article/all 包含正文和标题；
只补标题可加 `--fields-only`。中文 Frontmatter、文件名、拼音 URL 和正文 Heading ID 不改。
`changed` 按字段名称匹配前后标题，不依赖正文块数量；同时改标题和增加正文不会漏掉标题。
正文标题与元数据标题在 AST 身份一致时复用同一记忆；其余标题是独立 Heading Block，
不会把模型输出写进整段 YAML，也不把这些辅助 Block 拼入正文。

```bash
./site translate pending --content-root <content-repository> --fields-only --dry-run
./site translate pending --content-root <content-repository> --fields-only --after-job <settled-job-id> --dry-run
./site translate pending --content-root <content-repository> --fields-only --after-job <settled-job-id> --execute --budget-usd <remaining-budget> --key-file <private-key.json>
```

`--after-job` 要求前序任务已终止、预占已结算且 Canonical Tree 相同。新任务额度不得超过
前序额度减保守记账，执行中再次核对；整个前序链已知不确定请求被排除，不重新发送。
它不会提高累计预算，也不会自动恢复前序任务。若前序仍 running，等待其完成。
获取执行锁后，前序任务持久绑定唯一后续 Job ID，禁止恢复旧任务或重复分配同一余额；
后续崩溃只用已绑定的 Job ID 续跑，不重新创建兄弟任务。
标题任务具有自己的显式 Job ID；观察器只能发布结果，不能自动建立或重启付费任务。

生产 Expand Migration 0011 保存 worker-only `document_translation_fields` 与
`document_translations.translated_fields`。独立 `field_source_hash` 绑定当前主标题/目录来源，
防止旧版本回滚更新正文后误用旧标题。下次普通 Content Sync 免费补齐字段关联；重复提交
仍为 No-op，标题 JSON 变更只物化受影响英文并刷新搜索/缓存。正文计数保持原定义；字段
状态可从关联 Segment 与 `translated_fields`/版本/来源哈希观察；Public DAL 展示计数包含
标题字段，避免正文已译但标题缺失时提示零个待译块。

文章页、列表、首页预览、Wiki 章节、上下篇、SEO/分享信息与搜索使用同一译名。
有 index 的 Wiki 分组使用 index 主标题；没有 index 的英文分组使用顶层目录名（去日期前缀）
对应的记忆。章节编号与分组排序仍使用 Canonical 中文来源。缺失、删除或过期的标题记忆
回退最新中文；HK/TW 继续通过既有 OpenCC 转换。手动修订仍改 JSON `translatedText`。
回滚保留新表/列和 Git 记忆，原版本忽略辅助标题；再次升级按独立字段哈希安全修复。
新版本 Public/Search 也允许读取尚无辅助列的旧 Schema，缺失值直接回退；开发 Seed 的
稳定列写入支持旧 Schema 的物理迁移演练。辅助关联表在 Migration、Role Bootstrap 与
Runtime Grants 三个入口均明确禁止公开/控制角色访问。

Key 文件在两个仓库外，权限 0600，内容为 `{"apiKey":"<private-key>"}`。
CLI 不回显 Key。默认官方 `deepseek-flash` 非思考模式；不接受任意供应商 URL。
支持 `changed`、`article <source-path>` 和 `all`；未改块复用，原文修改/移动不重译其他块。
Force 需要 `--force --confirm-retranslation RETRANSLATE`。

显式执行前须先提交中文更改。工具绑定 Canonical Content Tree；源变更会停止当前任务。
若要保留作者正在编辑的未提交草稿，同时补译已发布的 Git 内容，可显式加
`--committed-source`：只读取启动时 HEAD 的 Git Blob，绝不把工作区草稿发给模型；请求前
仍核对已提交 Canonical Tree，新的中文 Commit 会安全停止任务。该选择进入持久 Scope，
续跑必须保持相同选择。默认行为仍拒绝未提交中文，不静默忽略草稿。
发布时必须独立核对 Git index 的中文 Tree 与基线一致，只提交翻译 JSON，保留作者文件。
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
英文正文与目录显示翻译后的标题，Heading ID 延续中文 Canonical Source（重复标题编号也保留），
因此原有同页链接、外部引用 Hash 和中文切换英文后的锚点不会因翻译改名失效。
删除记忆会让当前关联块回退最新中文。无关旧记忆保留用于未来复用，但没有数据库隐藏来源。
文本 NUL、超出 PostgreSQL 范围的 Token/Cost 与错误 AST/Hash 一样，在入库前拒绝。
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
