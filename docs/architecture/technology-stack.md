# 技术栈

## 版本策略

核心生产依赖使用：

- 受支持的 Stable Release
- 如果项目提供 LTS Policy，则使用 Active/Maintenance LTS
- 实现中固定 Patch/Minor Version 或 Container Digest
- 经过 Review 的自动升级

Canary、Beta、RC 和 Development Build 不作为生产默认版本。

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

### 本地 S3 模拟

使用 Adobe S3Mock 进行 Hermetic Local Development/Integration Testing。

理由：

- 专门为 S3 API Mock 设计
- Docker-friendly
- Deterministic Local Environment
- 不依赖生产 AList
- 适合 Integration Testing

必须另有一套 Storage Contract Suite 在 AList 非生产 Test Bucket 上运行，因为任何 S3 Emulator 都不能保证与每个 S3-compatible Implementation 完全一致。

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
