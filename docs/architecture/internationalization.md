# 国际化架构

## 支持的 Locale

```text
zh-cn
zh-hk
zh-tw
en-us
```

Locale Prefix 继续作为 Public Routing 的一部分。

## UI i18n

技术：next-intl。

Canonical UI Message Source：zh-CN。

示例结构：

```text
messages/
├── zh-CN.json
├── zh-HK.json
├── zh-TW.json
└── en-US.json
```

规则：

- TSX 中不得硬编码可复用的用户可见文本
- 使用 Semantic Message Key
- 删除 UI Feature 时删除废弃 Key
- 改变 zh-CN 语义时必须 Review 所有派生 Locale
- UI Message 与应用代码一起部署

## Content i18n

Canonical Content Source：GitHub 中的 zh-CN Markdown。

Runtime Translation 保存于 PostgreSQL。

### 英文

使用 Semantic-block Incremental AI Translation。

Translation System 必须：

- 复用未变化的 Block
- 需要时提供 Contextual Hint
- 保持 Markdown AST Shape
- 维持 Glossary Consistency
- 避免因为局部修改重新翻译整个 Document
- 根据需要记录 Pending/Translated/Failed/Reviewed-like State
- 当 Provider 提供可靠 Usage Data 时记录 Token/Cost Metadata

### 显式付费翻译策略

Content Publication 永远不会隐式调用付费 AI Translation。

Hash Miss 变为 `pending`。

Pending Block 的英文渲染使用最新 Canonical zh-CN Source Block 作为 Fallback。

只有在 Operator 显式请求后才执行 Paid Translation，可以先进行 Dry-run Cost/Token Estimate，并且始终受 Server-side Budget Enforcement 约束。

### zh-HK / zh-TW

使用基于 OpenCC 的 Deterministic Conversion，并在需要时应用明确 Glossary/Exception。

不要维护三份人工编写的 Source Article 副本。

Phase 7 的实现契约：

- `content-worker` 在 Content Ingestion Transaction 内把两种确定性结果物化到 `document_translations`；
- Versioned Glossary 同时提供可审计 Version 和正整数 Persistence Revision；
- 未改变的 Markdown/Hash/Revision 不重写 `generated_at`，同一 Snapshot 可安全重放；
- 只替换 Markdown AST `text` Node 的 Source Range，Frontmatter、Code Fence、Inline Code、Raw HTML 和 Link/Image Destination 不进入转换边界；
- Public DAL 按 Locale 读取物化结果并隔离 Cache Key；Backfill 前允许 Server Renderer 使用同一确定性转换作只读 View，但 Public Request 永不写 DB。

实现与 Backfill 细节见 `docs/development/phase-7-deterministic-locales.md`。

## Locale 切换

在可行情况下，Locale Switch 应保留同一个 Logical Document Route。

选择的 Locale 同时控制：

- UI Message Locale
- Document Translation Locale

Unprefixed Route 与 `/zh-cn/**` 均为 zh-CN。其余批准 Prefix 为 `/zh-hk/**`、`/zh-tw/**`、`/en-us/**`；Locale Switch 只改变 Prefix 并保持 Logical Document Path。`zh-hant` 明确不受支持且不得 Redirect。

## Fallback

缺失英文翻译的 Block 渲染 Canonical zh-CN。

应用应能够区分 Fallback State，用于 Observability/UI Metadata。

不要：

- 仅仅因为一个 Translation Block Pending 就返回 404
- 把过期旧英文显示成最新 zh-CN 改动对应的翻译
- 从 Public Page Request 触发付费翻译

Phase 7 在 Block-level State 建立前使用更严格的全 Document zh-CN Fallback，并明确忽略已有 en-US Materialization；Phase 8 才负责把该基线替换为 Semantic-block Translation Memory 与混合 Fallback。
