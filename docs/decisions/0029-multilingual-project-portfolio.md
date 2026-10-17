# ADR 0029：共用内容流水线的多语言项目作品集

- Status: Accepted
- Date: 2026-10-17
- Scope: Owner 授权的简洁多语言 CV、独立成果列表与项目详情。

## Decision

新增 `project` Content Type 与 `content/projects/<stable-ascii-slug>.md`，对外 Route 为
`/projects/<slug>`。这是附加目录；现有 Blog/Wiki 目录、Minimal Frontmatter 和拼音 Route
保持原样。项目的 `title` 必填；可选 `project` 对象只保存展示控制、技术标识与 HTTPS 资源：
`featured`、`order`、`status`、`tags`、`cover`、`code`、`demo`、`video`。
文件名决定稳定 URL；项目不接受 `path` Override，重命名即明确的 URL Move。

每个项目的自然语言简介是正文第一个段落，详细贡献/实现/结果也是正文，不再在页面、
语言 Catalog 或 Frontmatter 里复制维护摘要。项目标题使用既有辅助 Heading Memory，正文
使用既有 Semantic-block Memory；中文源与 Git JSON 英文记忆沿用 ADR 0028，HK/TW 沿用
OpenCC。没有付费 Provider、新 CMS、平行翻译或 Production-to-GitHub 写入。

PostgreSQL 继续是生产 Materialized Store，添加 Enum 的 Expand Migration 0012 不替换表。
原事务、幂等、删除/移动、Git Blob Cache、Search Projection 和 Content Sync 一并复用。
`/cv`、`/projects`、详情页读取同一集合，CV 只选 `featured` 的前四项。排序使用精选、
显式顺序、已有 authored date、Route 的稳定次序。项目正文不加入应用源码或 Client Index。

CV 固定履历文案保留既有 `Web.information` 四 Locale Catalog；结构和联系身份集中到
`src/personal/cv-profile.ts`。布局、标签、空状态使用 next-intl。简历提供浏览器按当前语言
打印/保存 PDF；不增加与网页独立维护的 PDF 简历副本。

## Compatibility / Recovery

先部署应用/Worker 的项目支持与 0012，再发布 Content Commit。现有应用的 Blog/Wiki 查询
仍使用原 Enum 值；没有数据搬迁、Contract 或 Backup/Restore 格式变更。回退保留添加的 Enum。
发布项目后应保留项目兼容的 Previous Release；若必须退到项目支持之前，暂停内容同步，
不可让旧 Source Adapter 的不完整 Snapshot 覆盖新项目；已有内容与英文记忆保留以便恢复。
未发布项目时提供四语言空状态，不注入演示/本地 Fixture 到生产。

修改、删除和移动项目同时失效详情、成果列表、CV、对应四语言路径和 Search Tag。
英文 Memory-only 更新仍只刷新英文路径；没有重构 Next.js Slot、运维权限或付费执行边界。

## Verification

覆盖 Runtime Validation、稳定路由、精选排序、四 Locale UI、同源摘要、翻译保护/块复用、
Search Relevance/Locale、SEO/Sitemap、同步重放/更新/删除/恢复，以及浏览器导航、窄屏、
暗色和打印。维护入口见 `docs/development/project-portfolio.md`。

真实 Browser Navigation 额外验证了 Next.js 16 的流式 Metadata 重复 Canonical 问题。
使用版本内官方文档的 `htmlLimitedBots: /.*/` 输出 Blocking Metadata，避免上一页 Head
残留；代价是冷请求等待元数据。复用原查询缓存，不新增 Client-side Head 修补逻辑。

## Owner 视觉纠正（2026-10-17）

首版保留博客装饰的方案被 Owner 明确纠正。CV、成果列表、项目详情改用共享 CareerShell，
外观固定为白底文档、普通文字链接和单列成果，不继承博客的卡片/渐变/深色主题。
未修改博客主题偏好，未增加技术栈或内容来源；四语言与共享内容模型保持原决策。

Owner 后续要求「联系」使用独立 `/contact` 页面。该页面复用 CareerShell、四语言 UI、
`cvProfile` 的联系身份与既有 Special Page 路由/Metadata/Sitemap，不新增内容存储或服务。
