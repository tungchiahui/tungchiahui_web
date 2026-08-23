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

## 静态资源

带 Version/Hash 命名的 Asset 应使用长期 Immutable Cache。

使用稳定但可变 Key 的用户上传资源需要明确的 Cache Policy。

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
