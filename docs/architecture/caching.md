# 缓存架构

## 目标

- 加快重复读取
- 可确定性地执行缓存失效
- 避免发布后仍读取到过期内容
- 避免内容发布与应用重新构建耦合

## 层级

可能的层级：

```text
Edge/CDN cache
      |
OpenResty
      |
Next.js application cache
      |
PostgreSQL / S3
```

## 内容

Content Ingestion 应尽量只使受影响的 Cache Key/Route 失效。

不要只依赖任意 TTL 来保证发布正确性。

### Phase 6 已实现契约

| Cache | Owner | Key / Tag | TTL | Invalidation |
| --- | --- | --- | --- | --- |
| Article | Next.js Web | Canonical Route；`content:route:<route>` | 无任意 TTL | Change 的当前/旧 Route Tag 与 prefixed/unprefixed Path |
| Blog/Wiki List | Next.js Web | Content Type；`content:list:<type>` | 无任意 TTL | 受影响 Content Type Tag 与 List Path |
| Homepage | Next.js Web | `/`、`/zh-cn` Route Cache | 无任意 TTL | 每次非空 Content Change 精确 Revalidate 两条 Home Path |
| Owner Dataset | Next.js Web | Dataset Key；`owner-dataset:<key>` | 无任意 TTL | 由对应 Owner Write Path 失效；Phase 6 只建立 Public Read |

Content Worker 对严格 Zod Payload 执行 HMAC-SHA256 签名后调用 `/api/internal/revalidate`。Secret 只存在 Server/Worker Environment，不进入 Client Bundle。Endpoint 使 Article/List Tag 和 Home/List/Article 的 zh-CN prefixed/unprefixed Path 失效，并输出不含 Secret 的结构化事件。

Materialization Transaction 与 Side-effect Delivery 之间发生故障时，既有 PostgreSQL `operational_jobs.progress` 保存精确 `side_effects` 输入。Worker Retry 只重放幂等 Hook，不重新 Fetch 或重写已提交正文。这样 Content Publish 不依赖 Next.js Rebuild，同时不会因同 Commit 再摄取成为 No-op 而漏失效。

## 静态资源

带 Version/Hash 命名的 Asset 应使用长期 Immutable Cache。

使用稳定但可变 Key 的用户上传资源需要明确的 Cache Policy。

Phase 6 Local `/api/assets/**` Gateway 只接受经过 Validation 的 Object Key，并通过 S3Mock 验证 Content-Type 与读取行为。它不是 Phase 11 AList Production Contract 的替代证据。

## UI/应用资源

Next.js 生成的 Hashed Asset 可以使用长期 Immutable Cache。

## 缓存正确性

每一层 Cache 都必须明确：

- Owner
- Key Definition
- Invalidation Behavior
- TTL（如果有）
- Observability

不得增加未追踪的临时 In-memory Cache，从而造成 Multi-slot 不一致。
