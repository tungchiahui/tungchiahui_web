# Phase 0 Legacy Discovery Baseline

> Status: Owner accepted Phase 0 baseline
> Discovery date: 2026-08-23
> V2 repository: `/home/tungchiahui/UserFolder/MySource/tungchiahui_web`
> V2 baseline commit: `5da0ea9b6b87c9790cbc9db59b4c9e988934ca4e`
> Legacy repository: `/home/tungchiahui/UserFolder/MySource/my-blog`
> Legacy evidence commit: `d33e9ee5f90a266207f9f9658a47031eafdb981a`

本文件记录 Phase 0 的只读 Legacy Discovery。它描述需要保留的用户可见行为，不把 Nuxt、Vue、静态生成、EdgeOne Blob 或其他旧实现方式变成 V2 架构要求。V2 实现仍以 Accepted ADR、架构文档和规格为准。

## 1. Repository 边界与只读规则

| Repository | 角色 | Phase 0 规则 |
| --- | --- | --- |
| `tungchiahui_web` | 新的 Website V2 实现与本基线的写入目标 | 仅写 Discovery、Fixture、Planning Artifact |
| `my-blog` | 旧 Nuxt 行为、Route、视觉和内容参考 | 全程只读；不得修改、格式化、生成或提交 |

只读证据采集开始时，Legacy Repository 位于 `main`，HEAD 为上述 Commit，`git status --short --branch` 仅输出 `## main...origin/main`。采集结束必须再次得到同样的 HEAD 和 Clean Worktree；这是 Phase 0 Gate 的一部分。

### 1.1 Post-baseline Delta 与后续读取规则

Phase 3 前交接审计时，Legacy `main` 已前进到 `155c39874fef1d1de4587d1dc5dacb2c42756a38`。对 `d33e9ee...155c398` 的定点只读 Diff 只有 `.nvmrc`、`package.json` 和 `package-lock.json`，提交主题为 Node.js/npm 版本标准化；没有修改 Content、Frontmatter、Route、Page、Component 或 Asset。因此本文件的 Phase 0 行为证据仍固定在 `d33e9ee...`，不把后来的工具链提交伪装成重新完成过全量 Discovery。

Phase 1–17 应优先使用本文件、`legacy-route-and-pinyin-fixtures.md`、`legacy-risk-register.md` 和 `phase-0-traceability.md`。只有这些 Artifact 无法回答某个具体 Legacy 行为时，才定点只读检查旧仓库；Phase 18 再从当时最新 Legacy HEAD 执行完整 Delta/Inventory 刷新。

## 2. Evidence scope 与数量

| 类别 | 发现 | 证据 |
| --- | --- | --- |
| Git-tracked 文件 | 1,300 | `git ls-files` |
| Canonical zh-CN Markdown | 237：4 Blog、233 Wiki | `content/posts/**/*.md`、`content/wiki/**/*.md` |
| Wiki 文档根目录 | 18 | `content/wiki/*/` |
| 构建时生成 Content | 948：`en-us`、`zh-hant`、`zh-hk`、`zh-tw` 各 237 | 被 Gitignore 的 `content/_i18n/`；不是 Canonical Source |
| Nuxt Page | 23 个 Page File，包括 Locale Wrapper 与 Catch-all | `app/pages/` |
| Vue Component | 11 | `app/components/` |
| 独立静态 ROS2 GitBook | 958 个 tracked 文件：311 HTML、376 Markdown、271 其他 Asset | `public/docs/ros2/{core,application}/` |
| 其他 tracked Public Asset | favicon、6 个 `public/images` 文件和一个旧维护脚本 | `public/` |
| 显式 Wiki Legacy Alias | 7 | `utils/wiki-legacy-paths.ts` |
| 当前 Canonical Content Route Collision | 0；237 个输入产生 237 个唯一 Route | `utils/wiki-content-meta.ts` 算法的只读重放 |

`.output/public` 是 ignored/stale Build Artifact，不是权威 Route Source。发现时其中只有 263 个 `index.html`，明显少于 Source Route Grammar 可以表达的 Route，因此不得把该目录当作完整 Inventory。Phase 18 必须从当时的 Canonical Source 和 Route Rules 刷新 Inventory。

## 3. Public Route Inventory

完整行为 Fixture 与验证方法见 `legacy-route-and-pinyin-fixtures.md`。本节记录 Route Surface。

### 3.1 Locale Prefix

Legacy Source 接受：

```text
zh-cn
zh-hant
zh-hk
zh-tw
en-us
```

V2 权威规范只接受：

```text
zh-cn
zh-hk
zh-tw
en-us
```

Owner 已在 O-001 决定：V2 直接移除 `zh-hant`，不保留 Exact Route，也不建立 Redirect/Alias。Phase 7/18 必须用 Negative Route Test 固定这一明确例外；其余四个 approved Locale 不受影响。

### 3.2 Route Grammar

以下 Route 在无 Locale Prefix 和每个 Legacy Locale Prefix 下均可由旧 Router 表达；Locale Route 使用 `/<locale>` 前缀：

| Surface | Unprefixed Route | Locale-prefixed Route | 分类 | 目标 Phase |
| --- | --- | --- | --- | --- |
| Homepage | `/` | `/<locale>` | MUST KEEP | 6、7、18 |
| Blog list | `/blog` | `/<locale>/blog` | MUST KEEP | 6、7、18 |
| Blog article | `/blog/<explicit-or-pinyin-slug>` | `/<locale>/blog/<same-slug>` | MUST KEEP | 5、6、7、18 |
| Wiki list | `/wiki` | `/<locale>/wiki` | MUST KEEP | 6、7、18 |
| Wiki document/index/chapter | `/wiki/<doc-pinyin>/<chapter-pinyin...>` | `/<locale>/wiki/<same-path>` | MUST KEEP | 5、6、7、18 |
| Search | `/search` | `/<locale>/search` | MUST KEEP outcome; MAY REDESIGN implementation | 10、18 |
| Informational/special page | 见下一节 | `/<locale>/<same-page>` | MUST KEEP | 6、7、18 |
| ROS2 static archive | `/docs/ros2/core/**/*.html`、`/docs/ros2/application/**/*.html` | 无 Locale variant | MUST KEEP | 6、11、18 |

Unprefixed Content Route 是 zh-CN Compatibility Surface。旧实现会为 `/blog/...` 和 `/wiki/...` 追加 `zh-cn` 查询候选；它们不是未使用的源码路径。

### 3.3 Special Page

旧 Router 对以下 10 个 Page 同时提供 unprefixed 与 Locale-prefixed Route；`/search` 由单独 Page 提供：

```text
/about
/cv
/friend
/more
/music
/mylogo
/start
/stats
/tech-footprint
/weight-loss
```

Owner 已确认以下 Route 和界面全部保留。`/more` 继续作为入口 Hub，但不替代或删除其他独立 Route：

| Feature / Route | 用户可见行为 | 建议分类 | 目标 Phase | 状态 |
| --- | --- | --- | --- | --- |
| About `/about` | 个人方向、站点说明、服务入口与联系方式 | MUST KEEP | 6、7、18 | O-002 RESOLVED |
| CV `/cv` | 在线简历、联系方式、PDF/Print 相关入口 | MUST KEEP | 6、7、11、18 | O-002 RESOLVED |
| Friend `/friend` | 友情链接与外部社区入口 | MUST KEEP | 6、7、11、18 | O-002 RESOLVED |
| More `/more` | 特殊页面、Analytics、Storage/Chat 等入口 Hub | MUST KEEP | 6、7、18 | Phase 18 local repair；Owner acceptance pending |
| My Logo `/mylogo` | Logo 含义和视觉身份说明 | MUST KEEP | 6、7、11、18 | O-002 RESOLVED |
| Music `/music` + Global Mini Player | QQ Music Playlist、APlayer、CDN Audio Mapping、跨页面播放/错误恢复 | MUST KEEP outcome；允许重做播放器实现 | 6、7、11、18 | Phase 18 local repair；Owner acceptance pending |
| Start `/start` | 搜索引擎、Suggestion、Bookmark CRUD/Import/Export、History、Layout/Background localStorage | MUST KEEP outcome；允许重做实现 | 6、7、11、18 | Phase 18 local repair；Owner acceptance pending |
| Stats `/stats` + page stats | Public Analytics Dashboard；Blog/Wiki/List 聚合 Locale/Legacy Path Traffic | MUST KEEP public outcome；需重新做安全边界 | 6、7、10、16、18 | Phase 18 local repair；Owner acceptance pending |
| Tech Footprint `/tech-footprint` | Public Roadmap；Owner Edit；Import/Export；持久化 | MUST KEEP；V2 使用 PostgreSQL，不移植 EdgeOne Blob | 3、4、6、7、16、18 | Phase 18 local repair；Owner acceptance pending |
| Weight Loss `/weight-loss` | Public/Personal Progress；Chart；Import/Export；持久化 | MUST KEEP；V2 使用 PostgreSQL，不移植 EdgeOne Blob | 3、4、6、7、16、18 | Phase 18 local repair；Owner acceptance pending |

## 4. Core Page、Component 与 Interaction Inventory

| Surface | Legacy behavior | 分类 | 目标 Phase |
| --- | --- | --- | --- |
| Global Header | Home/Blog/Wiki/About/More Navigation、Search、Theme Toggle | MUST KEEP behavior; MAY REDESIGN layout；Owner 于 2026-09-07 明确 Search 为独立放大镜，并把 Theme 细化为跟随系统/深色/浅色三态 | 6、7、10、18 |
| Global Footer | Site Navigation、Language Switch、Social/Contact、ICP备案/公安备案 | MUST KEEP required/legal identity; MAY REDESIGN layout | 6、7、16 |
| Theme | System-preference + persisted Light/Dark Mode | SHOULD KEEP | 6 |
| Loading Feedback | Page/reader aware delayed loading overlay | SHOULD KEEP outcome | 6 |
| Homepage | Identity Hero、focus cards、latest Blog/Wiki | MUST KEEP information architecture; MAY REDESIGN visuals | 6 |
| Blog list | Date sort、Locale filter、Traffic aggregation | MUST KEEP，包括公开 Traffic display | 6、7、16 |
| Blog article | Markdown、TOC、heading anchors、reading progress/time、previous/next、image zoom、code copy、traffic stats | MUST KEEP reading contract; MAY REDESIGN controls | 6、7、16 |
| Wiki list | Document grouping、chapter order/numbering、traffic aggregation | MUST KEEP hierarchy and ordering | 5、6、7 |
| Wiki article | Document drawer、TOC、previous/next、reading progress、heading anchors、image zoom、code copy、traffic stats | MUST KEEP reading/navigation/traffic contract; print/PDF control explicitly removed by Owner on 2026-09-07 | 6、7、16、18 |
| Markdown link | `/docs/*` remains a normal anchor; external links open safely; internal links use app navigation | MUST KEEP outcome | 6 |
| Markdown image | Responsive lazy/async image rendering | MUST KEEP outcome | 6、11 |
| Blog/Wiki reader interactions | Wiki document hierarchy, numbered TOC/anchor, reading progress, code copy, image zoom and previous/next | MUST KEEP outcome；Owner removed Wiki print/PDF and refined preview/mobile-dismissal behavior on 2026-09-07 | Phase 18 blocking repair PASS locally；`phase-18-blog-wiki-compatibility.md` |
| Blog taxonomy/pagination | No category/tag taxonomy and no Blog pagination in current Legacy implementation/corpus | Not a Legacy compatibility requirement | Phase 18 targeted read-only evidence；do not invent empty facets |
| Search | Blog/Wiki/static-page indexing、type filter、scoring、highlight/excerpt、query-string sync | MUST KEEP user outcome; legacy client corpus/index MUST REMOVE | 10 |
| Language Switch | Preserve logical document by `i18nKey`; fall back to section when variant absent; persist choice | MUST KEEP for approved Locales | Phase 7 server-rendered same-logical-route switch PASS；Phase 18 final audit |

Legacy Client-side Search Implementation 违反 V2 的 Server-side PostgreSQL + PGroonga 决策。只迁移 Search Experience/Result Contract，不迁移 `queryCollection(...).all()` 后在应用内构建临时索引的实现。

## 5. Visual Identity

### MUST KEEP

- TungChiaHui Logo 与可识别个人身份。
- 以白/深蓝黑为底、蓝色 Accent 的 Light/Dark Identity。
- Header、正文、Footer 的核心 Information Architecture。
- Responsive Mobile Layout。
- Blog/Wiki 作为两个主要 Content Channel。
- ICP 与公安备案信息及其合法链接。

Phase 6 为避免猜测而定点只读复核了 Legacy Footer，固定当前值为 `鲁ICP备2025185601号-2` 与 `鲁公网安备37030302001121号`，公安备案链接 Record Code 为 `37030302001121`。这些值已进入 next-intl Message Catalog；Phase 16/18 仍负责最终法律信息审计。

### MAY REDESIGN

- 精确像素、旧 CSS Class、Card Shape、Spacing、Animation 和 Vue Component 切分。
- Font Awesome/APlayer/medium-zoom 等具体库。
- Nuxt Loading、NuxtLink、MDC Component 的具体实现。

Phase 6 使用 Tailwind CSS 4 与 Base UI-based shadcn/ui 重建可识别 Identity；不得复制旧 CSS Architecture 或引入平行 UI/CSS Framework。

## 5A. SEO / Metadata Compatibility

对 Phase 0 Evidence Commit 的定点 SEO 检查确认：

| Surface | Legacy metadata behavior | V2 compatibility |
| --- | --- | --- |
| Homepage、Blog/Wiki List、Special Page | Page-level、Locale-aware `title` 与 `description` | MUST KEEP 有意义且与页面 Locale/内容一致的 Title/Description；实现改用 Next.js Metadata |
| Blog Article | Title 来自文章 Title；Description 优先 Frontmatter `description`，否则回退 Title；同时输出 `og:title`、`og:description` | MUST KEEP Content-derived Title/Description/OG outcome 和 Exact Public Route |
| Wiki Article | 使用计算后的 Page Title；Description 回退当前 Wiki Title；输出 `og:title` | MUST KEEP Document/Chapter Identity 与 Locale-aware Metadata outcome |
| Static ROS2 GitBook | 每个静态 HTML 自带历史 `<head>`；部分 Description 为空 | 作为完整 Static Archive 保留，不要求 V2 动态页面替它重写 Metadata |

Legacy Nuxt Config/Pages 没有发现统一 `titleTemplate`、`rel=canonical`、Sitemap/Robots 配置、Twitter Card、`og:url` 或统一 OG Image。这意味着 V2 可以按 Next.js 和生产 SEO 需要新增/改进这些能力，但不得据此改变已批准 Route、建立未经批准的 Redirect，或让 unprefixed/Locale Route 指向错误的 Canonical Identity。`zh-hant` 仍按 O-001 直接移除。

Phase 6/7 应验证 Page/Article 的 Locale-aware Title/Description 和 Exact URL；Phase 16/18 再审计 Canonical、Indexability、Social Metadata 与最终 Legacy URL/SEO Continuity。不得复制 Legacy `useHead` 实现。

## 6. Content Convention

### 6.1 Canonical Directory

```text
content/
├── posts/
│   └── YYYY-MM-DD-<title>.md
└── wiki/
    └── YYYY-MM-DD-<document-title>/
        ├── index.md
        └── DDDD[-DDDD...]-<chapter-title>.md
```

Canonical Authoring Source 只有上述 zh-CN 文件。`content/_i18n` 是 ignored Build Output，不得成为 V2 Authoring Source。

### 6.2 Frontmatter

全部 237 个 Canonical File 都有 YAML Frontmatter，并通过只读扫描确认：

| Shape | 文件数 |
| --- | ---: |
| `title` | 233 |
| `title` + `date` + `path` | 3 |
| `title` + `date` + `path` + `description` | 1 |

因此 Phase 5 必须接受 `title`-only Wiki Frontmatter，不能要求作者新增 UUID、Route、Locale 或 DB Field。Blog 的显式 `path` 优先于由 Filename 推导的 Slug，且必须原样保留 `!`、`_` 等 Legacy URL Character。

### 6.3 Metadata 与 Order

- Wiki Document Date 从顶层目录的 `YYYY-MM-DD` 推导。
- `index.md` 表示 Wiki Document Root。
- Chapter Order 从 `DDDD(?:-DDDD)*-` 推导；层级数字用于稳定排序和显示编号。
- Title 取 Frontmatter；Document Title 可由目录名去日期、`-`/`_` 后推导。
- Hidden Directory 被 Content Collection 排除。

### 6.4 Delete 与 Move

Legacy Authoring 没有显式 Stable ID 或 Delete Manifest。Git History 存在真实 Delete 和 Rename，旧静态站通过下一次 Build 中“不再产出文件”处理删除。V2 不得照搬这一不显式行为：

- Phase 5 以精确 Source Commit 做 Snapshot Diff。
- Delete 必须显式标记/处理 Runtime Row，不留下旧内容继续公开。
- Move/Rename 只有在 Source Commit Diff、Content Hash 和 Transactional Rule 能安全证明 Continuity 时才复用 Identity。
- 无法证明的 Move 不得静默合并两个 Document；应失败或进入可审计的人工决定。
- 仅有 7 个已有 Alias 可作为 Compatibility Evidence；不得把所有 Rename 自动变成 Redirect Map。

## 7. Asset Inventory 与 Reference Convention

| Asset class | Legacy location/reference | V2 compatibility requirement |
| --- | --- | --- |
| Article image | 主要是 `https://cdn.tungchiahui.cn/.../*.webp` | URL、Alt、尺寸/响应式读取行为保持；Phase 11 验证 S3/CDN Contract |
| Local article asset | `/images/*`、相对引用 | 保留 Route 或在无法保留时走审批流程 |
| ROS2 archive | `/docs/ros2/**`，含 HTML/Markdown/JS/CSS/Font/Image | MUST KEEP 全 Route；不可只迁移两个 `index.html` |
| Logo/Flag/Footer/CV | `cdn.tungchiahui.cn/tungwebsite/assets/**` | 保留视觉身份与可用 Asset，不要求保留旧 Component |
| Audio | CDN MP3 Mapping + External Playlist API | MUST KEEP outcome；实现必须经 S3/CDN Contract |
| Third-party static library | APlayer、Font Awesome，通过 Primary CDN + Global CDN Fallback | Library 可替换；必要 User Experience 与 Fallback 应重新设计 |

只读 Markdown Reference 扫描发现 3,643 个 `cdn.tungchiahui.cn` 引用，并发现 `/docs/ros2/core/index.html` 与 `/docs/ros2/application/index.html` 被 Canonical Content 直接链接。静态 Archive 因此不是孤立垃圾目录。

## 8. External Integration 与 Edge Function

| Integration | Legacy behavior | 分类/目标 |
| --- | --- | --- |
| Umami | Global script；Share Token API；Public Stats；per-route Aggregation | Public Stats 与 per-route Traffic MUST KEEP；Provider/实现 MAY REDESIGN；Phase 16 重新验证 Privacy/Auth/Cache |
| AList/S3/CDN/R2 | About/More 展示 Endpoint；Content/Audio/Image Delivery | MUST KEEP architecture outcome；Phase 11–13 |
| EdgeOne Pages Blob | `tech-footprint`/`weight-loss` public GET + authorized PUT + revision conflict + backup copy | Feature/Data MUST KEEP，但旧 Provider MUST REMOVE；V2 使用 PostgreSQL Runtime Data Model |
| Personal Edit Auth | Edit Secret 换 HMAC Token；12h/30d；Browser Storage | Owner Edit MUST KEEP；在新 Trust Boundary 重新设计 Auth/Authz 与 Zod Validation |
| Music API | External Meting-compatible playlist + QQ Music Link + CDN fallback | Music Outcome MUST KEEP；Provider/Library MAY REDESIGN |
| Search Suggestion | Baidu/Bing/Google JSONP/API | Start Page Outcome MUST KEEP；Provider MAY REDESIGN |
| Social/Friend Links | GitHub、QQ、Telegram、视频/社交平台、Friend Site | SHOULD KEEP current identity; Phase 6/7 review |
| Filing | MIIT 与公安备案 | MUST KEEP；Phase 6/16 |

旧 Edge Function 使用 `.js`，且 EdgeOne Blob 是旧 Provider-specific Runtime。V2 必须保留对应 Public View 与 Owner Edit Outcome，但使用 V2 已选 TypeScript、Runtime Validation、PostgreSQL 和 Security Boundary；不得把旧 `.js` 或 Blob Persistence 复制进 V2，也不得未经 ADR 引入平行业务存储。若旧数据无法可靠自动转换，Owner 已允许在功能与 Schema 验证后手工迁移数据。

## 9. Deployment Assumption Inventory

Legacy Site 的事实：

- Nuxt 4 + `nitro.preset = static` + `nuxt generate`。
- Build Lifecycle 在 `prebuild`/`pregenerate` 运行 Wiki Check、UI i18n Generation 与 Content i18n Generation。
- Deployment 文案描述 EdgeOne Pages/Cloudflare Pages 双静态托管与 CDN。
- Edge Functions 提供 Personal Data API；没有 V2 的 PostgreSQL Runtime、Blue/Green、Control API、Deploy Agent、Restore State 或统一 `./site` Engine。
- Build-time 生成 4 个非 zh-CN Locale；默认不需要在 Pages Build 使用翻译 API，但旧脚本可通过显式 Flag/Environment 调用 Provider。

这些是假设和迁移风险，不是 V2 技术要求。V2 必须按照 ADR 0001/0006 重新实现 Runtime Content Flow，并按后续 Phase 建立 PostgreSQL、Control Plane、Blue/Green 与 Recovery。

## 10. Compatibility Matrix

| Contract | Legacy evidence | 分类 | Verification / target |
| --- | --- | --- | --- |
| Repository physical separation | 两个独立 Git Repository | MUST KEEP | Phase 0/1/18；Legacy status check |
| Canonical zh-CN only | 237 tracked source + ignored generated locales | MUST KEEP | Phase 5 PASS：GitHub Adapter 只枚举 Canonical Path/GET Tree+Blob，忽略 `_i18n`，无 Write Capability |
| Directory/Minimal Frontmatter | 18 Wiki dirs；237/237 parse；仅 4 种 Key | MUST KEEP | Phase 5 PASS：Blog/Wiki Grammar、全部四种已记录 Frontmatter Shape 与 `title`-only Integration；Phase 18 刷新全量 Corpus |
| Explicit Blog `path` | 4/4 Blog 有 `path` | MUST KEEP exact | Phase 5 Fixture + Phase 6 真实 App Router 四条 Exact Route PASS |
| Pinyin Route | `pinyin-pro` options + sanitizer | MUST KEEP behavior | Phase 5 Slug/Collision + Phase 6 Representative App Router PASS；Phase 18 刷新全量 Corpus |
| Unprefixed zh-CN Route | Query candidate fallback | MUST KEEP | Phase 6 unprefixed 与 `/zh-cn` E2E PASS |
| Four approved Locale | `zh-cn`、`zh-hk`、`zh-tw`、`en-us` | MUST KEEP | Phase 7 four-locale UI/route/content-state E2E PASS；Phase 18 final audit |
| Legacy `zh-hant` | Fifth old Locale | MAY REMOVE；不 Redirect | O-001 RESOLVED；Phase 7 Home/Blog/Wiki 404/no-redirect PASS；Phase 18 final negative audit |
| Seven Wiki Alias | explicit alias map | MUST KEEP unless Owner changes | Phase 5 精确 Allowlist/FK/Collision + Phase 6 Representative Canonical/Alias Response PASS；Phase 18 final audit |
| Blog/Wiki reading/navigation | Page/Component evidence | MUST KEEP behavior | Phase 6 List/Article/TOC/Previous-next E2E PASS；Phase 16/18 final interaction audit |
| Search experience | `/search` + Header Search | MUST KEEP outcome | Phase 10 relevance/locale/E2E |
| Client-side Corpus Search | Legacy implementation | MAY REMOVE; prohibited in V2 | Phase 10 bundle/test |
| Recognizable identity | Logo、blue accent、theme、IA | MUST KEEP identity; MAY REDESIGN pixels | Phase 6/18 visual audit |
| Static ROS2 GitBook | 311 HTML + direct Canonical links | MUST KEEP | Phase 6 byte-identical 958-file archive + all 311 HTML response PASS；Phase 11/18 final contract/delta |
| Special pages/integrations | Source evidence in section 3.3 | MUST KEEP outcomes；MAY REDESIGN implementations | O-002–O-004 RESOLVED |
| Static Nuxt/Pages architecture | Nuxt config/package/docs | MAY REMOVE implementation | Replaced by ADR-defined V2 phases |

## 11. Alias/Redirect Exception Approval

默认目标始终是 `old URL == new URL`。只有满足以下全部条件才允许新增 Alias/Redirect：

1. Phase 5/6 的真实 Router/Content Fixture 证明原 URL 无法合理保留；
2. Artifact 记录 Exact Old URL、Proposed Target、原因、Analytics/SEO 影响和撤销方法；
3. Owner 明确批准该单项或有边界的 Route 集；
4. 自动化测试覆盖 Status、Location、Query/Fragment 和 Locale 行为；
5. Matrix 标记审批证据和实施 Phase；
6. 不使用大型 Redirect Map 掩盖 Pinyin/Identity Algorithm Drift。

现有 7 个 Wiki Alias 是 Legacy Contract Evidence，不构成任意扩展 Redirect Map 的许可。

## 12. Owner Decision Register

| ID | 问题 | 为什么不能由 Agent 决定 | Phase 0 状态 |
| --- | --- | --- | --- |
| O-001 | `zh-hant` 应保持 Exact Route、受控 Alias 到哪个 Locale，还是允许移除？ | V2 权威 Locale 只有四个，但旧站真实公开第五个 Prefix | RESOLVED：直接移除，不 Redirect/Alias |
| O-002 | 是否接受 `/about`、`/cv`、`/friend`、`/more`、`/mylogo` 为 SHOULD KEEP？ | 用户可见特殊页的重要性只能由 Owner 确认 | RESOLVED：全部独立 Route/UI 必须保留；`/more` 不替代它们 |
| O-003 | 是否接受 Music、Start、Public Stats/Article Traffic 为 SHOULD KEEP？可否分别降级/移除？ | 它们有外部依赖、隐私/维护成本，但已有真实交互 | RESOLVED：全部保留；Stats Page 与 Article Traffic 均公开保留 |
| O-004 | `tech-footprint` 与 `weight-loss` 是否必须保留 Public View 和 Owner Cloud Edit？ | 涉及个人数据、Provider-specific Blob 和新的业务数据边界 | RESOLVED：Public View 与 Owner Edit 全部保留，V2 改用 PostgreSQL；必要时手工迁移旧数据 |
| O-005 | 是否接受全部 `/docs/ros2/**` Static GitBook Route 为 MUST KEEP？ | 311 个公开 HTML Route 成本较高，但 Canonical Content 有直接链接 | RESOLVED：全部保留 |
| O-006 | 对未来 Pinyin Collision，采用“拒绝该次 Ingestion 并等待 Owner”还是批准一种确定性 Disambiguation？ | Legacy 无策略；当前 Corpus 无 Collision；Agent 不得发明公开 URL | RESOLVED：写入前检测；整次 Ingestion 失败；等待 Owner 修改 Source，使 Route 唯一 |
| O-007 | Owner 是否接受本文件的 Feature Classification 与 Compatibility Matrix？ | Phase 0 Exit Gate 明确要求 Owner 接受 | RESOLVED：Owner 已确认 Phase 0 最终清单 |

O-001–O-007 已全部关闭。Owner 已接受本文件的 Feature Classification 与 Compatibility Matrix，Phase 0 可以完成计划更新和聚焦 Commit。
