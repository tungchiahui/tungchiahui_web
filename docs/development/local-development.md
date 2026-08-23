# 本地开发

## 支持的入口

```bash
./site dev
```

这是正常的开发命令。

## Host Prerequisite

尽量减少 Host Prerequisite：

- Docker Engine / Docker Desktop compatible runtime
- Git
- Node.js 24 LTS
- 通过 Corepack 或文档化安装方式提供 pnpm

在可行情况下，其他 Infrastructure Dependency 通过 Container 运行。

## 本地拓扑

```text
Next.js dev server     localhost:3000
        |
        +---- PostgreSQL Dev
        |
        +---- S3Mock Dev
```

为避免冲突，实际映射的 PostgreSQL/S3Mock Port 可以配置。

## `./site dev` 做什么

1. 校验所需 Developer Tool
2. 在安全时创建 Local Configuration
3. 启动 Development PostgreSQL
4. 启动 S3Mock
5. 等待 Health
6. 创建所需 Test/Dev Bucket State
7. 运行当前 DB Migration
8. 应用幂等的 Development Seed Data
9. 启动 Next.js Dev Server
10. 报告 Endpoint 和 Service Status

## 隔离

本地开发不得要求：

- Production DB Password
- Production S3 Write Credential
- Production Translation Secret，除非正在显式测试该 Integration

默认 Local Configuration 必须降低意外访问 Production 的可能性。

## 本地数据

为了方便，Developer Data 可以在多次 `./site dev` 之间持久保存。

Automated Test Data 不得共享同一个 Database/Volume。

## Reset

CLI 应提供一个显式的 Destructive Reset Command，例如：

```bash
./site dev reset
```

删除 Local Data 前必须明确标识 Environment。

绝不能把 Destructive Reset Behavior 隐藏在普通 `dev` Start 中。

## 本地后台任务

开发 Content/Translation Job 行为时，`./site dev` 还应支持本地等效的 `content-worker`。

Local Translation Test 默认使用 Fake/No-cost Provider。

普通本地开发不需要 Production Paid AI Credential。
