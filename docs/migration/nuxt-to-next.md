# 从旧 Nuxt 迁移到 Next.js V2

## 策略

创建一个新的 Next.js Repository。

在 V2 被证明可用之前，旧 Nuxt Repository 继续作为只读参考资料。

不要执行 In-place Framework Conversion。

## 迁移原则

迁移**行为与契约**，而不是实现风格。

示例：

```text
Nuxt Content query       -> PostgreSQL content repository
Vue component            -> new React implementation
Nuxt static generation   -> runtime DB-backed rendering/cache
legacy i18n generation   -> next-intl UI + runtime content translation
EdgeOne Blob data        -> deliberate new storage model where still required
```

## Discovery 阶段

实现 Feature 前，盘点旧 Repository：

- 所有 Public Route
- Page List
- Component
- 重要 Visual Identity
- Content Metadata Behavior
- Pinyin Path Generation
- Locale Behavior
- Search Behavior
- Edge/Server Function
- External Integration
- Static Asset
- Deployment Assumption

生成 Feature Matrix：

```text
MUST KEEP
SHOULD KEEP
MAY REDESIGN
MAY REMOVE
```

对有歧义的用户可见 Feature 询问 Owner。

## URL 兼容性

首要目标：

```text
old URL == new URL
```

优先复现 Route-generation Behavior，而不是添加 Redirect。

只有确实无法合理保留时才创建 Redirect。

## 视觉迁移

默认不要像素级复制 Legacy UI。

保留：

- 可识别 Identity
- Essential Information Architecture
- 重要 Interaction

允许通过 Tailwind + shadcn/ui/Base UI 现代化。

## 内容迁移

不要强迫使用新的 Authoring Structure。

保持当前：

- Content Directory Layout
- Minimal Frontmatter Approach

导入新的 PostgreSQL Runtime Model。

## Cutover

1. 旧 Production 正常运行
2. 并行验证 V2
3. Import/Sync Current Content
4. Verify URL Sample
5. Verify Analytics-sensitive Route
6. 执行 Production Smoke Test
7. Switch Public Origin/Upstream
8. 在 Stabilization Period 保留 Legacy Rollback Option
