# 服务接口清单

以下清单以当前源码的 Controller、`@RabbitListener` 和 Gateway 路由为准。鉴权使用 `X-User-Token`，不是 Bearer JWT。

## HTTP / WebSocket

| 服务 | HTTP 接口（按资源归纳） | WebSocket |
|---|---|---|
| travel-core | `GET /hotels/destinations`, `/hotels/search`, `/hotels/{hotelId}`；酒店管理 `POST /hotels/admin`、`PUT/DELETE /hotels/admin/{hotelId}`；房间管理 `POST /hotels/admin/{hotelId}/rooms`、`PUT /hotels/admin/{hotelId}/rooms/{roomId}`、`DELETE /hotels/admin/rooms/{roomId}`；交通查询 `GET /transports/`, `/transports/available`, `/transports/tickets`, `/transports/tickets/options`。交通资源变更当前由 RabbitMQ command listener 处理，没有 HTTP CRUD 映射。 | — |
| order | `GET /reservations/user/{userId}`, `GET /reservations/{id}`；取消、支付/退款查询与退款完成；`POST /reservations/tickets`, `/hotels`, `/purchase`；旧 `/reservations/reservation` 固定返回停用提示 | — |
| user | `/users/auth/register`, `/login`, `/logout`；`GET/PUT /users/me`；身份、银行卡、出行人 CRUD | — |
| community | `/community/posts`, `/reviews`, `/uploads`, `/attractions`, `/routes` 及其评论、点赞、收藏和当前用户查询 | — |
| ai-arrange | `/ai-arrange/api/conversations` 及会话、快照、版本、回滚、规划运行操作 | `/ai-arrange/ws/planner` |
| Python Agent | — | 内网 `GET /agent/health`、`POST /agent/planner/run`、`POST /agent/planner/stream` |

## RabbitMQ 契约

### travel-core 消费

- 酒店 RPC：`hotels.requests.hotelsBySearchQuery`、`hotels.requests.getHotelDetails`、`hotels.requests.checkAvailabilityByQuery.queue`
- 酒店事件：`hotels.events.createHotelReservation.queue.{uuid}`、`hotels.events.deleteHotelReservation.queue.{uuid}`
- 交通 RPC：`transports.requests.getTransportsBySearchQuery`、`transports.requests.getTransportsBetweenLocations`、`transports.requests.getTransportsBetweenMultipleLocations`、`transports.requests.checkAvailabilityByQuery.queue`
- 交通事件：`transports.createTransportReservation.queue.{uuid}`、`transports.deleteTransportReservation.queue.{uuid}`

### order 消费与发送

- 消费自身事件：`reservations.events.createReservation.queue.{uuid}`、`deleteReservation...`、`updateReservation...`。
- 发送到 travel-core：酒店可用性 RPC，以及酒店/交通创建和删除预订的 fanout exchange。travel-core 虽保留交通可用性 RPC listener，当前 order 下单路径没有调用它。
- 支付在 order 内为本地 `PaymentService.verifyTransaction` 调用，不再通过支付队列。

队列名、exchange 和 routing key 是兼容性契约；带 UUID 的队列为排他、自动删除队列。
