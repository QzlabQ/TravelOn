# 跨服务调用说明

## 1. 客户端请求

`travel-ui` 只访问 Gateway。Gateway 通过 Eureka 的 `lb://` 解析实例：酒店和交通均路由到 `travel-core-service`，订单路由到 `order-service`，其余路由分别到 user、community 和 ai-arrange。当前 Gateway 只配置 AI 规划 WebSocket 路由；客户端不依赖容器名或随机端口。

## 2. 下单 Saga

```text
UI -> Gateway -> order-service
                   |-- RabbitMQ RPC -> travel-core：酒店可用性
                   |-- RabbitMQ fanout -> travel-core：创建资源预订
                   |-- 本地方法调用 -> payment 包：verifyTransaction
                   `-- 失败补偿 -> RabbitMQ fanout -> travel-core：删除资源预订
```

酒店可用性检查使用 `convertSendAndReceive`，要求保留对应 exchange、routing key 和 reply；当前票务下单直接以 fanout 创建交通预订，未先调用 travel-core 已保留的交通可用性 RPC listener。资源创建/删除使用 fanout，不依赖 routing key。order 的 reservation 事件（创建、更新、删除）仍通过自身 RabbitMQ 队列投影。

## 3. AI 规划

`Gateway -> ai-arrange-service` 负责外部 REST/WebSocket、会话和快照持久化；Java 服务通过 Compose 注入的 `AI_ARRANGE_AGENT_BASE_URL=http://ai-arrange-agent:8090` 调用 Python Agent。Agent 返回 HTTP/SSE 结果，不能从公网直接访问，也不直接写 MongoDB。

## 4. 用户资料依赖

hotel、transport、order 和 community 在需要鉴权或用户资料时，通过 `X-User-Token` 识别用户，并使用各自现有的 `RestTemplate` 客户端调用 user-service。它们不得直接读取 `user_db`。社区的用户资料变更事件由 RabbitMQ listener 接收，以减少同步耦合。

## 5. 失败、超时与幂等

- RPC 超时或空响应必须转为明确的订单失败，并触发补偿。
- fanout 消费者按 reservation/order id 幂等处理，重复投递不能重复锁定或释放资源。
- 支付校验虽改成本地调用，异常仍必须进入 `InvalidPaymentHandler` 补偿路径。
- 数据库事务只覆盖单个服务；Saga 的跨服务一致性是最终一致，不使用跨库事务。
