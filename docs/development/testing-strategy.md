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
2. 指定的 S3-compatible Non-production Test Bucket

Suite 与配置、CLI、Report Contract 必须保持 Provider-neutral。当前生产部署选择 AList，所以 Phase 11 的真实 Provider Evidence 使用 Owner 指定的 AList 非生产 Bucket；这不允许把 Adapter 或配置命名绑定到 AList。

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

Phase 2 已实现 Disposable Infrastructure Entry Point；Phase 3 已加入真实 Migration/Role/PgBouncer Suite 和真实 Migration/Seed Hook。Phase 6 已用真实 Playwright Suite 替换 Placeholder，覆盖 zh-CN Home/Blog/Wiki、Legacy Route、Markdown、S3Mock Asset、Special Page、Health/Ready/Version、404、Metadata 与 Client Secret Negative Scan。该 Suite 对共享的 Disposable Runtime/Cache 串行执行，并在任一失败时输出 Web Log 后清理全部资源。

Phase 12 在 Unit 与 Disposable Application Integration 之间加入独立 Production-foundation Gate。它使用提交锁定的 Ansible/SOPS/age/Compose Toolchain，在临时 Host Root 上生成真实 age 密文、构建 Git-SHA 标识的 Production Image、执行两次 Provision，并验证第二次 `changed=0`。同一 Gate 检查 Image History、Container User/Readonly/Capability/Socket、四个数据库登录身份、OpenResty Validation/Reload、IPv4+IPv6 和 Next Slots 全停后的独立 Control Route；只绑定临时本机端口，不承载 Public Traffic。

Phase 13 另加入 `test:recovery`：构建固定 pgBackRest 版本的 PostgreSQL/Recovery Image，启动一次性 PostgreSQL 和两套独立 S3Mock，执行真实 Full/Differential/Incremental、WAL Archive、双副本逐对象校验、从异地副本重建 Repository、指定时间 PITR、Version/Schema/代表性应用读取，以及加密 Control-state SQLite Restore。所有 Destructive 操作都要求一次性 Target Marker；Gate 不读取生产 Credential，也不访问真实 AList/R2。

Phase 14 扩展 `test:infra`：在同一临时 Host Root 和 Hardened Compose 中先 Migration/Seed/Reindex，再通过签名 Control API 执行真实 Inactive Green Deploy、全部 Candidate/Public Smoke、OpenResty Cutover、Retained Blue Rollback、Missing Digest Failure 和 PostgreSQL-down Dependency Failure。Unit Gate 注入 Pre/Post Smoke、Invalid Config 与四个 Crash Phase；Migration Suite 继续证明 Previous Schema/Blue-Green Overlap。测试不启用 Public Production Traffic。

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

Phase 13 Unit/HTTP Gate 还覆盖 Repository Corruption、Restore Target Marker/Environment/Confirmation、PostgreSQL-down Operation Create/Query/Claim、Lease/Reconcile、Break-glass 共用 SQLite/Audit，以及 Control-state Snapshot Integrity/Schema/Audit Continuity。

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

Phase 6 在此基础上增加缓存副作用 Failure Gate：预热 Route Cache，提交新 Snapshot，注入一次 Revalidation Failure，断言 PostgreSQL Job 保存 `side_effects` Progress、Retry 不重复 Fetch/Materialize，并在无 Rebuild/Restart 下读到新正文。

Phase 8 增加 Semantic-block/Translation Memory Gate：位置变化不改变身份；AST/Code/URL/Identifier 必须保持；Hash Hit 全局复用；Hash Miss Pending；局部 Change 只回退当前 Block；Superseded Pending 变 Stale；Targeted Patch Context 保留；同 Snapshot/Delta 重放不重复 Row、Mapping 或 Hook。真实 Public E2E 同时覆盖 full fallback 与 mixed en-US State。所有这些 Path 结构上不导入 Provider，并记录 `providerCalls: 0`。

Phase 9 在同一 Disposable Stack 增加 Control API Translation Create/Idempotency/Read/List、四种 Scope、Force Confirmation、Dry-run 零调用、逐请求 Budget Stop/Partial、Cancellation、Provider Failure Retry、Revalidation Failure Resume、Published reviewed Translation Preservation，以及 Token/Cost/Provider/Model Audit。Phase 9 数据变更在 Public E2E 之后运行，避免测试互相污染。Automated Suite 只使用 Fake Provider；真实 Provider Contract Test 必须先获得明确的非生产 Target 与付费授权。

Phase 10 在同一 Disposable Stack 先通过 PostgreSQL Durable Job 重建四 Locale Search Projection，再验证 PGroonga Query Plan/`REINDEX`、Concurrent Claim、Retry、Locale Isolation、Exact Title/Heading/Body/中文/English/Mixed Identifier Ranking、Snippet/Public Contract/Secret Negative、真实 Content Update 后精确 Search Cache Invalidation。Playwright 验证 Localized Search Page/API/Route 和 Client Bundle 不含完整 Corpus。

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
