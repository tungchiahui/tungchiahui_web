# 网络与源站架构

## 原则

持久的生产配置必须使用稳定名称，而不是家庭公网数字 IP。

## 公网名称

```text
www.tungchiahui.cn
cdn.tungchiahui.cn
```

这些名称可以通过 EdgeOne 提供服务。

不需要单独的 `ops.tungchiahui.cn`。

管理控制统一放在：

```text
https://www.tungchiahui.cn/api/ops/*
```

## 源站名称

```text
ddns.tungchiahui.cn
```

职责：

- DNS-only Origin Identity
- 由 DDNS 更新
- EdgeOne 使用它作为 Origin Hostname
- 当前可以同时拥有 A + AAAA
- 未来可以只有 AAAA
- 不是普通 Public/Operator Entry Point

概念上的 Origin：

```text
www.tungchiahui.cn
       |
     EdgeOne
       |
       v
ddns.tungchiahui.cn:8443
       |
    OpenResty
```

## 不持久保存数字 IP 配置

不要持久保存如下值：

```text
PRODUCTION_HOST=203.0.113.10
```

不得将其写入：

- Application Configuration
- GitHub Workflow
- Project CLI Default
- EdgeOne Logical Architecture Documentation
- Deployment State
- Normal Ansible Inventory

使用：

- DNS Hostname
- SSH Alias
- Inventory Hostname
- Docker DNS Service Name

只有在尚未拥有 Hostname 的临时 Bootstrap 场景中才可以使用数字 IP。

## 内部服务寻址

Docker/Compose Service 使用 Service DNS Name。

示例：

```text
next-blue
next-green
pgbouncer
postgres
content-worker
deploy-agent
alist
```

绝不依赖 Ephemeral Container IP。

## IPv6-only 家庭源站

架构必须能够容忍家庭源站变为 IPv6-only。

Application Code、CI 和 Local CLI 都不改变。

唯一要求是配置的 EdgeOne Origin Path 能够访问 `ddns.tungchiahui.cn`。

## 失去全部入站可达性

如果 ISP 最终同时移除 Public IPv4 和可用的 Public IPv6 Inbound Reachability，则使用由家庭服务器主动向外建立连接的 Relay/Tunnel Design。

保持契约：

```text
public names -> EdgeOne -> origin hostname
```

此时 Origin Hostname 可以解析到 Relay，而不是直接解析到家庭服务器。

## Edge/Control 缓存

`/api/ops/*` 必须绕过 CDN Cache。

Control Response 使用：

```http
Cache-Control: no-store
```

运维 POST Request 永远不得缓存。
