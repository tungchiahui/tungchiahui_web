# Blue-Green Deployment

## 拓扑

```text
                  OpenResty
                      |
               active upstream
                 /          \
           Blue :3001    Green :3002
                 \          /
                  \        /
                    PgBouncer
                        |
                    PostgreSQL
```

正常运行时恰好只有一个 Slot 为 Public Traffic 的 Active Slot。

Inactive Slot 用于下一次 Release 或保留 Rollback。

## Endpoint

每个 Application Version 必须暴露：

```text
/api/health
/api/ready
/api/version
```

### Health

回答 Process 是否存活并且内部功能正常。

### Readiness

回答当前 Instance 是否可以安全接收 Production Traffic。

Readiness 可以检查 Database Access 等 Critical Dependency。

避免让非关键第三方依赖决定 Readiness，否则这些依赖不应能够让整个网站下线。

### Version

返回 Deployment Identity，例如：

```json
{
  "commit": "c904e21",
  "slot": "green",
  "buildTime": "..."
}
```

## Cutover

OpenResty Active-upstream Configuration 原子切换并安全 Reload。

Reload 前先验证 Configuration。

## Smoke Test

Cutover 前：

- Health
- Readiness
- Version
- Homepage
- Representative Article
- Locale Route
- Search
- Static Asset Fetch

Cutover 后，通过真实 Production Entry 重复关键 Public-path Check。

## Rollback

Rollback 是 Traffic Switch，而不是 Rebuild。

在新 Release 通过定义的 Stabilization Policy 前，Previous Slot 保持完整。

## 数据库兼容性

两个 Slot 在访问同一个 Database 时可能短时间重叠。

因此，相邻 Release 之间的 Application/Database Compatibility 是强制要求。
