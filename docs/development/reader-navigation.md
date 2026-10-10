# Blog / Wiki 阅读导航

Blog 和 Wiki 共用 `ArticleReader`，服务端 Markdown/KaTeX/Sanitization、URL 和四种
Locale 保持原边界。客户端只增加阅读交互，不请求新的 API 或外部图片元数据，不引入依赖。

## 跟随当前阅读位置

- 桌面目录与 Wiki 文档章节继续在正文范围内使用 CSS Sticky。偏移量由真实 Site Header
  高度 + 24px 间距决定；正文锚点、侧栏位置和标题高亮共用同一测量，缺少 Header 时
  回落 96px。正文结束时侧栏随正文离开，不遮挡后续导航和页脚。
- 本文目录根据正文位置更新 `aria-current="location"`。只有当前项移出可见范围时才
  滚动目录自身，不调用可能滚动整页的 `scrollIntoView`，不强制把每项居中。
- Wiki 文档章节继续表示当前 Route 的 `aria-current="page"`，不会把当前文章里的
  小节错当成另一篇文档。初次显示/打开手机抽屉时直接展示当前项；之后跟随使用 280ms
  缓入缓出动画。目录变长和桌面/手机断点变化也会重新检查可见区域。
- 手动滚动、拖动或键盘浏览目录会取消目录动画并暂停跟随。输入结束 1.5s 后恢复接受
  新阅读位置；如果只是浏览目录，不主动把目录拉回原位置。移动抽屉选择目标后关闭，
  Wiki 跨文档跳转继续使用现有 Next Link。
- 手机抽屉的关闭按钮固定在顶部；跟随计算为该按钮预留空间，当前项不会滚到按钮下面。
- 阅读抽屉使用模态层级，位于全局播放器之上；浏览器测试以实际 Hit Test 验证当前项
  没有被播放器遮挡，而不仅检查 Bounding Box 位于视口。

## 锚点与延迟布局

目录、正文标题鼠标/键盘、正文同页链接共享控制器。Root 捕获阶段优先处理同页 Hash，
避免正文里的完整相对路径锚点先进入通用 Next 页面导航；跨页面链接仍由原导航处理。
显式选择使用 360–650ms 缓入缓出动画，距离较长时适当延长；保存 Hash 和现有 Next
History State，相同 Hash 不重复增加
History Entry。完成后将焦点移到标题并禁止焦点引发额外滚动。修饰键/新标签/下载链接
保持浏览器原行为。初次带 Hash 打开、浏览器前进后退直接对齐 Hash 目标，不增加历史项；
无 Hash 的历史恢复仍交给浏览器。

不缓存标题的绝对坐标。正文/文章容器/Header ResizeObserver、图片 load/error、字体 ready 和
Viewport Resize 触发重新测量；标题查找限定在正文内，避免页面其他元素的同名 ID 抢占。
事件合并到一个 animation frame。锚点选择后最多 20s 校准
目标；文章顶部异步统计等变化即使不改变正文自身高度，也会重新校准。
图片在初次动画期间加载时等初次动画结束再校准；后续偏差超过 2px 时使用 240ms
短动画，避免每帧重启动画。到达页末不能完全顶齐时使用实际可滚动范围。

Wheel、Touch、Pointer 或正文滚动键立即取消页面动画和校准；新的目标替换旧目标。
卸载/正文更换时取消全部动画、定时器和 Listener/Observer，字体 Promise 迟到也不能
再次操作页面。未知/无效 Hash 不异常，图片失败不阻断导航。普通滚动不改写 URL。
正文 HTML Prop 使用稳定的 Memo；高亮/抽屉更新不能替换已增强的正文节点，避免标题
引用、代码工具栏和图片事件失效。

已提供的图片尺寸原样保留。浏览器读取到真实尺寸后补充无尺寸图片的 width/height，
配合响应式 height:auto；当前浏览器会话最多记住 128 个 URL/尺寸，重复使用资源时可
提前预留真实比例。该缓存只是有界、非持久的浏览器布局信息，不是内容或业务存储。
首次冷加载的未知比例由上述校准处理，不伪造统一图片比例，也不要求改写 Markdown。

系统 `prefers-reduced-motion: reduce` 下所有页面/目录滚动直接对齐；动态切换到减少动画
会终止当前页面动画并直接对齐。未执行 JavaScript 时仍有服务端目录、原生 Hash、默认
scroll-margin 和 CSS Sticky。

## 验证与恢复

`tests/unit/reader-scroll.test.ts` 验证缓入缓出、中断、减少动画、可见项不动、边界和
多语言 Hash；Lifecycle Test 使用受控时钟验证校准到期、用户中断与卸载。
`tests/e2e/reader-navigation.spec.ts` 使用实际 Content Sync 的长 Blog/Wiki
Fixture，验证动画中间帧、目录内部跟随、文档章节溢出、延迟图片校准、浏览器历史、
用户滚动接管、手机抽屉、减少动画及图片失败/无图片事件的布局变化。
延迟布局场景关闭浏览器自带 Scroll Anchoring，确保真正验证共享控制器的校准行为。

无数据库 Migration、生产内容写入、付费翻译或 Backup/Restore 行为变更。Health/Ready
没有新增依赖；页面交互状态不发送日志或用户阅读行为。发布走原 main CI 与服务器
Blue-green 流程，恢复使用同一 Engine 保留的 Previous Release，内容与锚点 ID 不变。
