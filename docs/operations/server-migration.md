# 计划性服务器迁移

## 目标

使用尽可能少的 Operator Command，把 Production Application 和 PostgreSQL 迁移到新服务器，同时做到 No Data Loss 和 Near-zero Planned Downtime。

## 正常命令

```bash
./site migrate-server <inventory-hostname-or-alias>
```

Durable Interface 不要求家庭公网数字 IP。

## 寻址原则

使用稳定 Infrastructure Identity：

- DNS Hostname
- SSH Config Alias
- Ansible Inventory Hostname

一台全新机器在还没有 Hostname 时可能需要临时 Bootstrap Address。这个 Bootstrap Detail 不得泄漏到长期 Application/CI Configuration。

Production Origin Contract 保持为：

```text
ddns.tungchiahui.cn
```

Migration/Cutover 后，根据需要更新 DDNS/Origin Routing 指向新的可达 Production Origin。

## 相同 PostgreSQL Major Version

首选 Database Method：Physical Streaming Replication。

```text
Old server
PostgreSQL Primary
      |
      | WAL streaming
      v
New server
PostgreSQL Standby
```

## Procedure

1. 使用 Ansible Provision 新服务器
2. 建立稳定 Inventory/SSH Identity
3. 安装/验证 Docker、OpenResty、Secret、Directory、Monitoring
4. 从当前 Production PostgreSQL 建立 Standby
5. 等待 WAL Catch Up
6. 在新服务器部署 Application Candidate
7. 执行 Local-to-new-server Health/Readiness/Smoke Test
8. Verify Replication Lag
9. 进入 Controlled Switchover Window
10. 必要时短暂 Quiesce Write
11. 确保 Final WAL 已收到
12. Promote New PostgreSQL
13. 让 New Application 指向 Promoted DB
14. Verify
15. 通过稳定 Hostname 更新 Production Origin/Routing
16. 执行 Public Post-switch Test
17. 在 Rollback Window 内保留 Old Server，且处于安全 Non-writing State

## PostgreSQL Major Upgrade

Physical Replication 不是 Cross-major Migration 的默认机制。

使用适当且受支持的方法，通常是：

- 使用 Logical Replication 做 Near-zero-downtime Major-version Transition
- 或者在明确选择 Maintenance Model 时使用 pg_upgrade

## IPv4/IPv6 独立性

Migration 不得假设 Production Origin 拥有 Public IPv4。

如果 Public Entry/Origin Path 支持，Target 可以是 IPv6-only。

## Abort Criteria

以下情况在 Promotion/Cutover 前 Abort：

- Replication Unhealthy
- Lag 无法收敛
- New Server Readiness 失败
- Backup Stale/Unverified
- New Server Storage/Permission 不一致
- Critical Smoke Test 失败

## Permanent HA

该架构支持基于 Replication 的 Planned Migration。

Always-on Automatic HA 是独立需求；在没有多个 Independent Host/Quorum/Fencing Design 时，当前不启用。
