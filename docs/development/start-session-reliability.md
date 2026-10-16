# Start 保存与账户状态（2026-10-16）

本轮修复 Start 保存、冲突处理、分组改名、账户退出和客户端文案依赖。不改变现有
PostgreSQL Schema、API 路径、权限、Public URL、付费翻译或部署/恢复策略。

## 保存与冲突

Start 仍在编辑停止 600ms 后，向独立 control-api 的 `/api/ops/start/data` 提交
`expectedRevision` 与 version-1 payload。同一页面一次只发出一个保存请求。
每次编辑推进本地编辑序号；请求成功只确认提交时的序号。请求期间的新改动继续留在
页面，并使用服务端返回的新 revision 发送下一次保存，不能被旧响应标记为已保存。

409 冲突暂停保存，继续编辑也不会自动重试过期 revision。网络失败、其他失败状态和
无效响应同样暂停，由用户显式重试；重试使用当前完整草稿及原 revision。网络结果
不确定时不假定写入失败；如果原请求已提交，重试会经既有 CAS 进入冲突处理。

失败状态提供完整草稿导出，包含分组、历史、引擎、背景和视图。冲突处理顺序是导出、
重新载入最新数据、人工核对/合并，再显式导入或编辑。重新载入前提示会丢弃未保存
修改，取消后保持原页面。导入兼容原有书签数组与完整 version-1 草稿；导入不绕过 CAS，
也不会自行解除已有冲突。普通书签导出格式保持原样。

分组使用仅存在于当前页面的稳定随机标识，改名不再卸载输入框，同名分组也能分别
编辑。保存、两种导出均显式剔除该标识，数据库和旧版本应用继续只看到原有分组格式。

## 会话结果

Header 的账户会话响应使用共享 public-account schema 与 authenticated discriminated
union 校验。只有 DELETE 成功且响应明确表示匿名，才清除账户显示并广播认证变化。
HTTP/网络/无效响应或服务端仍返回已认证时保留账户，并显示四 Locale 已有的退出
失败消息；用户可以重试。提交期间禁用按钮，登录与初始检查也处理网络错误。
浏览器禁止 localStorage 时，同页认证事件仍能通知个人数据编辑器。凭据不进入
浏览器存储、导出文件或日志。

## 文案依赖与回退

`start/default-payload.ts` 只接收 next-intl translator，构造原有默认结构。Start Client
Component 使用当前 Provider 的 `Web.startDefaults`，不再导入四 Locale Catalog。
`start/defaults.ts` 保留服务端/CLI 的 Locale wrapper，默认 zh-CN 及开发 Seed 不变。
当前 Locale 的 revision=0 默认视图、Reset 与作者已保存字符串的边界继续遵循
[`site-i18n-completion.md`](site-i18n-completion.md)。

无需数据库 Migration 或数据回填。回退使用正常 Blue-Green Previous Slot；持久化
payload 没有新增字段，无需恢复数据库。回退旧 Web 会恢复旧的交互缺陷，因此应先
完成当前草稿保存或导出。备份/PITR、控制面权限和生产发布入口均沿用现有策略。

## 验证入口

- `start-workspace.test.tsx`：保存期间编辑、返回 revision、同名分组连续输入、冲突停止、
  当前草稿导出、重载取消、两种导入、HTTP/网络/无效响应暂停及显式重试。
- `account-button.test.tsx`：退出失败保留会话、重试成功、无存储事件通知、登录网络错误
  和 session Runtime Validation。
- `start-client-bundle.test.ts`：真实客户端依赖打包不得包含完整 Locale Catalog。
- `start-reliability.spec.ts`：浏览器连续编辑后保存/重载、改名焦点、冲突后导出/重载/
  导入、退出失败和重试；现有四 Locale 与真实 Owner Session E2E 继续保留。
- 仓库完整静态/类型/单元/构建/安全、隔离 Integration/E2E/S3Mock 与 Migration Gate。

本地最终通过 57 File / 355 Unit、36 Browser E2E、完整隔离 Integration/S3Mock 7-case、
12 Migration、Static/Type/Build/Security Gate。格式检查保留一条既有的
`translation/git-memory.ts` optional-chain 提示，无错误。隔离资源已按原测试流程清理。
390px 手机截图确认冲突操作无横向溢出、退出失败提示位于视口内。

同一 Webpack 构建中的相关共享脚本从 443,935 降为 98,445 bytes；gzip 从 132,857 降为
28,106 bytes（减少 78.8%）。构建产物不再包含四 Locale Catalog 的固定文案；当前语言
仍通过既有 next-intl Provider 提供。这些是本地脚本体积数据，不是整站流量或性能 SLA。

本地验证日志和截图位于 Gitignored `.local/optimization-review/`。本轮修复未发布到生产。
