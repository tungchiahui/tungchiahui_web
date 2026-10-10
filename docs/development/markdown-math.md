# Blog / Wiki 数学公式

博客和 Wiki 继续由共享服务端 unified / remark / rehype 管线生成 HTML。公式使用
KaTeX 输出可视 HTML 和辅助技术使用的 MathML；不需要浏览器执行公式脚本。
KaTeX CSS 和字体进入版本化 Next.js 制品，使用同源资源，不依赖第三方公式 CDN。

## 编写方式

行内公式可以使用 `$E=mc^2$` 或 `\(E=mc^2\)`。独立公式使用：

```markdown
$$
g=-\frac{\overline a}{\|\overline a\|}G
$$

\[
r^2=x^2+y^2+z^2
\]
```

现有《北极熊导航复现日志》的 `\[ ... \]` 不需要改写。支持 KaTeX 的分式、上下标、
矩阵、aligned 等语法。公式块不要插入 Markdown 空行；换段后另开公式块。
`\(...\)` 用于同一行内。普通代码块、行内代码、URL、Frontmatter 和转义后的
`\$` / `\\(` 保持原语义。显式标为 `math` 的代码围栏也可用于公式块。
价格文字中的美元符号请写为 `\$`，避免成对美元符号被识别为公式。

长公式在正文宽度内单独横向滚动，继承浅色/深色主题文字颜色。
不支持或格式错误的 TeX 显示错误标记/原公式，不阻断文章其余内容。

## 安全与翻译边界

- 仍先丢弃原始 HTML 并执行 `rehype-sanitize`，只允许公式识别所需的 code class。
  之后才由受信任的 KaTeX renderer 生成 MathML、SVG 和排版 style，不放宽输入 HTML。
- `trust: false` 禁止作者 TeX 发起 HTML 注入或不安全链接；`maxExpand: 1000`、
  `maxSize: 20` 限制宏展开与异常尺寸。公式宏不会跨文章共享。
- `src/content/remark-math.ts` 是三条链路共享的语法：渲染、OpenCC Materialization、
  Semantic Translation Validation。反斜杠分隔符通过 Markdown Tokenizer 扩展解析，
  保留源文 Offset，不对整篇 Markdown 做正则替换。
- OpenCC 只转换普通 prose，TeX 内容不转换。独立公式不进入付费翻译，带公式的段落
  可以翻译 prose，但目标必须保留公式 AST / TeX 值；不安全目标仍回退 zh-CN。
  Normalization Version 保持 1，没有公式的原 Block Identity 继续复用。
- 已存储的 Locale Materialization 不在发布时批量重写。下次显式 Content Sync 使用
  新的公式保护边界。旧繁体 Materialization 可能已丢失 TeX 分隔符，因此 zh-HK/zh-TW
  文章阅读器使用 PostgreSQL 的权威 `raw_markdown`，通过同一服务端解析器和 OpenCC
  做确定性转换，立即恢复完整公式。英文继续使用已审阅的 Materialization/Block Fallback。
  本功能不发起 Content Push、生产回写或付费 Translation Job。
- 异常公式通过已有结构化 Telemetry 发出 `markdown_math_render_failed`，仅记录
  Locale 和错误数量，不记录公式、文章内容或底层异常。Health/Readiness 不新增依赖。

## 验证与恢复

`tests/unit/markdown-math.test.ts` 覆盖四 Locale / 四种分隔符、表格/列表/目录、代码与
转义、OpenCC 保护、翻译安全、非付费公式块、异常 TeX、XSS、递归宏的有限展开与
跨文章定义隔离。现有翻译/Markdown 测试继续验证未改动 Block Memory Reuse。
Development Seed 的 Blog/Wiki 包含公式。
`tests/e2e/markdown-math.spec.ts` 在关闭浏览器 JavaScript 时验证两个内容类型、
unprefixed + 四 Locale、MathML、同源字体、主题、390px 页面宽度和长公式滚动。

没有数据库 Migration 或 Backup/Restore 行为变更。普通 main Quality Gates → SHA/Digest
镜像 → 服务器完整 Blue-green 发布；失败使用保留版本及同一 Engine 回退。回退仅恢复
旧公式显示能力，不改写 Canonical Markdown 或 Translation Memory。
