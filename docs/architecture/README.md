# TravelOn 微服务重构方案

**版本：** V2.1
**日期：** 2026-08-28
**状态：** 已实施，待 PR 评审

> 实施分支：`feat/microservices-consolidation`。阶段 1 至 4 已完成：删除
> `offer-provider-service`，将 reservation + payment 合并为 `order-service`，将
> hotel + transport 合并为 `travel-core-service`，并同步 Gateway、Docker Compose、
> Kubernetes 与 CD 配置。对外 HTTP 路径保持不变。

---

## 文档索引

按阅读顺序：

| # | 文档 | 内容 | 适合谁 |
|---|------|------|--------|
| 1 | [代码核实基线](./verified-baseline.md) | 当前架构的**事实**，每条结论附文件路径 | 所有人，先读这份 |
| 2 | [微服务划分图](./architecture-diagram.md) | 目标架构图、变更对照、边界依据 | 所有人 |
| 3 | [合并重构方案](./microservices-consolidation-plan.md) | 目标架构、实施计划、风险与回滚 | 架构 / 技术负责人 |
| 4 | [服务接口清单](./service-interface-inventory.md) | 各服务真实 HTTP / MQ / WebSocket 契约 | 前后端 / 测试 |
| 5 | [数据表归属方案](./database-ownership-plan.md) | 真实表清单、归属、迁移与校验 | 后端 / DBA |
| 6 | [实施指南](./implementation-guide.md) | 逐步操作、命令、避坑点 | 执行者 |
| 7 | [评审清单](./review-checklist.md) | 待确认事项与签字 | 评审人 |

---

## V2.1 修订说明（重要）

V2.0 的接口路径、队列名、表结构与部分服务职责为推断内容，与仓库实际不符。逐一核对源码后已整体重写。

**其中两项发现改变了重构动作本身：**

**1. offer-provider-service 应当删除，而不是合并。**

它当前是一个空壳：`OffersService` 的三个方法分别返回 `List.of()`、硬编码占位对象（`hotelName = "旅游产品功能重构中"`、`price = -1.00`）和 `-1.00`；服务无数据库、无 `rabbitTemplate` 调用、WebSocket 配置未注册任何 handler。原方案「合并 hotel + transport + offer」实际是「合并两个 + 删除一个空壳」。

**2. reservation + payment 合并不需要迁移任何数据。**

`payment_transaction` 与 `refund_record` 已经在 `reservation_db` 中，由 reservation-service 直接读写。payment-service 无 Entity、无 Repository、无数据源；`payment_db` 是建库后从未应用 schema 的空库。

其余修正：真实队列名（`hotels.requests.checkAvailabilityByQuery.queue` 而非 `hotel.availability.request`）、真实表名（`hotel` / `room` / `ticket_offer_templates`，单数命名，无 availability 表）、真实包名（transport 的根包是 `org.microarchitecturovisco.transport`，不是 `transportservice`）。

---

## 一页纸结论

**从 11 个应用容器降到 8 个，业务服务从 9 个降到 5 个。**

```
hotel + transport          →  travel-core-service
offer-provider             →  删除
reservation + payment      →  order-service
user / community / ai-arrange / ai-arrange-agent / gateway / discovery  →  不变
```

| 项 | 现状 | 目标 |
|----|------|------|
| 应用容器 | 11 | 8 |
| 业务服务 | 9 | 5 |
| PostgreSQL 库 | 6（含 1 空库） | 4 |
| 工期 | — | 约 8 天 |

**顺带修复三处既有缺陷：** Gateway 的 `/payments/**` 死路由、缺失的 `/reservations/ws/**` 路由、从未应用 schema 的 `payment_db`。

---

## 常见问题

**为什么不把 user 和 community 合并？**

community 单个 Controller 就有约 34 个端点，覆盖帖子、评论、评价、景点、路线等，规模超过任何其他单个服务。user-service 提供的 `X-User-Token` 认证是其余所有服务的横向依赖，独立部署便于统一收敛。旧文档 [微服务迭代方案.md](../ite/微服务迭代方案.md) 中的合并建议不采纳。

**为什么不把 Python Agent 合进 ai-arrange-service？**

运行时、依赖和伸缩方式都不同，强行合成一个进程收益为负。当前它已经不注册 Eureka、不映射宿主机端口，只能由 ai-arrange-service 通过容器网络访问——**这个目标已经达成，本次无需改动。**

**对外接口会变吗？**

不会。`/hotels`、`/transports`、`/reservations`、`/users`、`/community`、`/ai-arrange` 全部保持原路径，只改 Gateway 的 `uri` 指向。V2.0 提出的「`/reservations` 改名为 `/orders`」不采纳——它会牵动 WebSocket 路径与路由顺序，收益为零。

**唯一需要前端确认的是 `GET /offers/`**，见[方案 §5.2](./microservices-consolidation-plan.md)。

**性能会提升多少？**

主链路上减少的网络往返只有支付校验这一次。V2.0 中「报价查询提升 50%」的估算建立在 offer-provider 会做组合查询的错误前提上，不成立——酒店与交通之间本就没有互调。

真实收益在**工程复杂度**：少 3 个容器、少 2 个数据库、少一层跨服务调试。性能不作为验收门槛。

**数据会丢吗？**

不会。order-service 沿用 `reservation_db` 不改名；travel-core 新建 `travel_core_db`，seed 由 Flyway 从 CSV 重建，不需要 `pg_dump` 导数据。旧库全程只读，回滚不涉及数据恢复。

**需要注意的是**：init 脚本只在**空数据卷**首次启动时执行。开发环境需重建 `travel-api/data/postgres`；若有必须保留的数据，走手工建库路径。详见[实施指南 §3.5](./implementation-guide.md)。

---

## 实施顺序

调整为**先易后难**，与 V2.0 相反：

| 阶段 | 内容 | 预估 | 为什么这个顺序 |
|------|------|------|--------------|
| 0 | 分支、备份、确认前端是否依赖 `/offers/` | 0.5 天 | 唯一的外部依赖，先确认 |
| 1 | 删除 offer-provider + 清理死路由 | 0.5 天 | 风险最低，立即少一个容器 |
| 2 | 合并 order-service | 1.5 天 | 纯代码改动，不碰数据库 |
| 3 | 合并 travel-core-service | 3 天 | 涉及新建库与 seed 合并，放在团队熟悉流程之后 |
| 4 | compose 与 Gateway 收尾 | 0.5 天 | |
| 5 | 集成测试 | 1.5 天 | |
| 6 | 文档更新 | 0.5 天 | |

**合计约 8 天。**

不含 `docs/microservices-course/` 教学页面中失效路径的订正——那部分引用了大量 `hotel-service` / `offer-provider-service` 路径，工作量不小，应单独排期。

---

## 实施决定

| # | 事项 | 状态 |
|---|------|------|
| 1 | offer-provider 由"合并"改为"删除" | 已实施 |
| 2 | `/reservations/**` 不改名 | 已实施 |
| 3 | order-service 沿用 `reservation_db` 库名 | 已实施 |
| 4 | travel-core 新建 `travel_core_db`，旧库保留用于回滚 | 已实施 |
| 5 | 前端不依赖 `GET /offers/` | 已核实并移除死调用 |
| 6 | 实施顺序改为 offer → order → travel-core | 已实施 |
| 7 | 不新增锁表、Saga 日志表、追踪与监控 | 已按范围执行 |

验证结果：travel-core 27 个单元测试和 2 个 Spring 集成测试通过；Gateway 3 个测试通过；
AI Agent 17 个测试通过；Docker Compose 配置解析和 Kubernetes Kustomize 渲染通过。
真实 PostgreSQL 迁移由仓库内的
[`tests/migration/run_migration_test.py`](../../tests/migration/run_migration_test.py)
验证，并由 CI 调用。详细决策依据见[评审清单](./review-checklist.md)。
