# 测试策略

## 测试层级

### Unit Test

使用 Vitest 测试纯逻辑：

- Pinyin Route Generation
- Frontmatter Normalization
- Content Hashing
- Translation Segmentation
- Locale Conversion Helper
- Cache-key Generation
- Configuration Parsing

### Integration Test

使用 Disposable Infrastructure 测试：

- PostgreSQL Repository Behavior
- Drizzle Query
- Migration
- Content Ingestion
- PGroonga Search
- 通过 S3Mock 的 S3 API Interaction

### Storage Contract Test

专门的 Test Suite 对以下两者运行相同 Storage Behavior：

1. Local S3Mock
2. 指定的 AList Non-production Test Bucket

至少测试：

- PUT
- GET
- HEAD
- DELETE
- Listing/Prefix
- Overwrite Semantics
- Metadata
- Content-Type
- Cache-Control
- 应用实际依赖的 ETag Expectation
- Unicode Key
- Missing-key Behavior
- 代表性的 Object Size

### E2E

使用 Playwright。

Critical Flow 包括：

- Homepage
- Blog/Wiki Article Rendering
- Locale Switching
- Legacy-compatible Route
- Search
- Asset Loading
- Error Page
- Health/Readiness Smoke

## 一键测试

```bash
./site test
```

Test Command 必须：

1. 分配独立 Test Project/Container Name
2. 启动 Disposable PostgreSQL
3. 启动 Disposable S3Mock
4. 从零执行 Migration
5. Seed Deterministic Fixture
6. 运行 Integration/Unit Suite
7. 在需要时启动 Production-like App
8. 运行 Playwright
9. 即使失败也执行 Cleanup

## Migration Test

CI 必须测试：

- Empty DB -> Latest
- Previous Production Schema -> Latest
- Blue Application Against Expanded Schema
- 在可行时测试 Green Application Against Expanded Schema

## Restore Test

Restore Drill 属于 Operations，但它们是 Backup Validity 的自动化测试。

从未被恢复过的 Backup 不可信。

## Control-plane Test

测试：

- Authentication Failure
- Authorization/Capability Boundary
- Idempotency/Replay Handling
- Job Creation
- Job Status
- `Cache-Control: no-store`
- 长时间 Work 不在 Request 中 Inline 执行

## Translation-cost Test

普通 Automated Test 使用 Fake Translation Provider。

验证：

- Content Sync 创建 Pending Segment，但不调用 Paid Provider
- Dry-run 产生零次 Paid Provider Call
- Budget 在超过配置上限前停止新 Request
- Public Article Rendering 无法调用 Translation Provider
- Pending Block 渲染 Canonical zh-CN Fallback

## Directionality Test

Automated Production/Content Module 不得要求 GitHub Write Credential。

在可行情况下，应通过 Dependency Boundary 从结构上让 Production Content Worker 无法执行 GitHub Write Operation。
