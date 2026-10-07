# Public SEO 与 Blog Journal

## URL 与索引契约

Public SEO 使用 Next.js Metadata API 与原生 `sitemap.ts`、`robots.ts`、
`opengraph-image.tsx`，统一实现位于 `src/web/seo.ts`。Public Origin 来自现有经过
Validation 的 `SITE_BASE_URL`，不读取 Request Host，也不增加部署配置或持久化存储。

- zh-CN Canonical 使用原有 unprefixed URL；`/zh-cn/**` 保持可访问并指向同一 Canonical。
- zh-HK、zh-TW、en-US 使用各自的 Locale-prefixed Canonical。
- Legacy Alias 继续返回原页面，Metadata 与 Structured Data 使用 DAL 解析后的
  `document.routePath`，不新增 Redirect Map。
- 各语言的 HTML 与 Sitemap 提供相同的四语言 reciprocal Alternate Set，加上指向
  unprefixed zh-CN 的 `x-default`。
- `/search` 与带 `q` 的 Blog/Wiki Filter Page 使用 `noindex, follow`，Canonical 不含
  Query String。robots 允许访问这些页面以读取 noindex，不把 robots 当作权限控制。
- 缺失文档和未知 Route 不生成正常页面 Canonical，保持 404/noindex。

`robots.txt` 声明 Sitemap 地址并禁止 `/api/` Crawl。既有控制面授权与网络边界保持
有效；robots 不是安全边界。

## Sitemap 与内容同步

`/sitemap.xml` 在 Request Time 组合首页、Blog/Wiki Index、既有 Special Page 与 PostgreSQL
中未删除文档的四语言 Canonical。它不列举 `/zh-cn` Duplicate、Legacy Alias、Search、
API 或第三方静态文档镜像。

Document List 复用既有 `content:list:blog` / `content:list:wiki` Cache Tag；Ingestion 的
Transaction 与签名 Revalidation Hook 负责失效。Sitemap 本身 `force-dynamic`，不另设
TTL 或 Process-local Cache。内容新增、移动和删除无需重新构建应用。

**`sourceUpdatedAt` 当前由 Frontmatter `date` 或文件名日期生成，不是 Git 修改时间。**
因此它不能证明正文最后修改时间。Sitemap 不填写 `lastmod`，OG/JSON-LD 不虚构
`modifiedTime` / `dateModified`；文章已知的 Authoring Date 可以用作 `datePublished`。
未来需要 Last Modification 时必须先建立可靠的内容修改事实，不能使用请求时刻或
全量 Reindex/No-op Ingestion 时刻代替。

## Metadata、分享和结构化数据

所有原生 Public Page 提供 Title、Description、Canonical、Language Alternate、Open Graph
与 Twitter Large-image Card。Article Description 优先使用既有可选 Frontmatter Description，
否则从 Markdown AST 的 Paragraph 提取最多 160 字摘要，跳过 Heading、Code Fence、Table、
Image、Raw HTML Tag 与 Bare URL 噪声，保留有意义的 Link Text 和 Inline Code。
无需改变 Markdown 目录或 Minimal Frontmatter。

1200×630 分享图片是 Next.js `ImageResponse` 生成的静态品牌图，使用现有 Message Catalog
文案与内置字体；构建/请求不需要远程字体、付费 AI 或新的外部服务。

Root Layout 输出 `WebSite`；Blog/Wiki Article 输出 `BlogPosting` / `TechArticle`，包含
真实 Canonical、标题、摘要、Author 与已知发布日期。全中文英文 Fallback 的
Structured Data `inLanguage` 明确为 zh-CN；内容翻译仍沿用既有显式预算任务。
JSON-LD Serialization 转义 `<`，防止来自 Markdown/Frontmatter 的文本关闭 Script Element。

## 博客列表

Blog Journal 是 React Server Component：使用紧凑单栏文章列表，桌面日期位于左侧，手机
日期放在标题上方；仅以细分隔线组织文章，不使用大卡片、固定高度、独立操作栏或放大的
首篇布局。最新文章使用轻量文字标记，页头、文章数与搜索保持紧凑。保留真实日期、摘要、
流量统计与 Server-side PGroonga Search；Filter 状态显示真实结果数与 Clear Link。
不增加虚构分类、封面、人工推荐或 Client-side 搜索索引。

UI 文案同步维护四份 next-intl Message Catalog。键盘 Focus、长标题换行、无结果状态、
Locale/Legacy Route、桌面文章行高度与手机无横向溢出由浏览器测试覆盖。

首页的 Latest Blog / Wiki Preview 同样使用紧凑条目：内容自然决定行数和面板高度，
不预留五个固定高度的 Row，也不拉伸数量较少的一栏。两栏保持顶端对齐，默认关闭的
Wiki 与 Blog 条目保留一致的行节奏；Wiki 章节展开/收起仍使用原生 details/summary。
首页只缩小这两块的标题、内边距、条目间距与展开控件，不改变其前面的内容方向区域。

## 验证与发布

- Unit：Canonical/Alternate Set、Query noindex、Sitemap Deduplication、摘要 AST、JSON-LD
  Injection Escaping 与 Fallback Language。
- Integration：在隔离数据库中预热 Sitemap 后同步新增、移动、删除同一文档，验证 XML
  立即反映当前 Route，不依赖 Next.js Rebuild。
- E2E：桌面/390px 列表、搜索/清除/空结果、四语言 Metadata、Legacy Alias、robots/XML/PNG。
- 常规 Format/Lint、Typecheck、Unit、Integration、Migration、Build、Security Gate。

本次没有 Schema Migration、Backup/Recovery 或权限变化。Rollback 使用正常 Blue-green
Previous Image；内容持久化格式兼容，不需要数据回滚。发布仍走 main CI 与既有 Deployment
Engine；本地验收不等于生产发布。

参考：[Google Canonical 指南](https://developers.google.com/search/docs/crawling-indexing/consolidate-duplicate-urls)、
[Google 多语言页面指南](https://developers.google.com/search/docs/specialty/international/localized-versions)。
