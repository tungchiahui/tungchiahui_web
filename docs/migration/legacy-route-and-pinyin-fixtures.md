# Legacy Route and Pinyin Fixtures

> Status: Owner accepted Phase 0 fixture baseline
> Evidence repository: `/home/tungchiahui/UserFolder/MySource/my-blog`
> Evidence commit: `d33e9ee5f90a266207f9f9658a47031eafdb981a`

本文件固定 Legacy Route-generation Behavior 与后续自动化验证输入。它记录行为，不授权复制 Nuxt/Vue 实现。

## 1. Route Source Priority

### Blog

1. Frontmatter `sourcePath`（Legacy Runtime-generated field）或 `path`；
2. 去掉 Filename 的 `YYYY-MM-DD-` 后执行 Pinyin Slug；
3. 若仍为空，回退完整 Filename 的 Pinyin Slug；
4. 最后回退 `post`。

当前 4 个 Blog File 全部有显式 `path`，所以其 Exact Route 不得重新 Pinyin 化：

| Source | Expected unprefixed Route |
| --- | --- |
| `content/posts/2026-01-06-新博客启用.md` | `/blog/newblogenable!` |
| `content/posts/2026-01-14-W311MI_AX300驱动.md` | `/blog/w311mi_ax300` |
| `content/posts/2026-02-09-新的todolist界面.md` | `/blog/newtodolist` |
| `content/posts/2026-07-21-VSCode任务栏启动Codex插件打不开.md` | `/blog/vscode-taskbar-codex-fix` |

### Wiki

- Document Slug：顶层目录完整名称执行 Pinyin Slug；日期不移除。
- Chapter Slug：每个相对 Path Segment 执行同一 Pinyin Slug。
- 最后 Segment 为 `index` 时，从 Public Route 移除。
- `DDDD-`/`DDDD-DDDD-` Chapter Order 保留在 URL。
- Locale Route 只在完整 unprefixed Route 前增加 `/<locale>`。

## 2. Pinyin Algorithm Contract

Legacy `toPinyinSlug` 的行为：

1. 只移除 `^\d+\.` Sort Prefix；不会移除日期或 `0100-` Chapter Prefix。
2. `pinyin-pro` 配置为 `toneType: 'none'`、`type: 'array'`、`nonZh: 'consecutive'`。
3. Token 用 `-` 连接并转小写。
4. 非 `[a-z0-9]` 连续字符变为单个 `-`。
5. 去掉首尾 `-`。

Dependency Version 变化可能改变 Transliteration；Phase 5 必须锁定 Fixture，而不能只依赖“仍叫 pinyin-pro”。

## 3. Representative Slug Fixture

| Category | Input | Expected Slug |
| --- | --- | --- |
| 普通中文 | `中文转拼音` | `zhong-wen-zhuan-pin-yin` |
| Mixed Identifier | `W311MI_AX300驱动` | `w311mi-ax300-qu-dong` |
| C++ punctuation | `C++开发环境搭建与测试` | `c-kai-fa-huan-jing-da-jian-yu-ce-shi` |
| Chapter order | `0100-编译环境准备` | `0100-bian-yi-huan-jing-zhun-bei` |
| Full-width punctuation | `0500-其他参考资料添加USB和硬盘格式还有网卡教程：` | `0500-qi-ta-can-kao-zi-liao-tian-jia-usb-he-ying-pan-ge-shi-hai-you-wang-ka-jiao-cheng` |
| Dot punctuation | `Boost.Aiso` | `boost-aiso` |
| Underscore | `ROS2_Control` | `ros2-control` |
| Repeated underscore | `OpenCV__CUDA环境搭建` | `opencv-cuda-huan-jing-da-jian` |
| ASCII words/punctuation | `new blog enable!` | `new-blog-enable` |
| Mixed Chinese/ASCII | `你好，world!` | `ni-hao-world` |
| Date retained | `2026-02-16-Flutter教程` | `2026-02-16-flutter-jiao-cheng` |
| Index sentinel | `index` | `index`，但 Wiki 最后 Segment 会被移除 |

## 4. Representative Route Fixture

| Category | Source | Expected Route |
| --- | --- | --- |
| Explicit Blog special character | `content/posts/2026-01-06-新博客启用.md` | `/blog/newblogenable!` |
| Wiki index | `content/wiki/2021-09-16-OpenWrt编译教学/index.md` | `/wiki/2021-09-16-openwrt-bian-yi-jiao-xue` |
| Chinese punctuation | `content/wiki/2021-09-16-OpenWrt编译教学/0500-其他参考资料添加USB和硬盘格式还有网卡教程：.md` | `/wiki/2021-09-16-openwrt-bian-yi-jiao-xue/0500-qi-ta-can-kao-zi-liao-tian-jia-usb-he-ying-pan-ge-shi-hai-you-wang-ka-jiao-cheng` |
| C++ | `content/wiki/2023-10-05-Cplusplus教学/0100-C++开发环境搭建与测试.md` | `/wiki/2023-10-05-cplusplus-jiao-xue/0100-c-kai-fa-huan-jing-da-jian-yu-ce-shi` |
| Nested chapter | `content/wiki/2023-12-30-ros2-tutorial/1300-0100-0100-Boost.Aiso.md` | `/wiki/2023-12-30-ros2-tutorial/1300-0100-0100-boost-aiso` |

对任意 approved Locale `<locale>`（`zh-cn`、`zh-hk`、`zh-tw`、`en-us`），Expected Locale Route 是 `/<locale>` + 上表 Route。Unprefixed Route 继续表示 zh-CN Compatibility Route。

Owner 已明确批准移除 Legacy `zh-hant`。V2 不生成 `zh-hant` Fixture，不提供 Alias/Redirect；Phase 7/18 必须断言代表性 `/zh-hant/**` Route 不会解析为 Content Page。

## 5. Collision Fixture 与 Current Result

以下两个不同输入产生同一 Slug：

| Input | Slug |
| --- | --- |
| `重复 标题` | `chong-fu-biao-ti` |
| `重复-标题` | `chong-fu-biao-ti` |

Legacy Code 没有 Suffix、Hash、Alias 或 Error Strategy。当前 237 个 Canonical Content Source 重放结果为：

```text
route_count=237
unique_route_count=237
collision_count=0
```

Owner 已接受正式 Collision Strategy：在任何写入前检测完整候选 Route Set；发现 Collision 时整次 Ingestion 失败并报告冲突 Source，不写入部分结果，不自动选择 `-2`、Hash、覆盖或 Redirect。等待 Owner 修改 Source 使 Route 唯一后再重试；这项决定不新增 Frontmatter Field 或 URL Scheme。

## 6. Explicit Wiki Alias Fixture

这些 Alias 来自 Legacy 的显式表，只应用于 Wiki Index：

| Canonical Wiki Route | Legacy Alias |
| --- | --- |
| `/wiki/2024-01-21-arm-keil-mdk6-jiao-cheng` | `/wiki/arm-keil-mdk6-tutorial` |
| `/wiki/2026-02-16-flutter-jiao-cheng` | `/wiki/flutter-tutorial` |
| `/wiki/2024-10-03-docker-jiao-cheng` | `/wiki/docker-tutorial` |
| `/wiki/2024-03-30-linux-jiao-cheng` | `/wiki/linux-tutorial` |
| `/wiki/2025-07-01-jekyll-jing-tai-wang-zhan-kuang-jia` | `/wiki/jekyll-framework` |
| `/wiki/2025-07-18-linux-stm32-cmake-vscode-huan-jing-da-jian` | `/wiki/linux-stm32-cmake-vscode` |
| `/wiki/2023-09-29-ji-qi-ren-gong-cheng-shi-cheng-zhang-ji-hua` | `/wiki/roboengineer_plan` |

Phase 5/6 必须验证 Alias 仅在需要时存在且不扩张为默认 Redirect Map。

Phase 6 结果：真实 App Router 通过代表性 Canonical/Alias 响应；精确七条 Allowlist 继续由 Unit Fixture 固定，Runtime 只为当前 Snapshot 中存在的 Canonical Document 建立 Alias。未增加 Redirect Map。

## 7. Static ROS2 Route Fixture

权威集合定义为 Legacy Evidence Commit 上：

```bash
git -C /home/tungchiahui/UserFolder/MySource/my-blog \
  -c core.quotePath=false \
  ls-files 'public/docs/ros2/**/*.html'
```

发现时该集合有 311 个 Route。Owner 已将全体 Route 分类为 MUST KEEP。每个 tracked file `public/<path>.html` 对应 Public Route `/<path>.html`，包括：

```text
/docs/ros2/core/index.html
/docs/ros2/application/index.html
```

及其所有 Chapter/Subchapter HTML。Canonical ROS2 Content 直接链接上述两个 Index。

## 8. Full-set Verification Method

每个 MUST KEEP Content Route 都通过以下明确方法覆盖，而不是只检查代表性样本：

1. Pin Legacy Commit `d33e9ee5f90a266207f9f9658a47031eafdb981a`。
2. 枚举 tracked `content/posts/*.md` 与 `content/wiki/*.md`，应为 237。
3. 对 Blog 应用“显式 `path` 优先”；对 Wiki 应用本文件 Algorithm。
4. Assert 237 个 Source 均得到非空 Route，且 Route Set 为 237 个唯一值。
5. 对每个 approved Locale 生成 Locale-prefixed Expected Route；另保留 unprefixed zh-CN Route。
6. 加入 7 个显式 Wiki Alias。
7. 加入全部 311 个 MUST KEEP Static ROS2 HTML Route。
8. Phase 5 用同一 Input 验证 Ingestion Route；Phase 6 用 App Router/E2E 验证真实响应；Phase 18 从最新 Legacy HEAD 刷新并全量 Diff。

Phase 6 真实响应结果：四条显式 Blog Route、代表性 Pinyin Wiki Route、unprefixed 与 `/zh-cn` Route 通过；311 条 Static ROS2 HTML Route 全量通过。Phase 18 仍负责基于届时 Legacy HEAD 的最终全量 Content/Route Delta。

Analytics-sensitive 验证必须覆盖 Canonical、Locale、unprefixed 和 Alias Path，因为旧 Blog/Wiki 统计会把 `path`、`sourcePath`、`legacyPath` 和 Alias 聚合。Phase 0 不执行 Production Crawl 或读取实际 Traffic Ranking。
