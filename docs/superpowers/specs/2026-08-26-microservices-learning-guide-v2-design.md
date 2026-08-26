# TravelOn 微服务学习教程 V2 设计规格

**日期：** 2026-08-26
**输出形式：** 多页、离线可打开的 UTF-8 HTML 教程
**参考项目：** `E:\2026spring\software-contest\backend-basics\backend-basics`
**目标仓库：** `travel-api`

## 1. 目标

为已经学习过 Java、C/C++、Docker、Bash、CMake 的学生制作一套从基础概念逐步进入微服务工程实践的教程。教程不假设读者已经理解 Spring Cloud、Eureka、Gateway、RabbitMQ 或分布式一致性，但也不重复讲解 Java 基础语法和 Docker 基础命令。

教程必须满足以下目标：

- 从“为什么需要服务”开始建立学习链条，而不是直接介绍框架名词。
- 每章只解决一个主要问题，并连接到 `travel-api` 中可定位的真实代码。
- 明确区分当前项目已经实现的机制、当前代码的工程风险，以及建议作为学习练习的改进。
- 将服务发现、消息队列、网络协议、同步 RPC、Saga、可靠性和可观测性放入同一条调用链中。
- 页面可直接在浏览器中打开，不依赖 CDN、构建工具或后端服务。

## 2. 设计选择

采用以下结构：

```text
docs/microservices-course/
  index.html
  01-why-microservices.html
  02-project-map.html
  03-docker-network.html
  04-http-and-gateway.html
  05-service-discovery.html
  06-tcp-http-json.html
  07-rabbitmq-amqp.html
  08-message-rpc.html
  09-saga-consistency.html
  10-websocket-sse.html
  11-reliability.html
  12-debugging-roadmap.html
  styles.css
  script.js
```

选择“多页 HTML + 共享静态资源”，原因如下：

- 多页结构与 `backend-basics` 的学习方式一致，每章可以独立打开和复习。
- 共享 `styles.css` 和 `script.js`，避免 13 个页面复制同一套样式和交互代码。
- 不使用 React、Markdown 构建器或 CDN，降低学习页面本身的技术负担。
- 代码片段、练习和自测保留在 HTML 内，方便学生使用编辑器搜索真实路径。

## 3. 页面交互和视觉约束

### 3.1 总体风格

- 页面语言为简体中文，文档声明为 `<html lang="zh-CN">`，文件编码为 UTF-8。
- 采用参考项目的窄内容区、绿色主色、浅色背景、深色代码块和提示框。
- 页面顶部显示当前章节和总章节数。
- 每章底部提供“上一章、返回目录、下一章”导航。
- 移动端将桌面端的多列布局改成单列，代码块允许横向滚动。
- 不使用表情符号、夸张标题或比喻性叙述，语言直接、技术化。

### 3.2 共享交互

`script.js` 提供以下功能：

- 代码块复制按钮。
- 自测题单选或下拉选择后的答案检查。
- 章节导航的当前页状态。
- 目录页显示阅读进度，不依赖服务器端存储。

页面即使 JavaScript 被禁用，也必须能够阅读正文、代码、路径和命令；自测功能可以失效，但不能影响主要内容。

## 4. 学习链条

章节必须严格按以下依赖关系组织：

```text
服务拆分
  -> 项目服务边界
  -> 容器网络和地址
  -> HTTP 请求和网关路由
  -> Eureka 服务发现
  -> TCP/HTTP/JSON 协议层
  -> RabbitMQ/AMQP 消息模型
  -> 消息 RPC 与异步消息
  -> Saga 和跨服务一致性
  -> WebSocket/SSE 流式通信
  -> 超时、重试、幂等、ACK 和可观测性
  -> 启动验证、故障排查和后续学习
```

每章正文顺序固定为：

1. 问题：如果没有这个机制，当前调用链会在哪里失败。
2. 概念：机制解决什么问题，不解决什么问题。
3. 项目代码：真实文件路径、配置项、类名或方法名。
4. 调用链：把一次请求、消息或状态转换串起来。
5. 验证：给出 PowerShell、Docker Compose、curl 或代码阅读操作。
6. 自测：2 到 4 道题，检查本章的关键判断。
7. 小结：列出本章必须保留的结论，并指向下一章。

## 5. 章节设计

### 第 0 页：学习目录 `index.html`

内容：

- 说明读者基础和教程目标。
- 说明“当前实现”和“学习建议”的标记规则。
- 展示 TravelOn 的整体服务图：客户端、Gateway、业务服务、Discovery、RabbitMQ、PostgreSQL、MongoDB。
- 展示 12 章路线、预计学习顺序和每章产出。
- 给出启动前置条件：Docker Desktop、JDK、Maven Wrapper、PowerShell、可选的 `curl.exe`。
- 给出项目入口：`travel-api/docker-compose.yml`、`travel-api/README.md`、`travel-ui`。

自测：判断本项目中的“服务名”“容器名”“主机端口”和“容器端口”的区别。

### 第 1 章：为什么拆成微服务 `01-why-microservices.html`

核心问题：为什么当前系统不是一个 Java 进程处理所有业务。

代码证据：

- `travel-api/docker-compose.yml` 中的 `hotel`、`transport`、`reservation`、`payment`、`discovery`、`gateway` 等服务。
- 各服务自己的 `pom.xml`、Dockerfile 和启动类。
- `travel-api/docs/ite/微服务迭代方案.md` 中的服务合并或拆分讨论。

重点：服务边界应基于业务能力、数据归属和独立部署需求；“一个 Controller 一个服务”不是拆分原则；微服务引入网络失败、部署协调、数据一致性和排查成本。

练习：从 Compose 和目录中画出服务边界，并给每个服务写出“负责什么、不负责什么、拥有哪类数据”。

### 第 2 章：读懂本项目 `02-project-map.html`

核心问题：拿到陌生微服务项目后，先读哪些文件。

代码证据：

- 各服务的 `src/main/resources/application.properties` 或 `application.yml`。
- `travel-api/discovery-service/src/main/java/org/microarchitecturovisco/discoveryservice/DiscoveryServiceApplication.java`。
- `travel-api/api-gateway/src/main/java/org/microarchitecturovisco/apigateway/ApiGatewayApplication.java`。
- `hotel-service` 的 `HotelsController`、`HotelsService`、Repository。
- `reservation-service` 的 Controller、Service、Saga 和 Repository。
- `ai-arrange-service` 的 Controller、Client、WebSocket 配置和 Repository。

重点：用“启动类、配置、外部入口、内部调用、数据访问”五类文件建立阅读顺序；解释 Spring Boot 进程与微服务边界的关系；指出不同服务目前共享 PostgreSQL 实例但使用不同数据库名，逻辑归属仍然需要保持清晰。

练习：选择 `hotel-service`，从 HTTP 入口追踪到 Service 和 Repository；再选择 `reservation-service`，标出同步方法和消息方法。

### 第 3 章：Docker 网络和地址 `03-docker-network.html`

核心问题：为什么容器内不能把 `localhost:58082` 当作 Gateway 地址。

代码证据：

- `travel-api/docker-compose.yml` 的 `backend` network。
- `ports` 的主机端口到容器端口映射。
- `SPRING_DATASOURCE_URL=jdbc:postgresql://postgres:5432/${HOTEL_DB_NAME:-hotel_db}`。
- `SPRING_RABBITMQ_HOST` 或 `spring.rabbitmq.host=rabbitmq`。
- `EUREKA_DEFAULT_ZONE=http://discovery:8010/eureka`。
- `TRAVEL_GATEWAY_BASE_URL=http://gateway:8082`。

重点：容器网络中的 DNS 服务名、主机端口和容器端口；`depends_on` 只控制启动顺序，不保证应用已可用；PostgreSQL 健康检查和应用重试的必要性。

练习：执行 `docker compose ps`、`docker compose exec gateway getent hosts discovery` 或 Windows 环境下的等价 DNS 查询，比较主机访问和容器间访问。

### 第 4 章：HTTP 和 API Gateway `04-http-and-gateway.html`

核心问题：浏览器请求为什么先到 Gateway，而不是直接连接 `hotel-service`。

代码证据：

- `api-gateway/src/main/resources/application.yml` 的 `spring.cloud.gateway.routes`。
- `Path=/hotels/**` 与 `uri: lb://hotel-service`。
- `Path=/reservations/**`、`Path=/payments/**`、`Path=/ai-arrange/**`。
- `lb:ws://ai-arrange-service` 的 WebSocket 路由。
- `hotel-service` 的 `@RequestMapping("/hotels")`、`@GetMapping`、`@RequestParam`、`@PathVariable`。

重点：HTTP 方法、路径、查询参数、请求体、响应状态码；Gateway 的统一入口、路由、跨域和请求头处理；Gateway 只负责转发，不替代业务服务。

练习：使用 `curl.exe` 请求 `/hotels/destinations`，再从 Gateway 路由追踪到 `HotelsController.getDestinations()`。

### 第 5 章：Eureka 服务发现 `05-service-discovery.html`

核心问题：当 `hotel-service` 使用随机端口时，Gateway 如何找到它。

代码证据：

- `DiscoveryServiceApplication.java` 的 `@EnableEurekaServer`。
- Discovery 配置中的 `register-with-eureka=false` 和 `fetch-registry=false`。
- `hotel-service` 的 `server.port=0`、`spring.application.name=hotel-service`、Eureka 地址和随机 `instance-id`。
- Gateway 的 `lb://hotel-service`。

重点：服务名到实例列表的映射；注册、心跳、拉取注册表和负载均衡的基本流程；Eureka 不是 DNS，也不负责业务数据；服务发现不能解决应用未启动、接口错误和数据库不可用。

练习：访问 `http://localhost:58010/eureka/apps` 或 Eureka 页面，记录 `hotel-service` 的实例信息，再停止并重启一个服务观察变化。

### 第 6 章：TCP、HTTP 和 JSON `06-tcp-http-json.html`

核心问题：RabbitMQ 和 HTTP 看起来都是“发送数据”，但协议层次和通信模型有什么不同。

代码证据：

- `HotelsController` 的 HTTP 注解和参数绑定。
- `JsonReader`、`JsonConverter` 的手工 JSON 转换。
- `WebClient` 的 JSON 请求与响应。
- RabbitMQ 消息体使用字符串 JSON 的实际代码。

重点：TCP 提供字节流和连接，HTTP 在 TCP 之上定义请求响应，JSON 是应用层数据格式；HTTP 没有天然的业务幂等性；手工 JSON 转换带来 schema、字段兼容和错误处理风险；说明 HTTP/1.1、Keep-Alive、超时的基本关系，但不展开到实现 HTTP 服务器。

练习：使用 `curl.exe -v` 查看 HTTP 请求行、Header 和响应状态；把一个 Controller 参数映射到最终 JSON 响应字段。

### 第 7 章：RabbitMQ 和 AMQP `07-rabbitmq-amqp.html`

核心问题：服务之间为什么使用 Exchange、Queue 和 Binding，而不是直接互相调用。

代码证据：

- `travel-api/hotel-service/src/main/java/org/microarchitecturovisco/hotelservice/queues/config/ExchangesConfig.java`。
- `travel-api/hotel-service/src/main/java/org/microarchitecturovisco/hotelservice/queues/config/QueuesConfig.java`。
- `travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/queues/config/QueuesHotelConfig.java`、`QueuesTransportConfig.java`、`QueuesReservationConfig.java`。
- `travel-api/offer-provider-service/src/main/java/org/microarchitecturovisco/offerprovider/queues/config/QueuesConfig.java`。
- `@RabbitListener` 注解。

重点：Producer、Exchange、Binding、Queue、Consumer；Direct、Topic、Fanout 的路由差异；RabbitMQ 管理界面中的 Ready、Unacked、Consumer；消息持久化、确认、死信和 schema 版本作为当前实现之外的工程改进。

练习：从一个“酒店可用性查询”开始，画出 Exchange、Routing Key、Queue 和 Listener 的关系，并在 RabbitMQ Management UI 中找到对应对象。

### 第 8 章：消息 RPC 和异步消息 `08-message-rpc.html`

核心问题：为什么 `convertSendAndReceive` 仍然会阻塞，而 `convertAndSend` 不需要等待返回值。

代码证据：

- `ReservationService.processPaymentWithPaymentModule()` 中的 `rabbitTemplate.convertSendAndReceive`。
- `ReservationService.updateReservationPaymentStatus()` 中的 `convertAndSend`。
- `HotelsController` 中返回字符串结果的 `@RabbitListener`。
- `offer-provider-service` 对酒店和交通查询结果的组合逻辑。

重点：消息 RPC 的请求队列、响应队列、Correlation ID 和超时；异步事件的发送与消费；同步 RPC 仍然需要处理服务不可用、重复请求和响应丢失；异步消息不能用 HTTP 200 代替业务完成状态。

练习：在代码中分别标出“等待响应”和“只发送不等待”的调用，写出两种调用失败时调用方能够知道的信息。

### 第 9 章：Saga 和跨服务一致性 `09-saga-consistency.html`

核心问题：酒店已预订、交通预订失败或支付失败时，为什么不能对多个数据库执行一次全局 `ROLLBACK`。

代码证据：

- `travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/services/saga/BookHotelsSaga.java`。
- `travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/services/saga/BookTransportsSaga.java`。
- `travel-api/reservation-service/src/main/java/org/microarchitecturovisco/reservationservice/services/saga/InvalidPaymentHandler.java`。
- `ReservationService` 中预订创建、支付处理、失败补偿和状态更新。
- `ReservationStatus`、`PaymentTransaction`、`RefundRecord`。

重点：本地事务与分布式事务的边界；Saga 的步骤、补偿动作和状态机；编排式 Saga 与协同式 Saga 的差异；补偿不是数据库回滚，补偿本身也可能失败；预订、支付和退款必须有明确状态。

练习：画出“酒店锁定成功 -> 交通锁定失败 -> 释放酒店 -> 订单失败”的状态流转，并找出每一步对应的消息或方法。

### 第 10 章：WebSocket 和 SSE `10-websocket-sse.html`

核心问题：普通 HTTP 请求为什么不适合持续推送价格变化或 AI 规划过程。

代码证据：

- `offer-provider-service` 的 `OfferPriceWebSocketHandler` 和 `OfferDetailsWebSocketHandler`。
- `reservation-service` 的 `ReservationWebSocketHandler`。
- `ai-arrange-service` 的 `PlannerWebSocketHandler` 和 `WebSocketConfig`。
- `PythonPlannerAgentClient.streamPlanner()` 的 `TEXT_EVENT_STREAM`、`ServerSentEvent` 和终止事件。
- Gateway 中 `lb:ws://ai-arrange-service` 路由。

重点：HTTP 短请求、WebSocket 双向长连接、SSE 单向事件流；连接建立、消息帧、断线重连、心跳和终止事件；SSE 的事件顺序和最终事件检查；WebSocket 连接与服务实例发现之间的额外复杂度。

练习：将 AI 流式调用分为 Java -> Python 的 HTTP/SSE 和浏览器 -> Gateway 的 WebSocket 两段，分别标出方向、协议和终止条件。

### 第 11 章：可靠性、一致性和可观测性 `11-reliability.html`

核心问题：网络失败是正常情况时，如何避免重复扣款、重复预订和无法解释的订单状态。

代码证据：

- `PlannerAgentProperties` 和 `PythonPlannerAgentClient.timeout()` 的超时配置。
- `ReservationService` 对 `AmqpException`、支付失败和补偿的处理。
- RabbitMQ Listener 的返回值与 ACK 行为。
- `docker-compose.yml` 的服务日志挂载和 PostgreSQL healthcheck。
- 现有日志中使用的 reservation ID、支付 ID 和服务名称。

重点：超时不等于远端操作未执行；重试需要边界、退避和错误分类；幂等键、去重记录和唯一约束；消息 ACK、重复投递和死信；日志字段、trace ID、metrics 和 tracing 的职责差异；明确当前项目还没有完整的分布式 tracing。

练习：为支付请求设计一个幂等键，说明请求超时后如何查询状态而不是直接再次扣款；为一条 RabbitMQ 消息设计 `eventId` 和处理记录。

### 第 12 章：启动、验证和故障排查 `12-debugging-roadmap.html`

核心问题：服务启动后，如何判断是 Docker、网络、服务发现、消息队列还是业务代码出了问题。

代码证据：

- `docker compose up -d --build`、`docker compose ps`、`docker compose logs`。
- PostgreSQL、RabbitMQ Management、Eureka、Gateway 的主机端口。
- Gateway 到业务服务的 HTTP 调用。
- RabbitMQ Ready/Unacked 和服务日志。
- 服务停止、重启和注册状态变化。

重点：按层排查：端口监听 -> 容器 DNS -> 依赖健康 -> Eureka 注册 -> Gateway 路由 -> Controller -> 数据库或 Queue -> 业务状态；给出常见现象和优先检查点；最后给出后续学习路线：Spring Cloud LoadBalancer、数据库事务、Outbox、OpenTelemetry、Kafka、Kubernetes。

练习：停止 `hotel` 容器，分别观察 Gateway HTTP 请求、Eureka 实例列表、RabbitMQ 队列和日志的变化，并记录每个现象属于哪一层。

## 6. 代码引用原则

- 代码片段只复制当前仓库中能通过路径定位的内容，必要时使用省略号，但不能改变原有语义。
- 每个关键结论至少关联一个真实文件、配置项、类名或方法名。
- 当前代码中存在手工 JSON、固定队列名、字符串状态和部分直接日志输出时，教程如实说明，不将其包装成最佳实践。
- 建议代码、伪代码和未来技术必须使用“学习建议”标签，不能写成当前项目已经具备的能力。
- 教程使用项目默认路径 `E:\2026spring\26NULLptr\repositories\travel-api` 作为命令执行位置，并在命令旁说明主机端口和容器端口。

## 7. 验收标准

### 文件和编码

- 目录中存在 `index.html`、12 个章节 HTML、`styles.css` 和 `script.js`。
- 所有 HTML 使用 UTF-8，并声明 `lang="zh-CN"`。
- 所有页面之间的相对链接有效。
- 页面不依赖外部 CDN、图片或后端服务才能阅读正文。

### 内容

- 12 章按设计顺序覆盖服务拆分、项目边界、Docker 网络、Gateway、Eureka、TCP/HTTP/JSON、RabbitMQ/AMQP、消息 RPC、Saga、一致性、WebSocket、SSE、可靠性和排障。
- 章节中的关键路径、配置项、类名和方法名与仓库一致。
- 每章都有问题、概念、项目代码、验证练习和自测。
- 明确区分已实现内容和建议内容。
- 不使用比喻、夸张修辞或无法从项目验证的断言。

### 页面行为

- 代码块可以复制。
- 自测题可以显示正确答案和解释。
- 桌面端和窄屏下均可阅读，代码块不会撑破页面。
- JavaScript 不可用时，正文和静态导航仍然可用。

### 静态验证

- 使用 PowerShell 检查所有页面文件存在。
- 使用正则检查 HTML 标签基本闭合、关键章节标题和关键路径存在。
- 使用 `git diff --check` 检查空白错误。
- 不运行整个 Java 微服务栈作为 HTML 验收条件；如果运行环境缺少 Docker 或 API key，教程页面仍应能完成静态验收。

## 8. 不在本次范围内

- 不修改 `travel-api` 的业务代码、依赖、Docker Compose 或运行时配置。
- 不新增 Kafka、Kubernetes、OpenTelemetry、Outbox 或真正的分布式事务实现。
- 不将教程制作成 React 应用或引入构建流程。
- 不保证当前项目所有业务流程已经符合生产级微服务最佳实践；教程需要指出现状和改进方向。
