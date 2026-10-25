# PgBouncer 证书修补镜像

2026-10-25，正常 Main Release 的 Critical 扫描发现 Percona PgBouncer 1.25.2-5
包含 CVE-2026-114406。官方 1.25.2-9 仍包含相同的旧 ca-certificates；单纯更新 Revision 不解决。

`ops/production/images/pgbouncer.Dockerfile` 固定官方 1.25.2-9 Base Digest，在 Vendor 签名
RPM 仓库更新证书，并断言精确修复版本 `2026.2.92_v9.0.319-90.3.el9_8`，最后恢复 Non-root。
保持 PgBouncer 1.25.2、二进制位置、入口、6432、SCRAM、Transaction Pool 和权限配置。
没有更换数据库/连接池技术、增加常驻服务或扩大任何容器权限。

## 制品与首次发布兼容

- 五组完整 Quality Gates 保留。隔离 Production-foundation 实际构建/扫描修补镜像，验证
  非 Root、DB 连接、Bootstrap 幂等、完整发布/回退、控制面故障及现有恢复演练。
- main CI 增加 `build-pgbouncer`；配方最近一次 Git Commit 是其 Tag/OCI Revision。
  若该不可变 Tag 已存在，先解析 Digest、拉取并验证 Revision，再复用，绝不重写。
  Registry 错误不视为不存在；只有明确 Not Found 才构建。修改证书版本/Base 必须更新配方。
- PgBouncer Source SHA 与 Digest 传给 Recovery Build。TypeScript Binder 验证不可变引用，
  替换拓扑中唯一占位符，并写入 Image 内部 `pgbouncer-image.json`。最终 Compose 为固定 Digest，
  不依赖生产 `.env` 新增值。原 Web→Service/Recovery Digest 链和 Supervisor Protocol 1 不变，
  不给 Host Checkpoint/SQLite JSON 增加字段。旧执行器可直接应用新 Recovery 制品中的拓扑。
- 新 Release Worker 在现有 Fence/Lease 验证后，先通过已有最小权限 Registry 凭据拉取
  声明的 PgBouncer Image，并验证其属于同一项目 `-pgbouncer` Repository、Digest 和 Source SHA。
  因此首次发布不依赖新 Package 为 Public 或主机预先手工登录 Docker。
- 普通网页改动复用相同配方镜像；拓扑中的 PgBouncer Ref 不变。配方改变时仍由原 Host
  Adapter 更新该服务，再执行现有 Post-convergence Public Smoke，不替换 Active Web Container。
- 直接用仓库原始模板的隔离 Bootstrap 必须显式传入经校验的 `ProvisionRequest.pgbouncerImage`。
  正常生产 Bootstrap/发布使用 Recovery 中已绑定的拓扑，不需要这个辅助字段。

## 验证和恢复边界

新增 Unit 覆盖不变引用绑定、缺失/重复占位符、跨仓库/错误 Revision/缺失 Digest 拒绝、
认证拉取与 CI Digest 绑定 Policy。Dev 使用相同修补 Dockerfile；生产 Gate 扫描真实制品，
不通过忽略 CVE、移除漏洞扫描或修改 Severity 来放行。

没有 DB Migration、备份内容格式、持久化卷或 PostgreSQL Image 更新。
Recovery Validation Plan 是既有完整 Production-foundation 和隔离双副本 Backup/Restore/PITR
演练。Host 补偿/回退使用原 Snapshot 中的字面 Compose Image Ref；旧版本的拓扑继续可读。
不能把回退误报为安全修补仍存在：回到旧 PgBouncer Image 会同时回到旧证书版本。

新增 `-pgbouncer` Package 暂不进入现有四应用仓库的破坏性 Retention 白名单，防止删除仍被
Active/Previous Host Generation 固定引用的旧配方镜像。每次配方 Commit 只创建一个版本；
后续纳入清理必须先遍历这些精确拓扑依赖，不能只按当前 Web SHA 保留。

本地验证：修补镜像构建及真实版本查询通过；61 File / 376 Unit、完整
Static/Type/Build/Source/Workflow/Bundle Security 通过。完整隔离恢复/集成、实际镜像漏洞扫描
及生产结果仍以同一 main Release Gate 为准。
