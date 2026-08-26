# TravelOn 集成与 API 测试

| 项目 | 结果 |
|---|---|
| 测试日期 | 2026-08-26 |
| 测试时间 | 10:36 至 11:05，Asia/Shanghai |
| 测试对象 | Docker Compose 微服务、Gateway API、PostgreSQL、MongoDB、RabbitMQ、AI agent |
| 结论 | **部分通过，不满足完整验收条件** |

## 1. 执行摘要

已启动并验证 Docker Compose 环境，14 个服务为 `Up`，PostgreSQL 为 `healthy`。修正支付测试数据后，通过 Gateway 重新执行 33 个自动化集成/API 用例，结果为 **33 通过、0 失败、0 阻塞**。

原始失败使用了 Visa 规则测试卡 `4111111111111111`，该卡不符合当前支付模拟服务“银联前缀、长度和 Luhn 校验”的准入规则，因此该失败不属于支付缺陷。使用合规银联测试卡 `6200000000000005` 后，支付主流程返回 `200`；另以 Luhn 校验失败的银联前缀卡号复测拒绝与重试，验证了失败后改用合规卡可成功支付。故障注入仍揭示社区服务重启后 Eureka 会残留旧端口，Gateway 可能持续路由到旧实例并返回 `500`。

## 2. 测试方法

1. 使用 `docker compose up -d --build` 构建并启动服务。
2. 使用 `run-api-tests.ps1` 从 `http://localhost:58082` 发起 API 调用，并按用例保存请求/响应。
3. 使用 `psql` 核验用户、订单和支付状态；使用 `mongosh` 核验 AI 会话与快照；使用 `rabbitmqctl` 核验队列和消费者。
4. 停止并恢复 `community` 服务，验证不可用响应、服务发现和恢复行为。
5. 执行各模块 Maven、Python 和前端 Jest 测试，记录环境和编译阻塞。

## 3. API 结果

| 模块 | 用例数 | 通过 | 失败 | 备注 |
|---|---:|---:|---:|---|
| 用户 | 8 | 8 | 0 | 包含注册、登录、鉴权和旅客管理 |
| 酒店 | 4 | 4 | 0 | 包含评分筛选 `minRating=4.5` |
| 交通 | 6 | 6 | 0 | 包含北京到上海火车、飞机查询 |
| 社区 | 6 | 6 | 0 | 包含发布、点赞、删除和非法参数 |
| 订单 | 2 | 2 | 0 | 创建和查询酒店订单 |
| 支付 | 3 | 3 | 0 | 合规银联卡支付、支付记录查询、重复提交幂等性 |
| AI 规划 | 4 | 4 | 0 | 会话、详情、快照和异常参数 |
| **总计** | **33** | **33** | **0** | **100%** |

### 支付规则复测

| 编号 | 请求 | 预期 | 实际 | 数据库核验 |
|---|---|---|---|---|
| `API-ORDER-003` | `POST /reservations/purchase`，卡号 `6200000000000005` | `200` | `200` | 支付成功，订单状态更新为 `PAID`。 |
| `PAY-RT-001` | 先以 `6200000000000000` 支付，再以 `6200000000000005` 重试 | 首次 `400`，重试 `200` | 符合预期 | 订单 `PAID`、`paid=true`；两条交易分别为 `FAILED`、`SUCCESS`。 |

`6200000000000000` 以 `62` 开头但不通过 Luhn 校验，因此拒绝是正确的参数/业务规则处理；重试结果表明支付成功业务闭环正常。

## 4. 集成与异常场景

| 场景 | 观察结果 | 评价 |
|---|---|---|
| Gateway 到酒店/交通服务 | 目的地和票务选项接口均返回 `200` | 通过 |
| Gateway 到 AI agent | `GET /agent/health` 返回 `200`、`UP`；DeepSeek 已配置，Amap 未配置 | 健康检查通过；未执行真实模型生成 |
| 数据库访问 | 六个 PostgreSQL 业务库存在；MongoDB 已保存会话、消息、快照和日计划版本 | 通过 |
| RabbitMQ 调用 | 支付队列有消费者；酒店创建预订队列有 1 条待处理消息 | 需跟踪 |
| 停止社区服务 | `GET /community/posts` 返回通用 `500` | 系统未挂起，但错误码不够准确 |
| 恢复社区服务 | Eureka 同时登记旧端口 `35931` 与新端口 `42821`；Gateway 初始连接旧端口被拒绝 | 失败，需要修复自动恢复 |
| 清理旧 Eureka 实例后复测 | 社区接口恢复 `200` | 人工恢复成功，不替代程序修复 |
| 支付规则失败与重试 | Luhn 校验失败的银联前缀卡返回 `400`；同一待付款订单改用合规银联卡后返回 `200` | 通过；验证人工失败重试，不代表具备自动退避重试 |
| 支付超时 | 超时任务固定 30 分钟 | 本轮未等待完成，属于未覆盖项 |

## 5. 数据一致性证据

支付规则复测酒店订单 ID 为 `268a7e84-09ae-47b7-9aba-60a5736030b1`：

| 数据 | 实际状态 |
|---|---|
| `reservation` | `PAID`，价格 `100`，`paid=true` |
| `payment_transaction` | 2 条记录，分别为 `FAILED`、`SUCCESS` |
| 规则复测 | 首次卡号未通过 Luhn 校验被拒绝，合规银联卡重试成功 |
| MongoDB | `planner_conversations=3`、`planner_messages=8`、`planner_snapshots=14`、`planner_day_revisions=4` |

订单和支付表的状态与规则校验、重试成功响应一致，支付过程具备可追溯性，且支付成功状态已完成。

## 6. 发现的问题

| 编号 | 严重性 | 问题 | 影响 | 建议 |
|---|---|---|---|---|
| TST-001 | 高 | 社区服务重启后 Eureka 保留旧实例，Gateway 连接旧端口失败。 | 服务恢复期间社区接口持续 `500`。 | 处理实例注销、唯一实例 ID、注册表刷新与 Gateway 缓存失效；异常时返回 `503`。 |
| TST-002 | 中 | 酒店预订事件消费者在 `HotelEventProjector.apply` 触发 `Optional.orElseThrow()` 异常，队列保留 1 条消息。 | 酒店订单异步状态可能不一致。 | 为缺失事件/实体增加明确错误处理、死信或幂等补偿，并查明该消息与本次订单的关联。 |
| TST-003 | 中 | 支付超时回滚未做真实运行验证。 | 无法确认 30 分钟后订单和库存会正确补偿。 | 将超时配置参数化，在测试 profile 缩短为秒级并增加自动化测试。 |
| TST-004 | 中 | 本机单元测试环境与运行环境不一致。 | 不能稳定运行完整回归测试。 | 使用 JDK 21、测试数据库 profile、Mockito agent 配置，修复 transport Lombok 与前端/Python 依赖。 |

## 7. 自动化测试限制

| 测试层 | 状态 | 限制 |
|---|---|---|
| Maven 用户/酒店/订单 | 失败 | 本机测试使用 Docker 内部主机名 `postgres`，连接失败。 |
| Maven 社区/AI/Gateway/Discovery | 失败 | Java 25 与 Mockito/Byte Buddy 自附加不兼容。 |
| Maven 交通 | 编译失败 | Lombok getter/setter、builder 和构造注入相关符号缺失。 |
| Python AI agent | 未执行 | 未安装 `pytest`。 |
| 前端 Jest | 失败 | `axios` ESM 模块无法被当前 Jest 配置解析。 |

这些限制不否定 Docker 内 API 实测结果，但意味着单元测试回归尚不能作为交付保障。

## 8. 证据清单

- API 汇总：`test-results/2026-08-26/api-results.json`
- 请求/响应：`test-results/2026-08-26/evidence/`
- Compose 最终状态：`test-results/2026-08-26/integration/compose-ps-final.json`
- 数据库核验：`test-results/2026-08-26/integration/reservation-payment-db-check.txt`
- MongoDB 核验：`test-results/2026-08-26/integration/mongo-ai-counts.txt`
- RabbitMQ 队列：`test-results/2026-08-26/integration/rabbitmq-queues.txt`
- Eureka 恢复证据：`test-results/2026-08-26/integration/eureka-community-before-cleanup.json`、`eureka-community-after-cleanup.json`
- 服务日志：`test-results/2026-08-26/integration/services-latest.log`、`hotel-reservation-event-failure.log`
- 本机自动化日志：`test-results/2026-08-26/automation/`

## 9. 结论与下一步

支付主流程、银联规则校验和失败后人工重试均已通过；33 个自动化 API 用例全部通过。当前版本仍需优先解决 Eureka 旧实例清理和酒店预订消息消费异常，并在 JDK 21 的一致测试环境中补齐支付超时和真实 AI 模型调用的可控测试，再完成完整验收。
