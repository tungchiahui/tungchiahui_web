# 生产部署

## Deployment Identity

每个已部署 Application Image 都是 Immutable，并由 Git Commit SHA 标识。

概念上的 Identity 示例：

```text
web:c904e21
```

不得使用 `latest` 作为 Deployment 或 Rollback 的 Source of Truth。

## 入口

Human-triggered：

```bash
./site deploy
```

CI-triggered：

CI Workflow 向同一 Control Plane 完成认证，并调用同一底层 Deployment Implementation。

正常 Remote Operation 使用：

```text
https://www.tungchiahui.cn/api/ops/deployments
```

它不需要直接使用 Public IP 寻址，也不需要直接访问 Production DB。

## Control/Execution 分离

HTTP Endpoint 校验并创建 Durable Deployment Job。

内部 `deploy-agent` 执行高权限 Deployment Action。

不得向 Content Translation Worker 授予 Docker/OpenResty Permission。

## High-level Flow

```text
Git commit
   |
CI build/test
   |
immutable image
   |
deployment job
   |
deploy-agent preflight
   |
inactive slot start
   |
health/readiness/smoke
   |
OpenResty cutover
   |
post-cutover smoke
```

## Preflight

操作 Inactive Slot 前：

- Target Image 存在
- Production Config Validation 通过
- Encrypted Secret 可以 Resolve
- Database 可达
- Required Migration State 已知
- Backup Policy 满足 Migration Risk 要求
- Active Slot 和 Rollback Target 已确认
- Disk Space 足够

## Deployment Failure

Traffic Cutover 前：

- 保持 Active Slot 不变
- 安全时拆除 Failed Inactive Candidate
- 报告 Failure
- 不切流

Traffic Cutover 后：

- 如果 Post-cutover Check 失败，并且 Schema 仍兼容 Rollback，立即切回 Previous Slot
- 保留 Evidence/Log 供诊断

## Application Deploy 与 Content Publish

Content Ingestion 不需要 Blue-Green Application Deployment。

Application Deployment 用于：

- Code
- UI
- Style
- Runtime Behavior
- API Behavior
- Schema-compatible Application Change

Content Push 和 Translation 是独立的 Durable Job Flow。
