# Blog / Wiki 阅读性能

2026-10-25 排查与修复。适用于列表、章节导航、文章渲染和代码块；没有数据库 Migration。

## 原因与证据

- 原列表查询返回同类文章的全部原文、译文。Wiki 首页与每篇 Wiki 的章节目录都通过该列表
  读取不需要的正文；缓存命中仍要反序列化和校验这些字符串。Blog 列表还反复解析正文以生成摘要。
- 数据缓存没有覆盖 Markdown → HTML；每次文章请求重新解析、转换、渲染公式并高亮代码。
  Shiki 默认初始化全部内置语言，即使文章只用一种语言。
- 密集章节目录的 Next Link 默认视口预取会产生大量候选请求。线上 C/C++ 文档有 92 个导航
  链接；展开目录时观察到多条章节 RSC 预取，与点击后的正文请求并存。
- Wiki 首页全部 19 个统计组件挂载即请求 `/api/traffic`。本次线上样本耗时约 0.9–7.0 秒，
  点击章节的正文 RSC 请求约 1.3 秒。这些是单次客户端观测，包含网络/代理影响，不能用于
  推断源站 CPU 耗时，也不代表部署后的性能承诺。
- 正文代码块实测 14px。Owner 本地复核后确认原字号合适，已撤回字号/行高调整，
  保留原来的 14px / 20px 排版、缩放能力、横向滚动、空白、主题和复制功能。
  此次最终改动只处理阅读性能。

## 实现边界

`PublicDocumentSummary` 从共享文档 Schema 派生，列表缓存不再保留原文/译文。
Wiki 列表 SQL 不返回正文字段；Blog 只在填充缓存时读取正文并计算既有摘要。
英文标题、分组译名、Canonical 排序和翻译状态仍沿用已有物化规则。
发布前已合入当前 main 的 ADR 0029 项目作品集：项目列表同样使用轻量摘要，
CV / 项目列表仍取当前 Locale 正文首段作为简介，完整项目详情继续读取单篇正文。
列表缓存使用新版本 Key，继续由 `content:list:*` Tag 失效；React cache 只做请求内去重。

`src/server/cached-markdown.ts` 使用已有 Next Data Cache。HTML 以 gzip/base64 存入现有缓存，目录元数据仍为普通 JSON，读取时还原 HTML；
不改变 HTTP 响应或缓存 Owner。生产缓存为 64MiB tmpfs，当前 321 篇 Wiki 单语言
渲染 JSON 约 19.1MB，未压缩的四语言结果会超过该容量。实测同一 Wiki 语料的压缩缓存表示约 3.17MB/语言
（含未压缩的目录元数据），为现有文档数据与搜索缓存保留空间；多版本缓存随 Slot 重建清空。
Key 包含渲染版本、Locale、
Canonical Route 与原文/译文的 SHA-256；不只依赖原文 Hash，因此纯英文记忆更新也不会
误用旧 HTML。沿用 `content:route:*` Tag，Content Sync 的既有失效路径继续生效。
修改渲染语义时应更新渲染版本 Key。缓存不包含身份或个人数据，也不改变翻译执行权限。

Shiki 使用 `langs: []` 与 `lazy: true`，只加载遇到的语法，保留语言别名与未知语言纯文本回退。
自定义别名在 Markdown AST 的 code.lang 上先规范化，避免 Shiki 把尚未加载的语法别名
提前视为可用而报错；代码内容不修改。真实当前 Wiki 321 篇已逐篇完成本地渲染验证。
文章数据读取与渲染并行；章节列表 memo 化，滚动高亮不重复渲染整份文档目录。

密集内容链接使用 `ContentLink`：默认不预取，指针停留 120ms 后、键盘聚焦或触摸时预取。
快速扫过链接会取消计时；保留原生链接、辅助键、新标签页和无 JavaScript 导航。
`useLinkStatus` 在等待时显示不占布局空间的下划线及本地化读屏提示。
没有向 catch-all 添加整页 Suspense/loading 边界：实验中这会改变无 JavaScript 公式展示、
流式 404 和快速导航时的 DOM 行为；链接反馈保留既有页面直出契约。

统计组件在进入视口后才请求，按路径内容而非数组引用决定重取；卸载取消请求，忽略过期响应。
统计失败仍不阻断阅读。没有更改统计 API、上游凭据、缓存期限或生产权限。

## 验证与回退

合成样例为 20 个 TypeScript 代码块，每块 20 行。独立 Node 24.19.0 进程比较旧/新渲染器：
冷渲染约 5,336ms → 236ms，随后五次平均约 150ms → 68ms，HTML 均为 180,828 bytes。
这是本机合成样例，只验证渲染工作缩减；线上收益仍需发布后在相同文章/网络下复测。

回归入口：`cached-markdown.test.ts`、`reader-performance.test.tsx`、
`reader-performance.spec.ts`、语言别名/未知语法回归，以及原有 Markdown/公式、四 Locale、章节/锚点、复制、
手机导航、SEO、Content Sync 失效与隔离 PostgreSQL/S3Mock 集成测试。

发布仍走 main 的既有质量门禁和蓝绿流程；回退使用保留的上一 SHA 镜像及同一部署引擎。
没有内容重写、Schema/备份恢复格式变更或付费翻译。生产效果必须以发布后复测为准。

原基线本地验证：361 Unit / 59 Files、39 Browser E2E、隔离 Integration/S3Mock 7-case、
12 Migration，以及 Format/Lint、Typecheck、Source/Workflow/Drizzle Policy、Build 和 Security Gate。
发布前合入 main（a0d53b6a）后再次通过 369 Unit / 60 Files、49 Browser E2E、
完整隔离 Integration / S3Mock / 项目与翻译生命周期，以及 Static / Type / Build / Security；
集成环境应用全部 13 条 Migration。独立迁移和生产基础设施/恢复门禁由同一 main Release 验证。

上述完整 Gate 验证后，按 Owner 要求撤回字号/行高改动；`globals.css` 已与原版本一致，
更新了字号断言，并在真实内容预览页核对 14px / 20px 和代码复制按钮。
