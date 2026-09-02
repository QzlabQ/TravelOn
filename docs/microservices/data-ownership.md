# 数据表归属表

来源：`travel-api/database/schema/*.sql`、各服务 Flyway migration 和 Compose 数据源配置。服务只能直接访问自己的数据库；跨服务通过 HTTP 或 RabbitMQ。

| 服务 | 数据库 | 表/集合 |
|---|---|---|
| travel-core-service | `travel_core_db` | `city`, `hotel`, `hotel_photos`, `room`, `room_reservation`, `ticket_offer_templates`；视图 `hotel_room_inventory`, `transport_offer_search_view` |
| order-service | `reservation_db` | `reservation`, `reservation_room_reservations_ids`, `reservation_transport_reservations_ids`, `reservation_travelers`, `payment_transaction`, `refund_record`；视图 `reservation_frontend_summary` |
| user-service | `user_db` | `users`, `travelers`, `user_identities`, `saved_bank_cards`；视图 `user_frontend_profile` |
| community-service | `community_db` | `city`, `community_post`, `community_post_images`, `post_like`, `review`, `review_images`, `review_like`, `attraction`, `attraction_images`, `travel_route`, `travel_route_images`, `route_stop`, `community_favorite`, `community_comment`, `community_comment_like`；视图 `community_target_summary` |
| ai-arrange-service | MongoDB `ai-arrange-db` | `planner_conversations`, `planner_messages`, `planner_snapshots`, `planner_day_revisions` |
| ai-arrange-agent-service | 无 | 不直接读写业务数据 |

## 归属要点

1. `payment_transaction`、`refund_record` 已位于 `reservation_db`，因此 payment 合并到 order 不需要迁移支付表。
2. `travel_core_db` 的 `city` 是酒店和交通共享的只读参考表；不得建立跨 `travel_core_db` 与 `reservation_db` 的物理外键。
3. 社区仍有自己的 `city` 表，不能把社区 Repository 指向 travel-core 数据库。
4. 首次启动由 `database/schema/travel_core_schema.sql` 建表，Flyway repeatable seed 从挂载的 CSV 加载数据。
