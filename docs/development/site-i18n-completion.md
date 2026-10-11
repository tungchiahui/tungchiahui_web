# 全站国际化补漏（2026-10-11）

本轮沿用 next-intl UI Message 与 ADR 0028 Content Memory；没有架构、数据库 Schema、
Public URL、权限、部署或恢复策略变更。四种 Locale 为 zh-cn / zh-hk / zh-tw / en-us。

## 固定 UI 与数据边界

| 范围 | 处理与验证 |
| --- | --- |
| About / CV / Friend / Mylogo | `Web.information` Semantic Key；完整介绍、履历、奖项、友情链接、图像 Alt、分类、数量、联系标签、Logo 说明进入四 Locale Catalog。Server Component 通过显式 Locale 的 next-intl 读取；不再调用简繁 Content Converter 作为英文 UI 翻译。 |
| More | 分类 Eyebrow、存储 Badge/示意标签与复制无障碍标签进入 Message；复制成功/失败保留本地化并使用 Live Region。外部服务 URL/技术身份保持原值。 |
| Start | 内置分组/描述/知乎名称来自 `Web.startDefaults`；引擎标签、备用壁纸名称、快捷入口、导入/校验错误和集合空状态来自 `Web.start`。补齐搜索/新增/导入的 Accessible Name 及页面主标题。 |
| Stats | 固定 Kicker 进入 Message；Number Format 使用当前 Locale；加载/不可用/重试/空表已有 Message，状态可由辅助技术读取。来源统计行仍是数据。 |
| Music / 浮动播放器 | 播放、进度、音量、封面 Alt、歌词加载/错误原有 Message；补齐有效空 Playlist 状态。缺失歌名/艺术家用 UI Message，Provider 的原始歌曲与歌词不翻译。 |
| Tech footprint / 编辑器 / Toolbar | 固定文案原有 Tech/TechEdit/Personal/Roadmap Catalog；新增阶段/任务/子任务/里程碑空状态。字段 Accessible Name、登录、保存、冲突、导入和错误沿用现有 Message。 |
| Weight loss / Toolbar | 固定文案、字段标签、只读/登录、记录空状态、保存/冲突/导入错误已有四 Locale Message；日期、计量值和作者备注保持数据身份。 |
| 所有 More 本站子页及 About | Metadata Title/Description、Canonical/Locale 路由沿用既有 `Web.special`，四 Locale Browser Gate 逐页验证。 |

Start 的 revision=0 为尚无已保存版本的系统默认视图，用当前 Locale 的内置分组显示。
已有 revision>0 的书签标题、名称、描述、历史查询及账户名不经过 UI 翻译，也不按中文匹配
覆盖。Reset 是用户显式操作，使用当前 Locale 的内置集合。生产服务镜像同时打包 Catalog，供默认数据构造使用；不注入任何新 Secret。
控制面/开发 Seed 的 Canonical
默认仍为 zh-CN；不修改任何既有生产 Row。技术路线作者数据仍使用其 zhCN/en 字段和已有
确定性繁体策略；未填写作者英文时允许中文 Fallback，不伪装为 UI 漏译。
Bing 的来源标题/版权、歌曲/歌词与统计维度都是第三方数据；不隐式付费翻译。

## Wiki 标题缺口

内容 [PR #10](https://github.com/tungchiahui/tungchiahui_content/pull/10) 新增 10 条记忆，
覆盖 11 个主标题与 15 个目录字段。252 篇当前已提交文档的可翻译标题字段为 497 个，
本地审计从 471/497 增至 497/497，总有效记忆由 18,439 增至 18,449。
北极熊未提交草稿只保留在作者工作区，审计读取 Git HEAD Blob，不采纳新增内容。

10 个缺失 Key 与终止标题 Job `b41856c6-330a-4fdc-b112-4889a57f8769` 的 10 个 failedKeys
完全一致。该 Job 已 partial/settled，无 remaining/reserved 请求。执行器仅保存
`Provider request failed validation or has uncertain billing; maximum cost retained`，没有持久化
失败响应；因此证据能定位到失败请求边界，不能进一步确证每次请求的具体 Provider/AST
失败原因。保护机制保持原样，不为补漏降低校验或改变记忆身份。

本轮直接提供语义英文并通过原有 `titleTranslationBlock` / `validateMemoryEntry` 校验。
新增条目标记 `provider=manual` / `model=codex-semantic-review` / 零 Usage，诚实区别于付费
DeepSeek 结果。不存在新 Job、恢复、未知重发或预算追加，旧保守成本记录保持原样。
`Boost.Asio`、`OpenCV_CUDA`、`QEMU-KVM`、`Nuxt.js`、`Linux-STM32-CMake-VScode` 和
`STM32CubeIDE-VScode` 保持原始技术身份；Deprecated 的语义保留。中文文件、Frontmatter、
Route 与正文 Heading ID 均不改，辅助标题不拼入文章正文。

## 回归与发布

- `i18n-messages.test.ts`：四 Locale Key 对齐；英文固定文案不得有 Han，允许母语 Locale
  选择名与法定备案身份；扩展 More 全部组件的固定中文 Literal Guard。
- `more-music-compatibility.test.tsx` / `start-defaults.test.ts`：四 Locale 信息页与内置默认，
  已保存作者字符串原样；现有音乐和 More 兼容边界继续保留。
- `wiki-title-repairs.test.ts` + `tests/fixtures/translation/wiki-title-repairs.json`：10 个真实缺口
  的稳定 Key、英文、源标题和 AST 保护；拒绝把额外正文作为标题记忆。
- `more-i18n.spec.ts`：全部本站 More 子页四 Locale Metadata/Route/标签，Start 无效导入、
  作者数据与空状态，复制成功/拒绝，统计重试/空状态和音乐空集合。
- 全量 Unit、Static/Type/Build/Security、隔离 Integration/E2E/S3Mock 和 12 个 Migration
  Gate；main 的 CI 还执行原有 Production Foundation / Recovery Gate。

内容 PR 只走 Content-only Sync；Web PR 走 main Quality Gates、Immutable Image 和服务器
Blue-Green 自动发布。开发机不执行生产主机部署。最终成功依据 GitHub Run、生产版本和
公网 Locale 页面验证，不能把 PR 合入或 Image Build 当作部署完成。

回退 Web 使用原 Blue-Green Previous Slot，保留数据库和 JSON 记忆。新增 JSON 可用新的
Revert Commit 移除，并按原引擎回退中文；不得清库或重跑付费任务。当前已提交正文仍缺 643 个唯一记忆块，涉及 134 篇文档的 678 个引用；作者
缺失英文仍按 ADR 0028 最新中文 Fallback，本轮只清零当前已提交内容的标题记忆缺口。

2026-10-11 内容发布证据：Content Run `38119488655` 的第一次 POST 在公网入口返回
HTTP 554；原 GitHub 工作流重试成功，使用同一 Source Commit 与幂等身份创建 Job
`17a55076-a862-4766-af5b-c820a2161755`。随后公网逐一验证 11 个主标题/Metadata、Wiki
列表和 15 个目录关联覆盖范围，中文主标题与全部正文 Heading ID 对照一致。CI 创建
任务成功本身不等于导入完成，以上页面结果是实际已导入/物化的证据。

本地当前门禁：54 个 Unit File / 339 Test、33 项完整 Browser E2E、隔离 Content/Search/
Translation/控制面 Integration、S3Mock 7-case、12 个 Migration，以及 Static/Type/Build/
Security Gate。Start 布局断言等待提交按钮可见并在稳定布局中核对同一个中心距离约束，
避免分帧读取产生瞬态差值；没有放宽阈值。完整 Production Foundation 已通过；Recovery 和最终自动发布以 main CI 为准。
Web [PR #48](https://github.com/tungchiahui/tungchiahui_web/pull/48) 为 UI 及回归改动入口。
