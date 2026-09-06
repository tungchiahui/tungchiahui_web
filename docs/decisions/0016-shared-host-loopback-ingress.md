# ADR 0016：共享主机使用外层入口与 V2 回环网关

- Status: Accepted
- Date: 2026-09-06

## Context

真实生产目标是运行 1Panel 和多个现有服务的 Debian 13 共享主机。1Panel OpenResty 使用
host network，并已监听 `80`、`443`、`8443` 和 `18080`。公网路由器只转发 `8443` 与
`18080`，EdgeOne 对外提供标准 `80/443`。让 V2 Compose 再发布宿主机 `8443` 会端口冲突，
直接暴露 Next.js Slot 又会绕过 ADR 0004 的原子切换以及独立控制面路由。

## Decision

保留两层职责明确的 OpenResty：

1. 已有 1Panel OpenResty 作为共享主机入口，负责公网 HTTP/TLS、证书和静态反向代理。
2. V2 OpenResty 只以 HTTP 发布到 `127.0.0.1:3100`，负责 Blue/Green Upstream Selection、
   `/api/ops/*` Path Ownership、限流、安全响应和部署引擎的原子 Reload。
3. 外层入口只代理 V2 回环网关，不直接访问 Next.js Slot、`control-api` 或容器地址。
4. 外层入口必须保留 `Host`，覆盖并传递可信的 `X-Forwarded-For` 和
   `X-Forwarded-Proto`，并禁止缓存 `/api/ops/*`。
5. `ddns.tungchiahui.cn:8443` 继续是 ADR 0011 定义的稳定 Production Origin；公网数字 IP
   不进入持久配置。

## Consequences

V2 不与共享主机现有监听端口冲突，且未对 LAN/WAN 增加新的暴露面。TLS 与证书生命周期由
1Panel 统一管理。应用部署和回滚仍只修改 V2 OpenResty 的 Active Slot，因此 GitHub Actions、
`./site deploy` 和 `./site rollback` 继续共享同一个 Deployment Engine。

外层入口成为额外的生产可用性依赖，但它是稳定转发层，不属于每次应用 Release 的变更面。
Production Smoke 必须分别验证回环 V2 网关、`ddns.tungchiahui.cn:8443` Direct Origin 和
EdgeOne Public Path。
