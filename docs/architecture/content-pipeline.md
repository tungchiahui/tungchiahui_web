# 内容流水线

## 目标

Markdown 内容更新必须能够在不重新构建 Next.js 应用、也不自动消耗 AI 翻译 Token 的情况下生效。

## 流程

```text
Local Markdown edit
        |
      git push
        |
GitHub content repository
        |
trigger /api/ops/content/sync
        |
durable content-sync job
        |
content-worker
        |
read target Git commit/files
        |
parse + validate
        |
compute legacy-compatible route
        |
transactional PostgreSQL upsert
        |
translation block diff
        |
   +----+-------------------+
   |                        |
hash hit                 hash miss/change
   |                        |
reuse EN                 mark pending
   |                        |
   +-----------+------------+
               |
      publish/revalidate zh-CN
               |
        content sync complete
```

Push Workflow **不会**等待人工翻译。

## Source of Truth 规则

GitHub 中的 zh-CN 内容是权威内容。

数据库必须能够通过该仓库以及翻译生成能力重新构建。

同步是单向的：

```text
GitHub -> PostgreSQL
```

生产网站/Worker 不得向 GitHub Commit、Push、创建 PR 或编辑 Canonical GitHub Content。

## GitHub 访问

Content Worker 可以 Fetch/Read 触发请求所引用的精确 Commit 或文件。

优先使用 Read-only Access。

Trigger 应标识 Source Commit，使 Ingestion 能证明哪个 Git State 生成了当前 Runtime State。

## 幂等性

在 Source Commit 和 Configuration 相同的情况下，Ingestion 不得创建重复内容或重复翻译。

重复导入同一个 Commit 时，除了安全验证外应当是 No-op。

## 变更文件处理

Pipeline 必须区分：

- 新增
- 修改
- 删除
- 移动/重命名

当能够安全判断 Identity 时，Move 应保持 Runtime Continuity。

## Frontmatter

继续接受当前 Minimal Frontmatter Convention。

不要强迫作者填写可以由 Ingestion Pipeline 可靠推导的 Metadata。

## 翻译检测

对 Markdown 进行结构化解析。

按 Semantic Block 维护 Translation State。

保护：

- Code Block
- Inline Code
- URL
- Identifier
- Markdown Syntax
- 未被明确标记为可翻译的 Frontmatter Field

## 英文翻译缺失行为

新修改且没有可复用英文翻译的 Block 标记为 Pending。

在显式翻译完成前：

```text
/en-us/... renders canonical zh-CN for that block
```

已经翻译的 Block 继续显示英文。

Translation Miss 不得阻塞 zh-CN 发布。

## 付费 AI 翻译

Content Sync 永远不会自动调用付费 AI 翻译。

付费翻译由 `docs/operations/translation-operations.md` 中记录的显式 Translation Job 执行。

## 失败行为

可选 Translation 失败时不得破坏已有 Published Translation。

使用 Staged/Transactional Update。

在可行情况下，Content Sync 失败必须保留受影响内容此前有效的 Runtime Version。

## 缓存失效

尽可能只使受影响的 Document/List/Search Cache 失效。

内容发布不得要求 Application Blue-Green Deployment。
