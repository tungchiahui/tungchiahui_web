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

Phase 2 已实现 Disposable Infrastructure Entry Point；Phase 3 已加入真实 Migration/Role/PgBouncer Suite 和真实 Migration/Seed Hook。Affected Critical-flow E2E 在 Phase 6 到来前继续以 `NOT_IMPLEMENTED` 明确报告，不会伪装为已通过。

## Migration Test

CI 必须测试：

- Empty DB -> Latest
- Previous Production Schema -> Latest
- Blue Application Against Expanded Schema
- 在可行时测试 Green Application Against Expanded Schema

Phase 3 还验证 Migration Metadata/Backup Policy、Applied SQL Hash/Timestamp、Application/Worker Role Grant、非法 Locale/Job Type/JSON Payload Constraint，以及 Previous-schema Representative Row 在 Expand 后仍存在。

## Restore Test

Restore Drill 属于 Operations，但它们是 Backup Validity 的自动化测试。

从未被恢复过的 Backup 不可信。

## Control-plane Test

Phase 4 已把以下项纳入 Unit 与 Disposable Integration；后续 Phase 在扩展真实执行能力时继续保持这些 Gate：

- Authentication Failure
- Authorization/Capability Boundary
- Idempotency/Replay Handling
- Job Creation
- Job Status
- `Cache-Control: no-store`
- 长时间 Work 不在 Request 中 Inline 执行
- OpenResty 将 `/api/ops/*` 直接路由到独立 `control-api`，而不是 Next.js Slot
- 两个 Next.js Slot 不可用时，Status/Deploy/Rollback Control Path 仍可工作
- Production PostgreSQL 不可用时，Deploy/Rollback/Restore/Recovery Operation 仍可创建、恢复并查询
- SQLite Transaction、Lock/Lease、Crash Restart/Resume 与 Audit Record
- Content/Translation/Search Job 仍使用 PostgreSQL，且在数据库不可用时安全失败

Phase 5 在同一 Disposable Integration 增加 PostgreSQL Application-job Execution Gate：`FOR UPDATE SKIP LOCKED` 并发 Claim、Retry/Attempt/Progress、Representative Minimal Frontmatter、同 Commit Idempotency、Add/Modify/Delete/Move、Identity Continuity、批准 Alias、Pinyin Collision 原子失败与旧 Runtime Snapshot 保留。GitHub Adapter Unit Test 断言精确 Tree/Blob Snapshot 只发出 `GET`，拒绝 Truncated Tree/Blob Hash Drift，且 Content Execution Module 不导入 AI Provider、Build/Deploy Process 或 GitHub Write Capability。

## Deployment Pipeline Test

验证 Web Application Repository 的 `main` Workflow 必须在全部 CI Quality Gates 通过后才 Build Git-SHA-tagged Immutable Image，并调用与 `./site deploy` 相同的 Control Plane/Deployment Engine。验证 Content Repository Push 只触发 Content Sync，不触发 Next.js Build 或 Blue-Green Deployment。

## Container Hardening Test

CI/Smoke Test 验证 Production Image 的 Runtime User 非 Root、构建为 Multi-stage/Minimal Runtime、没有 Bake-in Secret、没有 `latest` Production Identity，并在标记为 Read-only 的 Service 上验证 Root Filesystem 不可写。权限测试验证 `content-worker`/`control-api` 无 Docker Socket，`deploy-agent` 只拥有声明的最小能力。

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
