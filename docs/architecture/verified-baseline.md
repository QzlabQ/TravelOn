# TravelOn 当前架构：代码核实基线

**版本：** V1.0
**核实日期：** 2026-08-28
**核实方式：** 逐一阅读 `travel-api` 源码、Gateway 路由、数据库 schema 与 RabbitMQ 配置
**用途：** 作为 [微服务合并重构方案](./microservices-consolidation-plan.md) 的事实依据

> 本文档只记录**从仓库代码中可验证的事实**，每条结论都给出文件路径。
> 方案类文档中的推断、建议和目标状态不写入本文档。

---

## 0. 核实结论摘要

本次核实推翻了此前方案文档中的四个前提，其中前两条会改变重构动作本身：

| # | 此前假设 | 代码事实 | 影响 |
|---|---------|---------|------|
| 1 | offer-provider 通过 RabbitMQ 组合酒店和交通数据，应"合并" | **它是一个空壳**，所有方法返回空列表或占位符，无数据库、无实际 MQ 流量、无 WebSocket handler | 应当**删除**，而不是合并。没有可合并的逻辑 |
| 2 | payment 的表在 `payment_db` | `payment_transaction`、`refund_record` **已在 `reservation_db`**；`payment_db` 建库后未应用任何 schema，是空库 | reservation + payment 合并**不需要迁移任何数据** |
| 3 | payment-service 有独立 HTTP API | 无任何 HTTP 映射，仅一个 `@RabbitListener`；但 Gateway 仍配了 `/payments/**` 死路由 | 合并时需一并删除该死路由 |
| 4 | 队列名形如 `hotel.availability.request` | 实际为 `hotels.requests.checkAvailabilityByQuery.queue` 等 | 所有涉及队列名的迁移步骤需按实际名称改写 |

---

## 1. 部署单元现状

来源：[travel-api/docker-compose.yml](../../travel-api/docker-compose.yml)

### 1.1 基础设施容器（4 个）

| 容器 | 镜像/构建 | 宿主机端口 | 说明 |
|------|----------|-----------|------|
| `postgres` | postgres:16 | 55432 | 单实例，多逻辑库 |
| `rabbitmq` | rabbitmq:3.13-management | 55672 / 55673 | |
| `mongo` | mongo:7 | 57017 | 仅 ai-arrange 使用 |
| `discovery` | ./discovery-service | 58010 | Eureka Server |

### 1.2 网关（1 个）

| 容器 | 宿主机端口 |
|------|-----------|
| `gateway` | 58082 |

### 1.3 业务容器（9 个）

`hotel`、`transport`、`offer-provider`、`reservation`、`payment`、`user`、`community`、`ai-arrange`、`ai-arrange-agent`

**合计运行容器：14 个**（其中 Java/Python 应用 11 个）。

### 1.4 与 compose 相关的既有事实

- `ai-arrange-agent` **已经**只用 `expose: "8090"`，没有 `ports` 映射，也没有 `depends_on: discovery`。
- `data-generator` 在 compose 中**不存在**（旧文档 [微服务迭代方案.md](../ite/微服务迭代方案.md) 提到它，已过时）。
- 只有 `postgres` 定义了 `healthcheck`；其余服务的 `depends_on` 多为 `service_started`，不保证应用就绪。

---

## 2. Gateway 路由现状

来源：[api-gateway/src/main/resources/application.yml](../../travel-api/api-gateway/src/main/resources/application.yml)

| 路由 id | 断言路径 | 目标 | 状态 |
|---------|---------|------|------|
| `hotel-service` | `/hotels/**` | `lb://hotel-service` | 生效 |
| `transport-service` | `/transports/**` | `lb://transport-service` | 生效 |
| `offer-provider-service` | `/offers/**` | `lb://offer-provider-service` | 生效但后端是空壳 |
| `user-service` | `/users/**` | `lb://user-service` | 生效 |
| `community-service` | `/community/**` | `lb://community-service` | 生效 |
| `reservation-service` | `/reservations/**` | `lb://reservation-service` | 生效 |
| `payment-service` | `/payments/**` | `lb://payment-service` | **死路由**，后端无 HTTP 端点 |
| `ai-arrange-websocket` | `/ai-arrange/ws/**` | `lb:ws://ai-arrange-service` | 生效 |
| `ai-arrange-service` | `/ai-arrange/**` | `lb://ai-arrange-service` | 生效 |

**注意路由顺序：** `ai-arrange-websocket` 必须排在 `ai-arrange-service` 之前，否则 `/ai-arrange/ws/**` 会被前缀更宽的 HTTP 路由抢先匹配。改动路由时必须保持这个相对顺序。

**未覆盖项：** reservation-service 注册了 WebSocket 端点 `/reservations/ws/offerBought`（见 §3.4），但 Gateway 中**没有**对应的 `lb:ws://reservation-service` 路由，只有 HTTP 的 `/reservations/**`。该 WebSocket 是否能正常经网关升级需实测确认。

---

## 3. 各服务对外契约

### 3.1 hotel-service

来源：[HotelsController.java](../../travel-api/hotel-service/src/main/java/org/microarchitecturovisco/hotelservice/controllers/HotelsController.java)（`@RequestMapping("/hotels")`）

**HTTP 端点：**

| 方法 | 路径 | 鉴权 |
|------|------|------|
| GET | `/hotels/destinations` | 无 |
| GET | `/hotels/search` | 无 |
| GET | `/hotels/{hotelId}` | 无 |
| POST | `/hotels/admin` | `X-User-Token`，需 admin |
| PUT | `/hotels/admin/{hotelId}` | 需 admin |
| DELETE | `/hotels/admin/{hotelId}` | 需 admin |
| POST | `/hotels/admin/{hotelId}/rooms` | 需 admin |
| PUT | `/hotels/admin/{hotelId}/rooms/{roomId}` | 需 admin |
| DELETE | `/hotels/admin/rooms/{roomId}` | 需 admin |

`GET /hotels/search` 的真实查询参数为：`destinationId`(UUID, 必填)、`dateFrom`、`dateTo`(ISO date, 必填)、`adults`(默认 2)、`hotelName`、`minPrice`、`maxPrice`、`minRating`、`hotelType`(默认 ALL)、`roomType`(默认 ALL)、`sortBy`(默认 price)。

**RabbitMQ 监听：**

| 队列 | 语义 | 有无返回值 |
|------|------|-----------|
| `hotels.requests.hotelsBySearchQuery` | 按搜索条件查酒店 | 有（RPC） |
| `hotels.requests.getHotelDetails` | 查酒店详情 | 有（RPC） |
| `hotels.requests.checkAvailabilityByQuery.queue` | 查可用性 | 有（RPC） |
| `hotels.events.createHotelReservation.queue.{uuid}` | 创建房间预订 | 无（事件） |
| `hotels.events.deleteHotelReservation.queue.{uuid}` | 删除房间预订 | 无（事件） |

另有 [HotelsCommandController.java](../../travel-api/hotel-service/src/main/java/org/microarchitecturovisco/hotelservice/controllers/HotelsCommandController.java)。

### 3.2 transport-service

来源：[TransportsQueryController.java](../../travel-api/transport-service/src/main/java/org/microarchitecturovisco/transport/controllers/TransportsQueryController.java)（`@RequestMapping("/transports")`）

**HTTP 端点：** `/transports/`、`/transports/locations`、`/transports/locations/{region}`、`/transports/available`、`/transports/tickets`、`/transports/tickets/options`、`/transports/tickets/templates`(POST)、`/transports/tickets/templates/{templateId}`(PUT/DELETE)、`/transports/admin`(POST)、`/transports/admin/{transportId}`(PUT/DELETE)、`/transports/test`。

**RabbitMQ 监听：**

| 队列 |
|------|
| `transports.requests.getTransportsBySearchQuery` |
| `transports.requests.getTransportsBetweenLocations` |
| `transports.requests.getTransportsBetweenMultipleLocations` |
| `transports.requests.checkAvailabilityByQuery.queue` |
| `transports.createTransportReservation.queue.{uuid}` |
| `transports.deleteTransportReservation.queue.{uuid}` |

### 3.3 offer-provider-service（空壳）

来源：[OffersService.java](../../travel-api/offer-provider-service/src/main/java/org/microarchitecturovisco/offerprovider/services/OffersService.java)、[OffersController.java](../../travel-api/offer-provider-service/src/main/java/org/microarchitecturovisco/offerprovider/controllers/OffersController.java)

这是本次核实中最重要的发现。该服务当前**不提供任何真实功能**：

- `getOffersBasedOnSearchQuery(...)` 直接 `return List.of();`
- `getOfferDetails(...)` 返回硬编码占位对象，`hotelName` 为 `"旅游产品功能重构中"`，`price` 为 `-1.00`
- `getOfferPrice(...)` 返回 `-1.00`
- Controller 中 `getOfferDetails` 和 `getOfferPrice` **没有 HTTP 注解**，无法从外部调用
- 唯一的 HTTP 端点 `GET /offers/` 日志写着 `"Legacy tour product search shell requested; old offer composition is disabled"`
- [websockets/WebSocketConfig.java](../../travel-api/offer-provider-service/src/main/java/org/microarchitecturovisco/offerprovider/websockets/WebSocketConfig.java) 的 `registerWebSocketHandlers` **方法体为空**，未注册任何 handler
- 服务内**没有** Entity、Repository、数据库配置
- [queues/config/QueuesConfig.java](../../travel-api/offer-provider-service/src/main/java/org/microarchitecturovisco/offerprovider/queues/config/QueuesConfig.java) 声明了 4 个 exchange/queue Bean，但服务代码中**没有任何 `rabbitTemplate` 调用**，这些声明只会在 RabbitMQ 里创建对象、不产生流量

**结论：** offer-provider-service 是一个仅为保持前端不 404 而存在的兼容壳。它没有可以"合并进 travel-core-service"的业务逻辑。

### 3.4 reservation-service

来源：[ReservationController.java](../../travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/controllers/ReservationController.java)（`@RequestMapping("/reservations")`）

**HTTP 端点：**

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
| POST | `/reservations/reservation` | 无（**已停用**，固定返回 `"Tour product reservation is being rebuilt"`） |

**WebSocket：** `/reservations/ws/offerBought`，见 [websockets/WebSocketConfig.java](../../travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/websockets/WebSocketConfig.java)

**RabbitMQ 监听：** `reservations.events.createReservation.queue.{uuid}`、`...deleteReservation.queue.{uuid}`、`...updateReservation.queue.{uuid}`

**RabbitMQ 发送**（见 [ReservationService.java](../../travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/services/ReservationService.java)、[saga/](../../travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/services/saga/)）：

| 目标 exchange | routing key | 方式 | 调用点 |
|--------------|-------------|------|--------|
| `hotels.requests.checkAvailabilityByQuery.exchange` | `...routingKey` | `convertSendAndReceive`（阻塞 RPC） | `BookHotelsSaga` |
| `hotels.createReservation.exchange` | `""`（fanout） | `convertAndSend` | `BookHotelsSaga` |
| `hotels.deleteReservation.exchange` | `""`（fanout） | `convertAndSend` | `BookHotelsSaga` |
| `transports.requests.checkAvailabilityByQuery.exchange` | `...routingKey` | `convertSendAndReceive` | `BookTransportsSaga` |
| `transports.createReservation.exchange` | `""`（fanout） | `convertAndSend` | `BookTransportsSaga` |
| `transports.deleteReservation.exchange` | `""`（fanout） | `convertAndSend` | `BookTransportsSaga` |
| `payments.requests.handle` | `payments.handlePayment` | `convertSendAndReceive` | `ReservationService:517` |
| `reservations.events.{create,update,delete}Reservation.exchange` | `""`（fanout） | `convertAndSend` | 自消费 |

**一个已存在的绑定不一致：** hotel-service 的 `QueuesConfig` 把 `hotels.requests.checkAvailabilityByQuery.queue` 绑定到 exchange 时用的 routing key 是**队列名本身**，而 reservation-service 的 `QueuesHotelConfig` 用的是 `hotels.requests.checkAvailabilityByQuery.routingKey`。两边对同一个队列建了两条不同 routing key 的绑定，实际生效的是 reservation 侧那条。合并时不要只保留其一。

### 3.5 payment-service

来源：[PaymentController.java](../../travel-api/payment-service/src/main/java/org/microarchitecturovisco/paymentservice/controllers/PaymentController.java)

整个服务只有 10 个 Java 文件，且：

- `PaymentController` 标注了 `@RestController`，但**没有任何 HTTP 映射注解**，只有一个 `@RabbitListener(queues = "payments.requests.handle")`
- **无 Entity、无 Repository、无数据源配置** —— 服务是无状态的
- 核心逻辑是 `PaymentService.verifyTransaction(...)`，即模拟支付校验

**结论：** payment-service 是一个无状态的消息处理器。Gateway 上的 `/payments/**` 路由指向它，但它没有 HTTP 端点，该路由是死的。

### 3.6 user-service

来源：[UserController.java](../../travel-api/user-service/src/main/java/org/microarchitecturovisco/userservice/controllers/UserController.java)（`@RequestMapping("/users")`）

`POST /users/auth/register`、`POST /users/auth/login`、`POST /users/auth/logout`、`GET /users/me`、`PUT /users/me`、`GET|POST /users/me/travelers`、`PUT|DELETE /users/me/travelers/{travelerId}`。

认证方式为自定义请求头 `X-User-Token`（**不是** JWT `Authorization: Bearer`）。其他服务的鉴权逻辑均围绕该请求头展开。

### 3.7 community-service

来源：[CommunityController.java](../../travel-api/community-service/src/main/java/org/microarchitecturovisco/communityservice/controller/CommunityController.java)（`@RequestMapping("/community")`）

单个 Controller 内约 **34 个 HTTP 端点**，覆盖帖子、评论、点赞、收藏、评价、景点、路线、路线站点、图片上传等。

这印证了"community 规模不小"的判断：它的对外端点数量超过其余任何单个服务，不宜与 user-service 合并。

### 3.8 ai-arrange-service / ai-arrange-agent-service

- Java 侧 HTTP：`@RequestMapping("/ai-arrange/api/conversations")`，见 [PlannerConversationController.java](../../travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/controller/PlannerConversationController.java)
- Java 侧 WebSocket：`/ai-arrange/ws/planner`，见 [config/WebSocketConfig.java](../../travel-api/ai-arrange-service/src/main/java/org/microarchitecturovisco/aiarrangeservice/config/WebSocketConfig.java)
- Java → Python：HTTP + SSE，地址由 compose 中 `AI_ARRANGE_AGENT_BASE_URL=http://ai-arrange-agent:8090` 指定
- Python 侧已经不注册 Eureka、不映射宿主机端口

**这一部分的目标状态已经实现，无需改动。**

---

## 4. 数据库现状

### 4.1 库的创建与 schema 应用

来源：[database/init/001-create-service-databases.sql](../../travel-api/database/init/001-create-service-databases.sql)、[database/init/010-apply-service-schema-and-seed.sql](../../travel-api/database/init/010-apply-service-schema-and-seed.sql)

| 数据库 | 是否建库 | 是否应用 schema |
|--------|---------|----------------|
| `hotel_db` | 是 | 是（`hotel_schema.sql`） |
| `transport_db` | 是 | 是（`transport_schema.sql`） |
| `user_db` | 是 | 是（`user_schema.sql`） |
| `reservation_db` | 是 | 是（`reservation_schema.sql`） |
| `community_db` | 是 | 是（`community_schema.sql`） |
| `payment_db` | 是 | **否** —— init 脚本末尾 `\connect payment_db` 之后没有任何语句 |

`payment_db` 是一个建好但从未使用的空库。

### 4.2 真实表清单

来源：`travel-api/database/schema/*.sql`

| 数据库 | 表 |
|--------|-----|
| `hotel_db` | `city`, `hotel`, `hotel_photos`, `photo`, `room`, `room_reservation` |
| `transport_db` | `city`, `ticket_offer_templates` |
| `user_db` | `users`, `travelers` |
| `reservation_db` | `reservation`, `reservation_room_reservations_ids`, `reservation_transport_reservations_ids`, `reservation_travelers`, **`payment_transaction`**, **`refund_record`** |
| `community_db` | `city`, `community_post`, `community_post_images`, `post_like`, `review`, `review_images`, `review_like`, `attraction`, `attraction_images`, `travel_route`, `travel_route_images`, `route_stop`, `community_favorite`, `community_comment`, `community_comment_like` |
| `payment_db` | （空） |

**关键事实：** 支付与退款的两张表 `payment_transaction`、`refund_record` **已经属于 `reservation_db`**，由 reservation-service 读写（`ReservationController` 的 `/payments` 和 `/refunds` 端点即查询这两张表）。

**已存在的表名重复：** `city` 表在 `hotel_db`、`transport_db`、`community_db` 中各有一份独立副本。合并 hotel 与 transport 时，这是必须先解决的冲突点（见 §5）。

### 4.3 Seed 数据机制

`010-apply-service-schema-and-seed.sql` 的注释说明：seed 数据**不再**由 init 脚本加载，而是由各服务的 Flyway repeatable migration `src/main/resources/db/migration/R__seed.sql` 在服务启动时通过服务端 `COPY` 从 CSV 载入。

因此合并服务时，Flyway 迁移脚本也必须一并合并，且需注意 `R__` 可重复迁移的 checksum 变化会触发重跑。

---

## 5. 合并 hotel + transport 的真实障碍

基于上述事实，把 hotel 与 transport 合并到同一个 Spring Boot 进程 + 同一个数据库，需要先解决：

1. **`city` 表冲突。** 两库各有一张 `city`，内容与主键未必一致。合并到单库时必须二选一或重命名，并同步修改双方的 Entity 与外键。
2. **Flyway seed 冲突。** 两个服务各有 `R__seed.sql`，合并后需要合成一个，且 CSV 的 `COPY` 目标表名需消歧。
3. **transport 的运行时文件依赖。** compose 中 transport 挂载了 `./seed-data/common:/seed-data/common:ro` 并设置 `APP_SEED_DATA_COMMON_BASE_PATH`，`CityCatalog` 依赖该文件。合并后的服务必须继承这个挂载与环境变量。
4. **两套 JSON 工具类同名。** 双方各有 `utils/JsonReader`、`utils/JsonConverter`，包名不同但类名相同，合并后需保持在各自子包内，不能提升到公共包。

这些都是可解决的工程问题，但它们是阶段 1 的**实际工作量所在**，远大于"复制目录 + 改包名"。

---

## 6. 与既有文档的差异

[docs/ite/微服务迭代方案.md](../ite/微服务迭代方案.md)（V1.0，2026-08-20）中如下描述与当前代码不符：

- 提到 `data-generator` 服务 —— compose 中不存在
- 称 offer-provider "组合酒店和交通信息，生成旅游报价" —— 该逻辑已被移除，现为空壳
- 建议将 user 与 community 合并为 `user-community-service` —— community 有 34 个端点，且认证是横向依赖，本次不采纳

本文档在这些点上取代该旧文档。
