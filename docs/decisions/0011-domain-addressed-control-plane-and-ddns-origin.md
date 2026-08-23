# ADR 0011：使用 Domain-addressed Control Plane 与 DDNS Origin

- Status: Accepted
- Date: 2026-08-23

## Context

网站运行在家庭服务器上，未来 Public IPv4 可能消失，而 Public IPv6 可能仍存在。把家庭 Public IP 硬编码到 CI、CLI 或 Application Configuration 会产生不必要耦合。

## Decision

Remote Production Control 使用 `https://www.tungchiahui.cn/api/ops/*`。`ddns.tungchiahui.cn` 是 EdgeOne 后使用的 DNS-only/DDNS Production Origin Hostname。家庭公网数字 IP 不属于 Durable Application/CI/Operator Configuration。内部使用 Docker Service Name。

## Consequences

系统可以在不修改 Application 或 Workflow 的情况下，从 IPv4+IPv6 Origin 迁移到 IPv6-only Origin。如果未来失去全部 Inbound Reachability，可以把 Origin Hostname 重新指向 Relay/Tunnel Ingress，同时保留 Upper-layer Contract。
