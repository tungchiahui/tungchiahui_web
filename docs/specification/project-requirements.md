# 项目需求

## 目标

在 Next.js 上构建新的个人网站实现，同时保留重要公开行为，并消除旧架构中内容与 Build-time 的耦合。

## 功能需求

### 内容

- 在 GitHub Content Repository 中编写 Canonical Article/Wiki Markdown。
- GitHub 只保存 zh-CN Canonical Markdown。
- 除非明确批准，否则保留当前 Content Repository Directory Structure。
- 保留当前 Minimal-frontmatter 理念。
- 把内容导入 PostgreSQL，供 Production Runtime Access。
- 支持 Deterministic Delete/Update/Move Handling。

### Routing

- 在技术上可行的地方保留现有 Public Route Pattern。
- 保留 Chinese-to-pinyin Path Behavior。
- 避免大规模 Redirect Map。
- Locale Route：
  - `zh-cn`
  - `zh-hk`
  - `zh-tw`
  - `en-us`

### Internationalization

- UI Message 使用 next-intl，并与 Application Code 一起部署。
- Content Translation 与 UI Translation 相互独立。
- 英文 Article Translation 按 Semantic Markdown-block Granularity 增量执行。
- zh-HK 和 zh-TW Content 使用 Deterministic OpenCC Conversion，并在需要时使用明确 Exception。

### Search

- 对相关 Blog/Wiki Content 提供 Multilingual Full-text Search。
- Search 在 Server-side 针对 PostgreSQL 执行。
- Baseline Engine：PGroonga。
- Search 必须支持中文和英文内容。

### Static Asset

AList S3 保存：

- Image
- Attachment
- Music
- 选定的 Static Library/Asset
- Database Backup

现有 CDN Endpoint 继续作为 Public Asset Delivery Path。

### Legacy Feature

应从 Nuxt Repository 盘点重要现有 Feature。

Feature 分类为：

- MUST KEEP
- SHOULD KEEP
- MAY REDESIGN
- MAY REMOVE

当分类有歧义时，询问 Owner，而不是自行假设。

## 运维需求

- One-command Local Development
- 隔离的 Local PostgreSQL 和 Local S3 Emulation
- 一个稳定 Operator CLI
- Automated Blue-Green Deployment
- Immediate Rollback
- Versioned Backward-compatible DB Migration
- Automated Backup
- Tested Recovery
- Near-zero-downtime Planned Server Migration
- Reproducible Server Provisioning
- Infrastructure Configuration Stored as Code

## 控制面与连接

- Production Control Operation 使用 `https://www.tungchiahui.cn/api/ops/*`。
- 不需要单独的 Operations Hostname。
- `ddns.tungchiahui.cn` 是 DNS-only/DDNS Production Origin Hostname。
- 即使家庭服务器未来只通过 IPv6 公网可达，设计仍必须继续工作。
- 家庭公网数字 IP 不得成为 Durable Application/CI/Operator Configuration。

## 翻译控制

- Content Push 必须在不等待 AI Translation 的情况下发布 zh-CN。
- Translation Hash Miss 变为 Pending。
- Pending en-US Block 渲染最新 Canonical zh-CN Block。
- Paid AI Translation 仅在 Operator 显式操作后发生。
- Translation Execution 支持 Dry-run Estimate 和显式 Budget。
- Budget Enforcement 在 Server-side 执行。

## GitHub 方向

- GitHub 是 Canonical Content Source。
- Production Content Synchronization 从 GitHub 到 PostgreSQL 单向执行。
- Production 不会自动把 Content 写回 GitHub。
