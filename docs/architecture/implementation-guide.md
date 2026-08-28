# TravelOn 微服务合并实施指南

**版本：** V1.0
**日期：** 2026-08-28
**前置阅读：** [代码核实基线](./verified-baseline.md)、[合并重构方案](./microservices-consolidation-plan.md)

> 本指南中的包名、类名、队列名、配置项均取自仓库实际内容。
> 命令以仓库根目录 `e:\2026spring\26NULLptr\repositories` 为基准，shell 为 bash。

---

## 0. 实施前

### 0.1 现有构建配置（照抄，勿改版本）

| 项 | 值 |
|----|----|
| Spring Boot | `3.2.4`（parent） |
| Spring Cloud | `2023.0.0` |
| Java | `21` |
| Lombok | `1.18.42`（annotationProcessorPaths 显式声明） |
| JaCoCo | `0.8.12` |
| 构建镜像 | `jelastic/maven:3.9.5-openjdk-21` |
| 运行镜像 | `eclipse-temurin:21-jre` |

新建服务的 `pom.xml` 与 `Dockerfile` 应从 `hotel-service` 复制后改名，**不要重写**——现有 pom 里的 surefire `argLine`（JaCoCo 联动）和 Lombok exclude 都有实际作用。

### 0.2 真实包名对照

V2.0 的迁移脚本用了错误的包名。实际为：

| 服务 | 根包 |
|------|------|
| hotel-service | `org.microarchitecturovisco.hotelservice` |
| transport-service | `org.microarchitecturovisco.transport` ← **不是** `transportservice` |
| offer-provider-service | `org.microarchitecturovisco.offerprovider` |
| reservation-service | `org.microarchitecturovisco.reservationservice` |
| payment-service | `org.microarchitecturovisco.paymentservice` |

### 0.3 准备

```bash
cd e:/2026spring/26NULLptr/repositories
git checkout -b feature/microservice-consolidation

cd travel-api
mkdir -p backups
docker compose exec -T postgres pg_dumpall -U admin > "backups/backup_$(date +%Y%m%d_%H%M%S).sql"
cp api-gateway/src/main/resources/application.yml backups/gateway_routes_backup.yml
```

记录当前 RabbitMQ 绑定，作为阶段 3 的比对基准：

```bash
curl -su guest:guest http://localhost:55673/api/bindings > backups/rabbitmq_bindings_before.json
```

### 0.4 必须先确认的一件事

**`travel-ui` 是否调用 `GET /offers/`？**

```bash
cd ../travel-ui
grep -rn "offers" src/ --include=*.ts --include=*.tsx
```

结果决定阶段 1 的做法（见 §1.2）。这是整个重构中唯一可能影响前端的点。

---

## 1. 阶段 1：删除 offer-provider-service

**预估 0.5 天。** 先做这个：风险最低，且立即减少一个容器。

### 1.1 删除内容

```bash
cd travel-api
git rm -r offer-provider-service
```

从 [docker-compose.yml](../../travel-api/docker-compose.yml) 移除 `offer-provider:` service 块。

从 [api-gateway/application.yml](../../travel-api/api-gateway/src/main/resources/application.yml) 移除：

```yaml
        - id: offer-provider-service
          uri: lb://offer-provider-service
          predicates:
            - Path=/offers/**
          filters:
            - RemoveRequestHeader=Cookie
```

顺带移除同一文件中的死路由：

```yaml
        - id: payment-service
          uri: lb://payment-service
          predicates:
            - Path=/payments/**
          filters:
            - RemoveRequestHeader=Cookie
```

`payment-service` 容器本阶段**先不删**，阶段 2 才动。只删这条它并不提供的 HTTP 路由。

### 1.2 若前端仍依赖 `/offers/`

在 `hotel-service` 中临时加一个兼容端点（阶段 3 会随之并入 travel-core-service）：

```java
// 兼容壳：旧旅游套餐组合已下线，待前端移除调用后删除
@GetMapping("/offers/")
public List<Object> legacyOffers() {
    return List.of();
}
```

放在 hotel-service 而非新建服务，是为了让阶段 1 不引入新部署单元。同时把 Gateway 的 `/offers/**` 改指 `lb://hotel-service`。

### 1.3 验收

```bash
docker compose up -d --build
docker compose ps
curl -s http://localhost:58010/eureka/apps | grep -o '<name>[^<]*</name>' | sort -u
```

Eureka 中应不再出现 `OFFER-PROVIDER-SERVICE`。前端各页面无新增报错。

---

## 2. 阶段 2：合并 order-service

**预估 1.5 天。** 纯代码改动，不涉及数据库。

### 2.1 创建骨架

```bash
cd travel-api
cp -r reservation-service order-service
cd order-service
rm -rf target logs
```

改 `pom.xml`：

```xml
    <artifactId>order-service</artifactId>
    <name>order-service</name>
    <description>order-service</description>
```

改 `src/main/resources/application.properties` 第一行：

```properties
spring.application.name=order-service
```

**其余配置项全部不动**，尤其是 `spring.datasource.url` 的默认值 `jdbc:postgresql://postgres:5432/reservation_db` —— order-service 沿用该库。

### 2.2 迁入 payment 代码

payment-service 共 10 个文件，只需要其中 4 个：

| 迁入 | 目标位置 |
|------|---------|
| `services/PaymentService.java` | `order/payment/services/` |
| `models/dto/HandlePaymentRequestDto.java` | `order/payment/models/dto/` |
| `models/dto/HandlePaymentResponseDto.java` | `order/payment/models/dto/` |
| `utils/JsonConverter.java`、`utils/JsonReader.java` | 仅当 `PaymentService` 内部用到时迁入 `order/payment/utils/` |

**不迁入：** `PaymentController`（其唯一职责是 `@RabbitListener`，合并后不需要）、`rabbitmq/config/*`（队列声明不再需要）、`PaymentServiceApplication`、`Bootstrap`。

包名替换（注意 reservation 侧的包名保持 `reservationservice` 不变，只处理新迁入的 payment 文件）：

```bash
cd order-service/src/main/java/org/microarchitecturovisco
mkdir -p order/payment
# 复制上表中的文件到 order/payment/ 后：
find order/payment -name '*.java' -exec \
  sed -i 's/org\.microarchitecturovisco\.paymentservice/org.microarchitecturovisco.order.payment/g' {} +
```

> 因为主启动类仍在 `org.microarchitecturovisco.reservationservice` 下，新包 `org.microarchitecturovisco.order.payment` **不在其组件扫描路径内**。二选一：
> 1. 把 payment 放到 `org.microarchitecturovisco.reservationservice.payment`（改动最小，推荐本次采用）；
> 2. 在启动类加 `@SpringBootApplication(scanBasePackages = "org.microarchitecturovisco")`。
>
> 推荐方案 1：本次目标是合并部署单元，不是重构包结构。包重命名可以留到后续独立进行。

按方案 1 时替换目标为：

```bash
find order/payment -name '*.java' -exec \
  sed -i 's/org\.microarchitecturovisco\.paymentservice/org.microarchitecturovisco.reservationservice.payment/g' {} +
```

并把目录移到 `org/microarchitecturovisco/reservationservice/payment/`。

### 2.3 改调用点（唯一的实质改动）

位置：`ReservationService.java:517` 附近。

```java
// 改前
String responseMessage = (String) rabbitTemplate.convertSendAndReceive(
        "payments.requests.handle", "payments.handlePayment", transportMessageJson);
if (responseMessage != null) {
    // 解析 JSON -> HandlePaymentResponseDto
}

// 改后
HandlePaymentResponseDto responseDto = paymentService.verifyTransaction(requestDto);
```

注入：

```java
private final PaymentService paymentService;   // 类已有 @RequiredArgsConstructor
```

**三条不能违反的约束：**

1. **`InvalidPaymentHandler` 的补偿逻辑原样保留。** 它负责在支付失败时释放酒店与交通资源、删除订单。这是本阶段最容易被误删的部分，也是唯一的资源泄漏防线。
2. **`responseMessage == null` 分支可以删，异常处理不能删。** 本地调用不会 RPC 超时，但 `verifyTransaction` 仍可能抛异常，必须继续走补偿路径。
3. **不要顺手改 `reservations.events.*` 三条自发自收的 fanout 消息。** 它们本阶段保持原样，避免一次改两处。

### 2.4 清理

- 删除 order-service 中 `payments.requests.handle` 相关的队列/exchange 声明（若 reservation 侧声明过）
- `git rm -r payment-service`
- 从 compose 移除 `payment:` service 块

### 2.5 Gateway

```yaml
        - id: reservation-websocket          # 新增，必须在 HTTP 路由之前
          uri: lb:ws://order-service
          predicates:
            - Path=/reservations/ws/**
        - id: reservation-service
          uri: lb://order-service            # 仅改 uri
          predicates:
            - Path=/reservations/**
          metadata:
            cors:
              allowedOrigins: '*'
              allowedMethods: '*'
              allowedHeaders: '*'
```

### 2.6 验收

```bash
cd travel-api
docker compose up -d --build order gateway
docker compose logs -f order
```

| # | 场景 | 期望 |
|---|------|------|
| 1 | 下单 → 支付成功 | 订单状态变为 `PAID` |
| 2 | **下单 → 支付失败** | 酒店与交通资源被释放，订单取消 |
| 3 | `GET /reservations/{id}/payments` | 返回支付记录 |
| 4 | `GET /reservations/{id}/refunds` | 返回退款记录 |
| 5 | WebSocket `/reservations/ws/offerBought` | 可连接并收到推送 |
| 6 | RabbitMQ 管理界面 | `payments.requests.handle` 队列不再有消费者 |

**场景 2 是本阶段的核心验收项**，必须实测，不能只看代码。

---

## 3. 阶段 3：合并 travel-core-service

**预估 3 天。** 涉及新建库与 seed 合并，是工作量主体。

### 3.1 已确认无冲突的三点

核实结论，可放心推进：

1. **实体无重名。** hotel 侧实体为 `Hotel`、`Room`、`RoomReservation`、`Location`（映射 `city`）；transport 侧**只有一个** JPA 实体 `TicketOfferTemplate`。不存在同名实体或同表双映射。
2. **transport 不通过 JPA 访问 `city`。** 它用 `CityCatalog` 从 `/seed-data/common/cities.csv` 读取。因此合并后 `city` 表由 hotel 侧的 `Location` 实体单独拥有。
3. **`city` 数据同源。** 两侧 seed 都来自同一 CSV，插入列相同且带 `ON CONFLICT`，合并后不会重复。

仍需注意：两侧各有 `LocationDto`（DTO，非实体）与 `JsonReader`/`JsonConverter` 同名类。它们在不同子包中，**保持原位即可**，不要提升到公共包。

### 3.2 创建骨架

```bash
cd travel-api
cp -r hotel-service travel-core-service
cd travel-core-service
rm -rf target logs
```

`pom.xml` 改 `artifactId` / `name` / `description` 为 `travel-core-service`。

transport 的 pom 依赖需与 hotel 的对比，把 hotel 缺少的补进来：

```bash
diff <(grep -A2 '<artifactId>' ../hotel-service/pom.xml) \
     <(grep -A2 '<artifactId>' ../transport-service/pom.xml)
```

### 3.3 迁入 transport 代码

沿用阶段 2 的结论：**不重命名 hotel 侧的包**，把 transport 挂到 hotel 的根包下作为子包，避免改动组件扫描。

```bash
cd travel-core-service/src/main/java/org/microarchitecturovisco
mkdir -p hotelservice/transport
cp -r ../../../../../../transport-service/src/main/java/org/microarchitecturovisco/transport/* \
      hotelservice/transport/
# 移除 transport 自己的启动类
rm hotelservice/transport/TransportApplication.java

find hotelservice/transport -name '*.java' -exec \
  sed -i 's/org\.microarchitecturovisco\.transport/org.microarchitecturovisco.hotelservice.transport/g' {} +
```

> 根包沿用 `hotelservice` 只是为了少改动。若团队更在意命名一致性，可在**合并验收通过后**单独做一次全局包重命名，由 IDE 的 Rename Package 完成，风险可控。两件事不要混在一起。

`resources` 目录合并：

```bash
cp -r ../transport-service/src/main/resources/db/migration/V2__money_to_numeric.sql \
      travel-core-service/src/main/resources/db/migration/V2_1__transport_money_to_numeric.sql
```

> **注意 Flyway 版本号冲突：** hotel 与 transport **各有一个 `V2__money_to_numeric.sql`**。同一个 migration 目录下不能有两个 V2，必须给其中一个改版本号（如上例的 `V2_1`）。这是阶段 3 最容易踩的坑。

### 3.4 合并 `R__seed.sql`

新的 `travel-core-service/src/main/resources/db/migration/R__seed.sql` 结构：

```sql
SET search_path TO public;

-- === city（只保留一份，取自 hotel 侧）===
CREATE TEMP TABLE seed_cities (...);
COPY seed_cities FROM '/seed-data/common/cities.csv' WITH (FORMAT csv, HEADER true, DELIMITER E'\t', NULL '');
INSERT INTO public.city (id, city_id, country, province, region, normalized_name)
SELECT ... FROM seed_cities ON CONFLICT ... DO NOTHING;

-- === hotel 侧其余部分（原样搬入）===
-- seed_hotels / seed_hotel_rooms / seed_hotel_photos

-- === transport 侧（删掉其 seed_cities_transport 段落）===
CREATE TEMP TABLE seed_ticket_offers (...);
COPY seed_ticket_offers FROM '/seed-data/transport/plane/generated_ticket_offers.csv' ...;
COPY seed_ticket_offers FROM '/seed-data/transport/train/generated_ticket_offers.csv' ...;
INSERT INTO public.ticket_offer_templates ... ON CONFLICT ... DO NOTHING;
```

顺序要求：`city` 必须先于 `hotel` 与 `ticket_offer_templates`，因为两者都有指向 `city` 的外键。

### 3.5 数据库

新增 `travel-api/database/schema/travel_core_schema.sql`：合并 `hotel_schema.sql` 与 `transport_schema.sql`，去掉重复的 `city` 定义（两份完全相同，取其一）。保留全部索引、外键与两个视图。

[database/init/001-create-service-databases.sql](../../travel-api/database/init/001-create-service-databases.sql) 增加：

```sql
SELECT 'CREATE DATABASE travel_core_db'
WHERE NOT EXISTS (SELECT FROM pg_database WHERE datname = 'travel_core_db')\gexec
```

[database/init/010-apply-service-schema-and-seed.sql](../../travel-api/database/init/010-apply-service-schema-and-seed.sql) 增加：

```sql
\connect travel_core_db
\i /database/schema/travel_core_schema.sql
```

并删除末尾孤立的 `\connect payment_db`。

> **init 脚本只在空数据卷首次启动时执行。** 开发环境直接重建数据卷最省事：
> ```bash
> docker compose down
> rm -rf travel-api/data/postgres
> docker compose up -d
> ```
> 首次启动会重放 schema 与约 30 万行 seed，耗时较长，`postgres` 显示 `starting` 属正常（compose 中 `start_period` 已设为 1200s）。
> 若有必须保留的数据，改为手工连接 postgres 执行建库与 schema 脚本。

### 3.6 配置

`travel-core-service/src/main/resources/application.properties`：

```properties
spring.application.name=travel-core-service
spring.datasource.url=${SPRING_DATASOURCE_URL:jdbc:postgresql://postgres:5432/travel_core_db}
# 从 transport 的配置中补入这一行：
app.seed-data.common-base-path=${APP_SEED_DATA_COMMON_BASE_PATH:file:../seed-data/common/}
```

其余项（Eureka、RabbitMQ、Flyway baseline、ddl-auto=validate）保持 hotel 原值。

### 3.7 compose

```yaml
  travel-core:
    build: ./travel-core-service
    volumes:
      - ./logs/travel-core:/logs
      - ./seed-data/common:/seed-data/common:ro     # CityCatalog 运行时依赖，勿漏
    environment:
      SPRING_DATASOURCE_URL: jdbc:postgresql://postgres:5432/${TRAVEL_CORE_DB_NAME:-travel_core_db}
      SPRING_DATASOURCE_USERNAME: ${POSTGRES_USER:-admin}
      SPRING_DATASOURCE_PASSWORD: ${POSTGRES_PASSWORD:-admin}
      APP_SEED_DATA_COMMON_BASE_PATH: file:/seed-data/common/
    depends_on:
      postgres: { condition: service_healthy }
      rabbitmq: { condition: service_started }
      discovery: { condition: service_started }
      gateway:  { condition: service_started }
    networks:
      - backend
```

移除 `hotel:` 与 `transport:` service 块。

### 3.8 Gateway

```yaml
        - id: travel-core-hotels
          uri: lb://travel-core-service      # 仅改 uri
          predicates:
            - Path=/hotels/**
          filters:
            - RemoveRequestHeader=Cookie
        - id: travel-core-transports
          uri: lb://travel-core-service
          predicates:
            - Path=/transports/**
          filters:
            - RemoveRequestHeader=Cookie
```

### 3.9 验收

**先比对 RabbitMQ 绑定** —— 这是本阶段最高风险项：

```bash
curl -su guest:guest http://localhost:55673/api/bindings > backups/rabbitmq_bindings_after.json
diff <(jq -r '.[] | "\(.source)|\(.destination)|\(.routing_key)"' backups/rabbitmq_bindings_before.json | sort) \
     <(jq -r '.[] | "\(.source)|\(.destination)|\(.routing_key)"' backups/rabbitmq_bindings_after.json | sort)
```

允许出现的差异只有 `{uuid}` 后缀的排他队列减少。**不允许**出现 exchange 或 routing key 的缺失。

特别确认 `hotels.requests.checkAvailabilityByQuery.exchange` 上仍有**两条**绑定（routing key 分别为 `...queue` 与 `...routingKey`），transport 同理。缺一条会导致可用性 RPC 超时。

**数据行数校验：**

```sql
\c travel_core_db
SELECT 'hotel' t, count(*) FROM hotel
UNION ALL SELECT 'room', count(*) FROM room
UNION ALL SELECT 'room_reservation', count(*) FROM room_reservation
UNION ALL SELECT 'ticket_offer_templates', count(*) FROM ticket_offer_templates
UNION ALL SELECT 'city', count(*) FROM city;
```

`city` 应等于旧库单份的行数，**不是两倍**。

**功能校验：**

```bash
curl -s "http://localhost:58082/hotels/destinations"
curl -s "http://localhost:58082/hotels/search?destinationId=<真实UUID>&dateFrom=2026-09-01&dateTo=2026-09-03&adults=2"
curl -s "http://localhost:58082/transports/locations"
curl -s "http://localhost:58082/transports/tickets/options"
```

`destinationId` 需从 `/hotels/destinations` 的返回中取真实值。

---

## 4. 阶段 4：收尾

**预估 0.5 天。**

- 确认 compose 中只剩 8 个应用容器 + 4 个基础设施
- Eureka 中应恰好有：`API-GATEWAY`、`TRAVEL-CORE-SERVICE`、`ORDER-SERVICE`、`USER-SERVICE`、`COMMUNITY-SERVICE`、`AI-ARRANGE-SERVICE`
- `ai-arrange-agent` **不应**出现在 Eureka 中（本就如此，确认未被误改）
- 检查 Gateway 路由顺序：两条 `ws` 路由分别位于同前缀 HTTP 路由之前

```bash
docker compose ps
curl -s http://localhost:58010/eureka/apps | grep -o '<name>[^<]*</name>' | sort -u
```

---

## 5. 阶段 5：集成测试

**预估 1.5 天。** 完整场景清单见[合并重构方案 §8](./microservices-consolidation-plan.md)。

按风险排序，前两条必须实测：

| # | 场景 | 覆盖的风险 |
|---|------|-----------|
| 1 | 支付失败 → 资源释放 → 订单取消 | 阶段 2 的补偿路径 |
| 2 | 酒店与交通可用性查询 | 阶段 3 的队列绑定 |
| 3 | 下单成功全流程 | 主干 |
| 4 | 酒店搜索 / 详情 | city 关联 |
| 5 | 交通票务查询 | `city(city_id)` 外键 |
| 6 | 订单 WebSocket | 新增 ws 路由 |
| 7 | AI 规划 WebSocket + SSE | 未被路由改动波及 |
| 8 | 管理员 CRUD | `X-User-Token` 鉴权 |

现有单测运行方式不变：

```powershell
powershell -ExecutionPolicy Bypass -File .\tests\run-unit-test-coverage.ps1
```

`tests/run-unit-test-coverage.ps1` 中按模块名配置了待测目录，合并后需要把 `hotel-service` / `transport-service` / `reservation-service` 的条目替换为 `travel-core-service` / `order-service`，并移除 `payment-service`、`offer-provider-service`。

---

## 6. 阶段 6：文档更新

- [README.md](../../README.md)：服务列表、架构图
- [docs/ite/微服务迭代方案.md](../ite/微服务迭代方案.md)：标注为已被本方案取代
- 各新服务的 README

`docs/microservices-course/` 下的教学页面引用了大量 `hotel-service` / `offer-provider-service` 路径。合并后这些引用会失效，需要一并订正——**这部分工作量不小，应单独排期**，不要计入本次 8 天。

---

## 7. 回滚

各阶段独立回滚，且不涉及数据恢复（旧库全程只读）：

| 阶段 | 回滚 |
|------|------|
| 1 | `git revert`；恢复 offer-provider 的 compose 块与 Gateway 路由 |
| 2 | Gateway 改回 `lb://reservation-service`；恢复 payment 容器 |
| 3 | Gateway 改回 `lb://hotel-service` / `lb://transport-service`；恢复两容器；`travel_core_db` 可保留不删 |

`hotel_db`、`transport_db`、`payment_db` 在全部验收通过并稳定运行前**不要删除**。

---

## 8. 常见问题

**编译报找不到符号，涉及 transport 的类**
包名替换不完整。检查是否有遗漏：
```bash
grep -rn "org\.microarchitecturovisco\.transport\." travel-core-service/src | grep -v "hotelservice.transport"
```

**启动时 Hibernate 报 `Schema-validation: missing table`**
`ddl-auto=validate` 要求实体与表严格对应。确认 `travel_core_schema.sql` 已应用到 `travel_core_db`，且包含 `ticket_offer_templates`。

**Flyway 报 `Found more than one migration with version 2`**
hotel 与 transport 各有一个 `V2__money_to_numeric.sql`。给其中一个改版本号，见 §3.3。

**可用性查询 RPC 超时（`convertSendAndReceive` 返回 null）**
队列绑定缺失。按 §3.9 比对 binding，重点检查同一 exchange 上的两条 routing key 是否都在。

**WebSocket 握手返回 404 或 200 而非 101**
Gateway 路由顺序错误，`ws` 路由被同前缀的 HTTP 路由抢先匹配。`ws` 路由必须在前。

**`docker compose up` 后 postgres 长时间 `starting`**
首次启动重放 schema 与约 30 万行 seed，属正常。`start_period` 为 1200s，耐心等待其转为 `healthy`。

**改了 init 脚本但没生效**
`docker-entrypoint-initdb.d` 只在数据卷为空时执行。需 `rm -rf travel-api/data/postgres` 后重建，或手工执行脚本。
