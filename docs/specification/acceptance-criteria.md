# 验收标准

Website V2 在满足以下标准之前，不视为 Production-ready。

## 本地开发

- [ ] `./site dev` 能启动可工作的本地系统。
- [ ] Local PostgreSQL 与 Production 隔离。
- [ ] Local S3Mock 与 Production 隔离。
- [ ] Migration 自动运行，或给出明确且可操作的 Failure。
- [ ] Development Seed Content 可用。
- [ ] Next.js 在文档指定的 Local Port 启动。
- [ ] Stack 的 Stop/Restart 是 Deterministic 的。

## 代码质量

- [ ] 应用中没有 `.js` 或 `.jsx` 文件。
- [ ] 启用 TypeScript Strict Option。
- [ ] 没有未记录说明的 `any`。
- [ ] 没有未记录说明的 `@ts-ignore`。
- [ ] Biome 通过。
- [ ] Typecheck 通过。
- [ ] Production Build 通过。

## 内容

- [ ] 当前 Content Directory Structure 可以导入。
- [ ] 当前 Frontmatter 可以在不强迫增加额外 Authoring Field 的情况下导入。
- [ ] Changed Markdown 能 Idempotently Update 对应 Runtime Record。
- [ ] Deleted Source Content 被安全处理。
- [ ] Pinyin Route 在测试 Sample 中与 Legacy Behavior 一致。

## i18n

- [ ] UI 支持全部四个 Locale。
- [ ] Content 支持全部四个 Locale。
- [ ] English Translation 复用未改变的 Semantic Block。
- [ ] Code Fence/Inline Code/URL 在翻译后保持不变。
- [ ] zh-HK/zh-TW Conversion 通过代表性 Glossary Test。

## Search

- [ ] 中文 Query 返回相关中文 Document。
- [ ] 英文 Query 返回相关英文 Translation。
- [ ] Result URL 与 Locale Routing 匹配。
- [ ] Search 不需要把整个 Corpus 发送到浏览器。

## S3

- [ ] Local Storage Integration 对 S3Mock 通过。
- [ ] Storage Contract Suite 对指定 AList Test Bucket 通过。
- [ ] Local Test 不使用 Production Credential。

## Deployment

- [ ] Image 是 Immutable 且通过 Git SHA 标识。
- [ ] Inactive Slot 可以独立部署。
- [ ] Cutover 前 Health/Readiness Check 通过。
- [ ] Cutover 前 Smoke Test 通过。
- [ ] OpenResty 原子切换 Traffic。
- [ ] 执行 Post-cutover Smoke Test。
- [ ] Rollback 无需 Rebuild Image 即可切回。

## Database

- [ ] Clean Database 能从零 Migrate 到当前 Schema。
- [ ] 从 Previous Production Schema 升级的 Test 通过。
- [ ] Blue/Green Application Version 可以在 Migration 期间重叠运行。
- [ ] Destructive Migration 延后到后续 Contract Phase。

## Recovery

- [ ] Automated Backup 成功。
- [ ] WAL Archive Health 被监控。
- [ ] Restore Drill 能恢复到 Disposable Database。
- [ ] Restore 后 Integrity Check 通过。
- [ ] R2 Replica 独立于 Primary Backup Location 存在。

## Server Migration

- [ ] New Server 可以 From Code Provision。
- [ ] Same-major PostgreSQL Migration 支持 Physical Streaming Replication。
- [ ] 最终 Planned Switchover 达到 Near-zero Downtime。
- [ ] Migration Workflow 包含明确 Abort Criteria。

## Control Plane / Network

- [ ] `./site` Production Command 使用 `www.tungchiahui.cn/api/ops/*`，而不是家庭公网数字 IP。
- [ ] Edge/Origin Configuration 使用 `ddns.tungchiahui.cn` 作为 Production Origin Hostname。
- [ ] 没有 Durable Application/CI Config 需要 Public IPv4。
- [ ] Architecture Test/Documentation 覆盖 IPv6-only Origin Behavior。
- [ ] `/api/ops/*` 不可缓存且具有强认证。

## Translation Cost Control

- [ ] Content Push 在不等待 AI Translation 的情况下完成。
- [ ] Content Push 不调用 Paid AI Translation Provider。
- [ ] Hash Miss 变为 Pending。
- [ ] Pending en-US Block 渲染当前 zh-CN Fallback。
- [ ] `./site translate ... --dry-run` 不产生 Paid Request。
- [ ] 显式 Execution 接受 Budget。
- [ ] Budget Enforcement 在 Production Worker 中执行。
- [ ] Public Article Request 无法触发 Paid Translation。
- [ ] GitHub Manual Translation Workflow 不阻塞普通 Push/Content Sync。

## GitHub One-way Flow

- [ ] Production 能读取所需 GitHub Commit。
- [ ] Production Content Code 不存在自动 Commit/Push/PR Path。
- [ ] Database Change 无法自动覆盖 Canonical GitHub Markdown。

## Worker Separation

- [ ] content-worker 没有 Docker/OpenResty Administrative Permission。
- [ ] deploy-agent 不需要 Paid AI Translation Credential。
