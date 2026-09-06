# 技术栈

## 版本策略

核心生产依赖使用：

- 受支持的 Stable Release
- 如果项目提供 LTS Policy，则使用 Active/Maintenance LTS
- 实现中固定 Patch/Minor Version 或 Container Digest
- 使用 Renovate 创建经过 Review 的 Dependency Update PR

Canary、Beta、RC 和 Development Build 不作为生产默认版本。

Renovate 不得绕过 PR 直接修改 `main`。所有升级 PR 通过现有 CI Quality Gates 并同步维护 `pnpm-lock.yaml`；Core Major Update 默认不自动 Merge，Security Update 提高优先级。

## 截至 2026-08-23 的基线

### Runtime 与应用

- Node.js 24 LTS
- Next.js 16.x Active LTS
- React as required by the selected Next.js release
- TypeScript
- pnpm

### UI

- Tailwind CSS 4
- shadcn/ui
- Base UI primitives
- next-intl

### 数据

- PostgreSQL 18
- PGroonga
- PgBouncer
- Drizzle ORM / Drizzle Kit
- Zod 4

### Markdown/内容

- unified
- remark
- rehype
- Shiki
- OpenCC

### 质量

- Biome
- Vitest
- Testing Library
- Playwright

### 基础设施

- Docker
- Docker Compose
- OpenResty
- Ansible
- SOPS + age
- pgBackRest
- SQLite，仅用于 host-local Control-plane Recovery State
- Renovate

### Production Container Baseline

- Docker Image 使用 Multi-stage Build
- Runtime Stage 尽量 Minimal，并使用 Non-root User
- Secret 不 Bake 进 Image
- Production Identity 使用 Git SHA/Image Digest，不使用 `latest`
- 实际可行的 Service 使用 Read-only Root Filesystem
- 必要写路径使用明确的 Writable Volume/tmpfs
- Drop 不需要的 Linux Capability
- `content-worker` 与 `control-api` 无 Docker Socket；仅 `deploy-agent` 获得最小必要 Docker/Host 权限

SQLite 是 ADR 0015 定义的专用 Control-plane State Mechanism，不得用于 Content、Translation、Search 或普通 Application Runtime Data。

### 本地 S3 模拟

使用 Adobe S3Mock 进行 Hermetic Local Development/Integration Testing。

理由：

- 专门为 S3 API Mock 设计
- Docker-friendly
- Deterministic Local Environment
- 不依赖生产 AList
- 适合 Integration Testing

必须另有一套 Provider-neutral Storage Contract Suite，可由配置指向任意明确授权的 S3-compatible 非生产 Target。当前 Production Provider 选用 AList，因此 Production-readiness Evidence 必须包含同一 Suite 在 AList 非生产 Test Bucket 上的结果；Adapter、CLI、Environment Variable 和 Domain Type 不得绑定 AList。

## 未经 ADR 禁止替换

不要随意引入如下平行替代方案：

- Vue/Nuxt Runtime Code
- 另一套 CSS Framework
- 另一套 ORM
- 另一种 Relational Database
- 第二套 Object-storage Abstraction
- 第二套 i18n Framework
- 第二个 Production Search Engine

新工具必须解决已经证明存在的缺口；如果它与现有职责重叠，则必须获得 Architecture Decision。
