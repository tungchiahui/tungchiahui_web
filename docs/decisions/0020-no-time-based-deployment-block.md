# ADR 0020：不以固定稳定时长阻止连续应用发布

- Status: Accepted
- Date: 2026-09-08
- Clarifies: ADR 0004、ADR 0015

## Context

Phase 14 的双槽实现曾在每次切流后写入 Stabilization Deadline，并在该期限内拒绝新的部署。这样可以在准备下一候选版本时避免覆盖倒数第二个版本，但固定等待并不会产生新的健康证据，而且会阻止已经通过本地、CI、候选槽和生产 Smoke Gate 的紧急或连续发布。

本站由单一 Owner 运维，发布频率和恢复复杂度不需要以 24 小时绝对禁令换取。Owner 于 2026-09-08 明确决定移除该时间拦截。

## Decision

应用部署不再设置或执行固定 Stabilization Deadline。只要没有另一项未完成的 Deploy/Rollback Operation，任意通过现有授权、不可变镜像、Migration、Health/Readiness、Pre-cutover Smoke 和 Cutover Policy 的 Release 都可以立即部署。

双槽行为保持不变：候选版本始终进入 Inactive Slot；切流前失败不影响 Active Slot；成功切流后，切流前的 Active Release 成为新的 Previous Rollback Target；Post-cutover Smoke 失败仍自动切回该版本。准备连续候选版本时允许覆盖倒数第二个版本，但所有历史 Deployment Operation 继续保存精确 SHA、Digest、Actor、Reason 和 Audit。

Phase 18 的线上 Observation/Stabilization Evidence 仍是最终验收条件，但只用于决定是否关闭旧 Nuxt Rollback Window，不得阻止日常 V2 Application Deployment。

## Consequences

- Owner 可以在完整 Gate 通过后连续发布，无需等待人为时钟。
- `./site rollback` 仍可无重建切回最近一次成功切流前的版本。
- 候选版本准备期间不再保证倒数第二个版本继续运行在 Inactive Slot；需要更早版本时，应使用审计中的精确 SHA/Digest 重新发起受控部署。
- Deploy/Rollback 并发互斥、Expand-only Migration、备份前提、不可变镜像和 Smoke Gate 均未放宽。
- SQLite 的 `stabilization_until` 列为兼容旧 Control-state 暂时保留，但新 Cutover 写入 `NULL`；删除该列必须遵循后续 Expand/Contract Migration。
