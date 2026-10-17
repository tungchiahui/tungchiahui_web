# 简历与项目维护

## 页面

- `/cv`：简洁求职入口；代表项目可直接进入详情。
- `/projects`：完整成果列表；白底、深灰正文、蓝色文字链接，按单列图文条目展示。
- `/projects/<slug>`：项目案例、个人贡献、结果与代码/演示入口。
- `/contact`：独立的白底联系页面，集中展示邮箱、GitHub、WeChat 和 QQ。
- 四种语言共用布局。Locale Switch 保留逻辑路径；默认中文兼容原 `/cv`。

## 白底文档外观

Owner 对首版视觉反馈为过于花哨，要求接近参考网站的朴素 HTML 个人主页。
CV、成果列表和详情共用 CareerShell：固定纯白背景、普通文字导航和语言链接，
移除主题切换、登录/搜索按钮、装饰图标、卡片、渐变、阴影与无封面占位图。
求职导航为「个人简历 / 项目 / 联系」；「联系」直接进入同语言 `/contact` 独立页面。
联系页面与 CV 共用 `cvProfile` 的身份数据，说明文案来自四语言 `Web.portfolio`，
语言切换保留 `/contact`，并沿用已有 Canonical、hreflang 和 Sitemap 机制。
即使从深色博客导航过来，求职页面也保持白底；不修改用户保存的博客主题。
四语言、项目链接、打印和正文维护机制不变。详情继续复用安全 Markdown Renderer，
只收敛外观并隐藏侧边阅读控件；正文锚点、代码复制与图片预览仍可用。

## 修改简历

`src/personal/cv-profile.ts` 保存联系身份、照片、教育/经历/奖项的展示结构。
`messages/{zh-cn,zh-hk,zh-tw,en-us}.json` 的 `Web.information` 保存固定履历文案，
`Web.portfolio` 保存项目页面标签、状态和空状态。修改固定文案需要检查四个 Catalog，
随 Web 发布。CV 的项目介绍来自项目正文，不在 Catalog 重复维护。

页面的「打印 / 保存 PDF」使用浏览器打印，沿用正在查看的语言。选择保存为 PDF；
建议在打印设置关闭浏览器页眉页脚。打印隐藏站点导航、页脚与操作按钮，保留项目链接。
CV、成果列表与项目详情不展示浮动播放器，但不重置用户已经开启的播放状态。

## 新增项目

在 **内容仓库** 新增 `content/projects/my-robot.md`，使用稳定的小写英数与连字符文件名。
文件名对应 `/projects/my-robot`；修改标题不会改变 URL。不要为了调整标题重命名文件。

```markdown
---
title: 我的机器人项目
project:
  featured: true
  order: 10
  status: ongoing
  tags: [ROS2, STM32]
---

用一个简短段落说明项目目标、你的贡献和主要成果。它也是简历与成果条目共同使用的简介。

## 个人职责

明确个人与团队的工作范围。

## 实现过程

记录关键方案、技术判断和困难。

## 实际结果

只写可验证的结果。图片、视频链接与相关技术文章可放在正文。
```

只有 `title` 必填，`project` 整体可省略。没有封面时直接展示文字条目，不显示装饰性占位图。
可选字段：

| 字段 | 作用 |
| --- | --- |
| `featured` | 默认 false；true 的项目可以进入 CV，最多四项 |
| `order` | 默认 100，非负整数；精选项目优先，同组数字小的靠前 |
| `status` | completed / ongoing / archived，页面自动本地化标签 |
| `tags` | 技术标识，最多 12 个；各语言保持同一标识 |
| `cover` | S3/CDN 的 HTTPS 图片地址；中文 Alt 使用项目标题的当前译名 |
| `code` / `demo` / `video` | 可选 HTTPS 链接；未填写就不显示对应入口 |
| 原有 `date` | 可选 authored date，不应伪造项目完成日；缺省时省略 |

正文推荐从简介开始，用二级标题展开；页面已经提供项目主标题。
项目不接受 `path`；既有 Blog/Wiki 的 Frontmatter 约定不变。
移除 `featured` 只从 CV 撤下，不影响完整列表。`archived` 是公开状态，不是草稿/隐私开关。
内容仓库被采集的所有项目均公开；私有资料不要放入 Canonical 内容目录。
删除文件会通过原同步流程软删除项目并刷新 CV、列表、详情、搜索和 Sitemap。

## 翻译与发布

中文正文为源。HK/TW 复用确定性转换与术语规则；英文标题/正文复用 Git 块级记忆。
简介就是第一个正文段落，因此其英文和正文使用同一份译文，局部更新不会要求整篇重译。
Git JSON Memory 可通过既有人工审阅/校验流程维护；付费执行仍需显式预算授权。
缺失/变化英文块展示最新中文，公共访问和 Content Push 永不付费调用。

先发布 Web/Worker 和 Expand Migration 0012，再提交项目 Content Commit。
项目及 Memory Push 只执行 Content Sync，不需要重新构建网站。
首批两篇正文依据已有 CV 的 Robocon/AMR 经历整理，没有补充未确认的图片、演示或指标。
本地 Seed 的 fixture 名称只用于测试，绝不能复制成生产经历。

## 验证与回退

执行既有 Format/Lint、Typecheck、Unit、Migration、Build 和 Disposable Integration/E2E Gate。
新增 `project-portfolio.test.tsx` 与 `project-portfolio.spec.ts` 验证四语言入口、共享内容、
语言切换、空状态、项目详情、移动端、暗色与打印；同步生命周期由真实本地 PostgreSQL
集成验证。记录 GitHub/生产证据前只称本地完成，不宣称上线。

没有新服务、凭据、可写生产文件或备份制品格式。恢复仍使用既有 PostgreSQL/PITR 与 Git
记忆；应用回退保留 0012。发布项目后优先退到项目兼容版本；退到旧 Worker 前暂停内容
同步，升级恢复后从完整 Canonical Commit 重放，不能删除数据或回放缺少项目的不完整快照。
