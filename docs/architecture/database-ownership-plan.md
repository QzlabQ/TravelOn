# TravelOn 数据表归属方案

**版本：** V2.1（按代码核实重写）
**日期：** 2026-08-28
**事实来源：** [代码核实基线](./verified-baseline.md)、`travel-api/database/schema/*.sql`、各服务 `db/migration/R__seed.sql`

> **V2.1 修订说明：** V2.0 中的表结构（字段、类型、约束、索引）为推断内容，与仓库 schema 不符，已整体作废重写。
> 本文档只列**真实存在的表**，字段细节以 `travel-api/database/schema/` 下的 SQL 为准，不在此重复抄录。

---

## 1. 现状：真实的库与表

| 数据库 | schema 是否应用 | 表 |
|--------|----------------|-----|
| `hotel_db` | 是 | `city`, `hotel`, `hotel_photos`, `photo`, `room`, `room_reservation` |
| `transport_db` | 是 | `city`, `ticket_offer_templates` |
| `reservation_db` | 是 | `reservation`, `reservation_room_reservations_ids`, `reservation_transport_reservations_ids`, `reservation_travelers`, `payment_transaction`, `refund_record` |
| `user_db` | 是 | `users`, `travelers` |
| `community_db` | 是 | `city`, `community_post`, `community_post_images`, `post_like`, `review`, `review_images`, `review_like`, `attraction`, `attraction_images`, `travel_route`, `travel_route_images`, `route_stop`, `community_favorite`, `community_comment`, `community_comment_like` |
| `payment_db` | **否** | （空库） |
| MongoDB `ai-arrange-db` | — | AI 会话与规划快照 |

另有两个视图：`hotel_db.hotel_room_inventory`、`transport_db.transport_offer_search_view`。

### 1.1 两个已经成立的事实

**其一：支付数据本就属于订单库。**

`payment_transaction` 与 `refund_record` 定义在 [reservation_schema.sql](../../travel-api/database/schema/reservation_schema.sql) 中，位于 `reservation_db`，由 reservation-service 读写。`ReservationController` 的 `GET /reservations/{id}/payments` 和 `/refunds` 就是查这两张表。

payment-service **没有任何 Entity、Repository 或数据源配置**，`payment_db` 建库后从未应用 schema，是一个空库。

因此 reservation + payment 合并**不涉及任何数据迁移**——数据早就在一起了。

**其二：三份 `city` 表内容同源。**

`hotel_db.city`、`transport_db.city`、`community_db.city` 的 DDL 完全一致：

```sql
CREATE TABLE public.city (
    id uuid NOT NULL,
    country character varying(255) NOT NULL,
    region character varying(255),
    city_id character varying(255),
    normalized_name character varying(255),
    province character varying(255)
);
-- PRIMARY KEY (id), UNIQUE (city_id)
```

三者的 `R__seed.sql` 都从**同一个文件** `/seed-data/common/cities.csv` 载入，且插入列表相同（`id, city_id, country, province, region, normalized_name`）、均带 `ON CONFLICT` 幂等保护。

这意味着 hotel 与 transport 合并到同一个库时，`city` 表**不存在数据冲突**——两份 seed 依次执行，第二份会因 `ON CONFLICT` 全部跳过。这是合并可行性的关键依据。

注意两者引用 `city` 的方式不同，合并后都要保留：

| 表 | 外键列 | 引用 |
|----|--------|------|
| `hotel` | `city_id uuid` | `city(id)` |
| `ticket_offer_templates` | `departure_city_id` / `arrival_city_id` varchar | `city(city_id)` |

---

## 2. 目标：合并后的数据归属

| 服务 | 数据库 | 拥有的表 |
|------|--------|---------|
| `travel-core-service` | `travel_core_db` | `city`, `hotel`, `hotel_photos`, `photo`, `room`, `room_reservation`, `ticket_offer_templates` + 两个视图 |
| `order-service` | `reservation_db`（不改名） | `reservation`, `reservation_room_reservations_ids`, `reservation_transport_reservations_ids`, `reservation_travelers`, `payment_transaction`, `refund_record` |
| `user-service` | `user_db` | `users`, `travelers` |
| `community-service` | `community_db` | 15 张表（不变） |
| `ai-arrange-service` | MongoDB `ai-arrange-db` | 不变 |

**库的数量：** 6 → 4（PostgreSQL）+ 1（MongoDB）。减少的是 `transport_db`（并入）与 `payment_db`（删除空库）。

### 2.1 为什么 order-service 不改库名

`reservation_db` 已经装着订单和支付的全部数据。改名成 `order_db` 需要一次 `pg_dump` + `restore` + 停机，换来的只是名字更好看。**不改名，零风险零工作量。**

服务叫 `order-service`，库叫 `reservation_db`，在 README 中注明即可。

### 2.2 为什么 travel-core 需要新建库

与 order-service 相反，hotel 与 transport 的表**当前确实分处两个库**，必须物理合并到一个库，否则单个 Spring Boot 进程需要配置两个数据源，等于把问题从"两个服务"变成"两个数据源"，收益归零。

新建 `travel_core_db` 优于复用 `hotel_db`：

| 方案 | 优点 | 缺点 |
|------|------|------|
| 新建 `travel_core_db` | 语义清晰；旧库原封不动保留，回滚只需改一个环境变量 | 首次启动需重新 seed |
| 复用 `hotel_db` 并导入 transport 表 | 省一次 seed | 污染旧库，回滚需清理；库名与内容不符 |

**推荐新建。** 由于 seed 完全由 Flyway 的 `R__seed.sql` 从 CSV 重建，新建库不需要 `pg_dump`——启动服务即自动填充。

---

## 3. 数据库变更清单

### 3.1 建库脚本

[database/init/001-create-service-databases.sql](../../travel-api/database/init/001-create-service-databases.sql)：

```sql
-- 新增
SELECT 'CREATE DATABASE travel_core_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'travel_core_db')\gexec

-- 删除 payment_db 的创建语句（空库，无人使用）
```

保留 `hotel_db` 与 `transport_db` 的创建语句直到重构验收通过，作为回滚退路。

### 3.2 Schema 脚本

新增 `database/schema/travel_core_schema.sql`，内容为 `hotel_schema.sql` 与 `transport_schema.sql` 的合并，去掉重复的 `city` 定义：

```
travel_core_schema.sql
├── city                      （取自任一份，两者相同）
├── hotel / hotel_photos / photo / room / room_reservation   （来自 hotel）
├── ticket_offer_templates                                    （来自 transport）
├── 全部索引与外键
└── 两个视图：hotel_room_inventory, transport_offer_search_view
```

[database/init/010-apply-service-schema-and-seed.sql](../../travel-api/database/init/010-apply-service-schema-and-seed.sql) 增加：

```sql
\connect travel_core_db
\i /database/schema/travel_core_schema.sql
```

并删除末尾无意义的 `\connect payment_db`。

### 3.3 Flyway seed 合并

travel-core-service 需要一个合并后的 `src/main/resources/db/migration/R__seed.sql`：

- hotel 的 `R__seed.sql`：`city` + `hotel` + `room` + `hotel_photos`
- transport 的 `R__seed.sql`：`city` + `ticket_offer_templates`

合并时**只保留一份 `city` 载入逻辑**，其余按原样拼接。两份原脚本使用不同的临时表名（`seed_cities` 与 `seed_cities_transport`），不会互相覆盖，但保留两份是无谓的重复 IO。

**注意 Flyway 的 checksum 行为：** `R__` 是 repeatable migration，文件内容一变就会在下次启动时重跑。对新建的 `travel_core_db` 而言这是首次执行，无影响；但要确保所有 `INSERT` 都带 `ON CONFLICT DO NOTHING`（原脚本已具备），否则重跑会失败。

### 3.4 容器挂载

transport 的 seed 依赖运行时文件，合并后的服务必须继承（见 [docker-compose.yml](../../travel-api/docker-compose.yml) 中 `transport` 的配置）：

```yaml
travel-core:
  volumes:
    - ./seed-data/common:/seed-data/common:ro   # CityCatalog 运行时读取
  environment:
    APP_SEED_DATA_COMMON_BASE_PATH: file:/seed-data/common/
```

`R__seed.sql` 中的 `COPY ... FROM '/seed-data/...'` 是**服务端** COPY，由 postgres 容器读取，路径依赖 postgres 容器已有的 `./seed-data:/seed-data:ro` 挂载，无需改动。

---

## 4. 数据访问边界

### 4.1 归属原则

| 服务 | 可直接读写 | 需通过接口/消息 |
|------|-----------|----------------|
| travel-core-service | `travel_core_db` 全部表 | 订单、用户、社区数据 |
| order-service | `reservation_db` 全部表（含支付表） | 酒店/交通库存 → RabbitMQ |
| user-service | `user_db` | 其他一切 |
| community-service | `community_db` | 其他一切 |
| ai-arrange-service | MongoDB | 业务数据 → Gateway HTTP |

### 4.2 现状中已经成立的边界

核实发现，当前代码**没有**跨库直接查询：各服务的 `SPRING_DATASOURCE_URL` 各指一库，Saga 通过 RabbitMQ 协作，`room_reservation.main_reservation_id` 只是一个 UUID 值、**没有**指向 `reservation_db` 的物理外键。

这是一个好的既有状态，合并后必须保持：`travel_core_db` 与 `reservation_db` 之间不得建立外键。

### 4.3 合并后新增的服务内边界

hotel 与 transport 合并进同一个库后，它们之间**在数据库层面**不再有隔离。为避免退化成大泥球，约束落在代码层：

- `hotel` 包的 Repository 只查 `hotel/room/room_reservation/city`
- `transport` 包的 Repository 只查 `ticket_offer_templates/city`
- `city` 是两者共享的只读参考数据，允许都读；写入只在 seed 阶段发生
- 禁止编写跨 `hotel` 与 `transport` 两个领域表的 JOIN 查询

---

## 5. 迁移与回滚

### 5.1 迁移步骤（无停机要求）

由于 `travel_core_db` 是新建库且 seed 可从 CSV 完整重建，**不需要 `pg_dump` 导数据**：

1. 在 init 脚本中加入 `travel_core_db` 的建库与 schema
2. 重建 postgres 数据卷（或手工执行建库 + schema）
3. 启动 travel-core-service，Flyway 自动 seed
4. 校验行数与旧库一致
5. 切换 Gateway 路由，停掉 hotel / transport 容器

**注意第 2 步：** 现有 init 脚本只在**空数据卷**首次启动时执行（Docker postgres 镜像的 `docker-entrypoint-initdb.d` 语义）。已有数据卷的环境需手工执行建库与 schema 脚本，或接受一次数据卷重建。开发环境推荐直接重建；若有需要保留的业务数据，走手工路径。

### 5.2 校验查询

```sql
-- 旧库
\c hotel_db
SELECT 'hotel' t, count(*) FROM hotel UNION ALL
SELECT 'room', count(*) FROM room UNION ALL
SELECT 'room_reservation', count(*) FROM room_reservation UNION ALL
SELECT 'city', count(*) FROM city;

\c transport_db
SELECT 'ticket_offer_templates', count(*) FROM ticket_offer_templates UNION ALL
SELECT 'city', count(*) FROM city;

-- 新库：hotel/room/ticket 各表应与旧库一致，city 应等于旧库的 city（非两者之和）
\c travel_core_db
SELECT 'hotel' t, count(*) FROM hotel UNION ALL
SELECT 'room', count(*) FROM room UNION ALL
SELECT 'room_reservation', count(*) FROM room_reservation UNION ALL
SELECT 'ticket_offer_templates', count(*) FROM ticket_offer_templates UNION ALL
SELECT 'city', count(*) FROM city;
```

`city` 的行数应等于单个旧库的 `city` 行数，**不是两倍**。若出现两倍，说明合并后的 seed 脚本保留了两份载入逻辑且 `ON CONFLICT` 失效，需检查。

### 5.3 回滚

旧库 `hotel_db` 与 `transport_db` 在验收期内不删除。回滚只需：

1. Gateway 路由改回 `lb://hotel-service` 与 `lb://transport-service`
2. 重新启动 hotel / transport 容器
3. 停掉 travel-core 容器

因为旧库数据从未被修改，回滚**不涉及数据恢复**。

`travel_core_db` 与 `payment_db` 的删除应推迟到验收通过并稳定运行之后。

---

## 6. 与 V2.0 的差异

| V2.0 的说法 | 实际 | 修正 |
|------------|------|------|
| 列出 `hotels`, `rooms`, `flights`, `trains`, `hotel_availability`, `transport_availability`, `resource_locks` 等表及完整字段 | 这些表**不存在**。真实表为 `hotel`, `room`, `ticket_offer_templates` 等，单数命名，无独立 availability 表，无 `resource_locks` 表 | 按真实 schema 重写 |
| 建议新增 `resource_locks` 统一锁表 | 现有实现用 `room_reservation` 的日期区间判断可用性，没有独立锁表 | 移出本次范围。新增锁表属于功能改造，不是服务合并 |
| 建议新增 `saga_execution_log`, `compensation_records` | 不存在 | 同上，移出本次范围 |
| 支付表在 `payment_db`，需迁移 | 已在 `reservation_db` | 无需迁移 |
| 数据库采用"逻辑映射"复用 `hotel_db` | hotel 与 transport 分处两库，逻辑映射解决不了 | 改为新建 `travel_core_db` |
| 备份/RPO/RTO/监控告警阈值等章节 | 均为通用模板，与本项目无对应实现 | 删除。本次不引入监控体系 |
