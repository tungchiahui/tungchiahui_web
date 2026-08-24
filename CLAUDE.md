# Claude Code 项目指令

`AGENTS.md` 是本仓库的权威项目策略。

修改代码前：

1. 阅读 `AGENTS.md`。
2. 阅读 `README.md`。
3. 阅读 `docs/planning/current-state.md` 与当前 Phase。
4. 阅读与当前变更相关的架构文档。
5. 阅读 `docs/decisions/` 下适用的 ADR。

不得为了方便而削弱或绕过 `AGENTS.md` 中的规则。

当旧 Nuxt 网站与新架构之间存在差异，导致需求行为含糊时：

- 优先使用 Phase 0 的 Legacy Inventory、Compatibility Matrix 与 Fixture，不默认重新全量扫描旧仓库；
- 仅将旧仓库视为行为参考；
- 只有仓库内 Artifact 无法回答具体问题时才定点只读检查旧仓库；
- 在可行范围内保留公开 URL 和重要用户可见行为；
- 实现方式遵循 V2 架构；
- 如果无法可靠判断某个用户可见功能应保留、重做还是删除，询问 Owner。

在报告完成前，运行相关仓库检查，并明确说明实际通过了哪些检查。
