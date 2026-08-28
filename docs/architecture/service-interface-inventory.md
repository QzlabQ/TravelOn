# TravelOn 服务接口清单

**版本：** V2.1（按代码核实重写）
**日期：** 2026-08-28
**事实来源：** [代码核实基线](./verified-baseline.md)

> **V2.1 修订说明：** V2.0 的接口路径、查询参数和队列名多为推断，与仓库实际内容不符，已整体作废重写。
> 本文档中「现状」列的每一项都来自源码；「目标」列是重构后的建议状态。

---

## 1. 总览

| 服务（目标） | 由谁构成 | HTTP | WebSocket | MQ 消费 | MQ 生产 |
|-------------|---------|------|-----------|---------|---------|
| `travel-core-service` | hotel + transport | 是 | 否 | 是 | 是（RPC 响应） |
| `order-service` | reservation + payment | 是 | 是 | 是 | 是 |
| `user-service` | 不变 | 是 | 否 | 否 | 否 |
| `community-service` | 不变 | 是 | 否 | 否 | 否 |
| `ai-arrange-service` | 不变 | 是 | 是 | 否 | 否 |
| `ai-arrange-agent-service` | 不变 | 内网 HTTP/SSE | 否 | 否 | 否 |

`offer-provider-service` 不在目标清单中——它是空壳，予以删除，理由见[基线 §3.3](./verified-baseline.md)。

---

## 2. 路径兼容策略（重要）

**结论：对外 HTTP 路径全部保持不变。**

理由：

1. `travel-ui` 已在使用 `/hotels`、`/transports`、`/reservations`、`/users`、`/community`、`/ai-arrange`，改路径会连带改前端。
2. reservation-service 的 WebSocket 端点写死在 `/reservations/ws/offerBought`，路径重命名会牵动 WebSocket 升级与 Gateway 路由顺序，收益为零、风险不小。
3. 服务合并只改**部署边界**，不是对外契约变更。把两件事绑在一起会让回滚变复杂。

因此 V2.0 中「`/reservations/**` → `/orders/**` 路径语义化」的建议**不采纳**。服务内部叫 `order-service`，对外仍保留 `/reservations/**`。

Gateway 只改 `uri` 指向，不改 `predicates`：

```yaml
# 改前                              # 改后
- id: hotel-service                 - id: travel-core-hotels
  uri: lb://hotel-service             uri: lb://travel-core-service
  predicates:                         predicates:
    - Path=/hotels/**                   - Path=/hotels/**     # 不变
```

---

## 3. travel-core-service

### 3.1 HTTP —— 酒店（`/hotels`）

来源：`HotelsController`，路径与参数与现状一致。

| 方法 | 路径 | 鉴权 | 说明 |
|------|------|------|------|
| GET | `/hotels/destinations` | 无 | 目的地列表 |
| GET | `/hotels/search` | 无 | 搜索酒店，参数见下 |
| GET | `/hotels/{hotelId}` | 无 | 酒店详情 |
| POST | `/hotels/admin` | admin | 新建酒店 |
| PUT | `/hotels/admin/{hotelId}` | admin | 更新酒店 |
| DELETE | `/hotels/admin/{hotelId}` | admin | 删除酒店 |
| POST | `/hotels/admin/{hotelId}/rooms` | admin | 新建房间 |
| PUT | `/hotels/admin/{hotelId}/rooms/{roomId}` | admin | 更新房间 |
| DELETE | `/hotels/admin/rooms/{roomId}` | admin | 删除房间 |

`GET /hotels/search` 查询参数：

| 参数 | 类型 | 必填 | 默认 |
|------|------|------|------|
| `destinationId` | UUID | 是 | — |
| `dateFrom` / `dateTo` | ISO date | 是 | — |
| `adults` | int | 否 | `2` |
| `hotelName` | string | 否 | — |
| `minPrice` / `maxPrice` | decimal | 否 | — |
| `minRating` | float | 否 | — |
| `hotelType` / `roomType` | string | 否 | `ALL` |
| `sortBy` | string | 否 | `price` |

`GET /hotels/{hotelId}` 参数：`dateFrom`、`dateTo`（必填）、`adults`(2)、`childrenUnder3`(0)、`childrenUnder10`(0)、`childrenUnder18`(0)。

鉴权统一通过请求头 `X-User-Token`。

### 3.2 HTTP —— 交通（`/transports`）

| 方法 | 路径 | 鉴权 |
|------|------|------|
| GET | `/transports/` | 无 |
| GET | `/transports/locations` | 无 |
| GET | `/transports/locations/{region}` | 无 |
| GET | `/transports/available` | 无 |
| GET | `/transports/tickets` | 无 |
| GET | `/transports/tickets/options` | 无 |
| POST | `/transports/tickets/templates` | admin |
| PUT | `/transports/tickets/templates/{templateId}` | admin |
| DELETE | `/transports/tickets/templates/{templateId}` | admin |
| POST | `/transports/admin` | admin |
| PUT | `/transports/admin/{transportId}` | admin |
| DELETE | `/transports/admin/{transportId}` | admin |
| GET | `/transports/test` | 无（建议删除） |

### 3.3 HTTP —— `/offers`

**目标：从 Gateway 移除该路由，并删除 offer-provider-service。**

当前该路径下只有 `GET /offers/`，返回空列表。若前端仍在调用，两种处理方式：

| 方式 | 做法 | 适用 |
|------|------|------|
| A（推荐） | 前端移除调用，Gateway 删路由，服务删除 | 前端确认无依赖 |
| B | 在 travel-core-service 中保留一个返回空列表的 `GET /offers/` | 前端短期内无法改动 |

选 B 时，该端点应加注释标明是待删除的兼容壳，不要重新实现组合逻辑。

### 3.4 RabbitMQ 消费

合并后由单个进程监听原 hotel 与 transport 的全部队列，**队列名、exchange 名、routing key 全部保持不变**，以避免与 reservation 侧的发送端产生不匹配。

| 队列 | 原属 | 返回值 |
|------|------|--------|
| `hotels.requests.hotelsBySearchQuery` | hotel | 有（RPC） |
| `hotels.requests.getHotelDetails` | hotel | 有（RPC） |
| `hotels.requests.checkAvailabilityByQuery.queue` | hotel | 有（RPC） |
| `hotels.events.createHotelReservation.queue.{uuid}` | hotel | 无 |
| `hotels.events.deleteHotelReservation.queue.{uuid}` | hotel | 无 |
| `transports.requests.getTransportsBySearchQuery` | transport | 有（RPC） |
| `transports.requests.getTransportsBetweenLocations` | transport | 有（RPC） |
| `transports.requests.getTransportsBetweenMultipleLocations` | transport | 有（RPC） |
| `transports.requests.checkAvailabilityByQuery.queue` | transport | 有（RPC） |
| `transports.createTransportReservation.queue.{uuid}` | transport | 无 |
| `transports.deleteTransportReservation.queue.{uuid}` | transport | 无 |

带 `{uuid}` 后缀的队列是每个实例启动时创建的**排他自动删除队列**，绑定在 fanout exchange 上。合并后进程数从 2 降到 1，这类队列的数量随之减半——这是预期行为，不是故障。

**必须保留的两条绑定：** `hotels.requests.checkAvailabilityByQuery.queue` 在 hotel 侧与 reservation 侧被用不同 routing key 绑定到同一个 topic exchange（详见[基线 §3.4](./verified-baseline.md)）。合并时两条绑定都要保留，只删其一会导致可用性查询 RPC 超时。

### 3.5 RabbitMQ 生产

travel-core-service 不主动发起消息，只对 RPC 请求返回响应（Spring AMQP 通过 `replyTo` 自动回发）。

---

## 4. order-service

### 4.1 HTTP（`/reservations`，路径不变）

| 方法 | 路径 | 鉴权 |
|------|------|------|
| GET | `/reservations/user/{userId}` | owner 或 admin |
| GET | `/reservations/{reservationId}` | owner 或 admin |
| POST | `/reservations/{reservationId}/cancel` | owner 或 admin |
| GET | `/reservations/{reservationId}/payments` | owner 或 admin |
| GET | `/reservations/{reservationId}/refunds` | owner 或 admin |
| POST | `/reservations/{reservationId}/refunds/complete` | admin |
| POST | `/reservations/tickets` | 需登录 |
| POST | `/reservations/hotels` | 需登录 |
| POST | `/reservations/purchase` | owner 或 admin |
| POST | `/reservations/reservation` | 无 |

`POST /reservations/reservation` 已停用，固定返回 `"Tour product reservation is being rebuilt"`。建议随 offer-provider 一并清理。

注意 `/reservations/{reservationId}/payments` 与 `/refunds` 是**已经存在**的支付查询端点，由 reservation-service 直接查 `reservation_db` 提供。它们与 payment-service 无关——这进一步说明支付数据本就归订单侧所有。

### 4.2 WebSocket

`/reservations/ws/offerBought`，路径不变。

Gateway 当前**没有**为它配置 `lb:ws://` 路由。合并时应顺带补上，并注意放在 `/reservations/**` HTTP 路由之前：

```yaml
- id: reservation-websocket
  uri: lb:ws://order-service
  predicates:
    - Path=/reservations/ws/**
- id: reservation-service
  uri: lb://order-service
  predicates:
    - Path=/reservations/**
```

### 4.3 RabbitMQ 消费

| 队列 | 说明 |
|------|------|
| `reservations.events.createReservation.queue.{uuid}` | 自发自收，创建订单 |
| `reservations.events.deleteReservation.queue.{uuid}` | 自发自收，删除订单 |
| `reservations.events.updateReservation.queue.{uuid}` | 自发自收，更新支付状态 |

这三条都是 reservation-service **自己发给自己**的 fanout 事件，合并后仍在同一进程内。可以保留（改动最小），也可以后续改为直接方法调用——建议**本次不动**，避免同时改两处。

### 4.4 RabbitMQ 生产

| exchange | routing key | 方式 | 目标 |
|----------|-------------|------|------|
| `hotels.requests.checkAvailabilityByQuery.exchange` | `hotels.requests.checkAvailabilityByQuery.routingKey` | `convertSendAndReceive` | travel-core |
| `hotels.createReservation.exchange` | `""` | `convertAndSend` | travel-core |
| `hotels.deleteReservation.exchange` | `""` | `convertAndSend` | travel-core |
| `transports.requests.checkAvailabilityByQuery.exchange` | `transports.requests.checkAvailabilityByQuery.routingKey` | `convertSendAndReceive` | travel-core |
| `transports.createReservation.exchange` | `""` | `convertAndSend` | travel-core |
| `transports.deleteReservation.exchange` | `""` | `convertAndSend` | travel-core |
| `reservations.events.*.exchange` | `""` | `convertAndSend` | 自身 |

### 4.5 payment 模块（内部）

payment-service 无状态、无数据库、无 HTTP 端点，合并后成为 order-service 内的一个包。

**现状调用：**

```java
// ReservationService:517
String responseMessage = (String) rabbitTemplate.convertSendAndReceive(
        "payments.requests.handle", "payments.handlePayment", transportMessageJson);
```

**目标调用：**

```java
HandlePaymentResponseDto response = paymentService.verifyTransaction(requestDto);
```

改造要点：

- 保留 `PaymentService.verifyTransaction(...)` 的签名与语义，只改调用方式
- 删除 `payments.requests.handle` 队列声明与 `@RabbitListener`
- 删除 Gateway 上的 `/payments/**` 死路由
- 调用点原本要处理 `convertSendAndReceive` 返回 `null`（超时）的分支；改为本地调用后该分支不再可达，但**异常处理不能一并删掉**——`verifyTransaction` 仍可能抛异常，`InvalidPaymentHandler` 的补偿路径必须保留

---

## 5. user-service（不变）

`@RequestMapping("/users")`

| 方法 | 路径 |
|------|------|
| POST | `/users/auth/register` |
| POST | `/users/auth/login` |
| POST | `/users/auth/logout` |
| GET | `/users/me` |
| PUT | `/users/me` |
| GET | `/users/me/travelers` |
| POST | `/users/me/travelers` |
| PUT | `/users/me/travelers/{travelerId}` |
| DELETE | `/users/me/travelers/{travelerId}` |

**认证机制：** 自定义请求头 `X-User-Token`，不是 JWT Bearer。hotel、transport、reservation、community 的鉴权都依赖它，这是 user-service 保持独立的主要理由。

---

## 6. community-service（不变）

`@RequestMapping("/community")`，单 Controller 约 34 个端点，涵盖：

| 领域 | 端点数（约） |
|------|------------|
| 帖子 / 图片 | 8 |
| 评论 / 评论点赞 | 6 |
| 点赞 / 收藏 | 6 |
| 评价（review） | 6 |
| 景点 / 路线 / 站点 | 8 |

端点规模是不与 user-service 合并的直接依据。

---

## 7. ai-arrange-service / agent（不变）

| 类型 | 路径 |
|------|------|
| HTTP | `/ai-arrange/api/conversations` |
| WebSocket | `/ai-arrange/ws/planner` |
| 内部 HTTP/SSE | `http://ai-arrange-agent:8090`（容器网络） |

Gateway 中 `ai-arrange-websocket`（`/ai-arrange/ws/**`）**必须**排在 `ai-arrange-service`（`/ai-arrange/**`）之前。

Python Agent 已经不注册 Eureka、不映射宿主机端口——**该项目标已达成，本次无需改动**。

---

## 8. 重构前后接口差异汇总

| 变更 | 类型 | 影响前端 |
|------|------|---------|
| `/hotels/**` 后端由 hotel-service 改为 travel-core-service | 内部 | 否 |
| `/transports/**` 后端改为 travel-core-service | 内部 | 否 |
| `/reservations/**` 后端改为 order-service | 内部 | 否 |
| 新增 `/reservations/ws/**` 的 `lb:ws://` 路由 | 修复 | 否（修复既有缺口） |
| 删除 `/payments/**` 路由 | 清理死配置 | 否 |
| 删除 `/offers/**` 路由 | 清理空壳 | **需确认** |
| 删除 `payments.requests.handle` 队列 | 内部 | 否 |

**唯一需要与前端确认的是 `/offers/**`。** 其余变更对 `travel-ui` 完全透明。
