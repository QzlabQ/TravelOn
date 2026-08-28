# TravelOn 集成与 API 测试报告

| 项目 | 结果 |
|---|---|
| 计划完成时间 | 2026-08-26 |
| 实际测试完成时间 | 2026-08-27 |
| 测试环境 | Docker Compose 微服务环境；Gateway、Eureka、PostgreSQL、MongoDB、RabbitMQ、AI Agent |
| 测试结论 | **通过，满足本轮集成与 API 验收标准** |

## 测试目标

验证模块之间的调用、数据库访问及对外接口的正确性和稳定性，重点验证支付超时回滚、酒店预订 RabbitMQ 消息、社区服务重启恢复和真实大模型调用。

## 测试内容

- [x] 测试模块之间的调用
- [x] 测试数据库访问
- [x] 测试对外 API 接口
- [x] 测试请求参数校验
- [x] 测试返回数据
- [x] 测试错误码和错误信息
- [x] 测试超时场景
- [x] 测试异常场景
- [x] 测试失败重试场景

## 测试方法

1. 通过 `travel-api/tests/integration/run-api-tests.ps1` 从 Gateway `http://localhost:58082` 执行 API 自动化测试，并按用例保存请求和响应。
2. 通过 `travel-api/tests/integration/run-integration-remediation-tests.ps1` 执行支付超时、RabbitMQ、Eureka/Gateway 和 AI 专项回归。
3. 使用 PostgreSQL 核验 `reservation`、`payment_transaction` 和 `room_reservation` 的最终状态；使用 MongoDB 核验 AI 规划快照；使用 Eureka 核验服务注册实例数。
4. 测试环境将 `APP_PAYMENT_TIMEOUT_SECONDS` 配置为 `10` 秒验证超时回滚；应用默认值仍为 `1800` 秒。

## 验收标准

每个接口或集成用例均覆盖主成功流程、备选流程或异常流程；支付、订单、酒店预订和 AI 场景同时核验返回结果及持久化状态。

- [x] 接口返回结果符合预期
- [x] 数据库数据状态正确
- [x] 异常情况能够被正确处理
- [x] 测试结果和请求日志已记录

## 测试结果

| 测试接口/模块 | 用例数量 | 通过数量 | 失败数量 | 阻塞数量 |
|---|---:|---:|---:|---:|
| 用户 | 8 | 8 | 0 | 0 |
| 酒店 | 5 | 5 | 0 | 0 |
| 交通 | 6 | 6 | 0 | 0 |
| 社区 | 6 | 6 | 0 | 0 |
| 订单 | 2 | 2 | 0 | 0 |
| 支付 | 4 | 4 | 0 | 0 |
| AI 规划 | 4 | 4 | 0 | 0 |
| 专项集成回归 | 6 | 6 | 0 | 0 |
| **总计** | **41** | **41** | **0** | **0** |

- 测试接口/模块：Gateway 路由、用户、酒店、交通、社区、订单、支付、AI 规划、RabbitMQ、Eureka、PostgreSQL、MongoDB。
- 用例数量：41。
- 通过数量：41。
- 失败数量：0。
- 阻塞问题：无。
- 失败问题：无。本轮发现的两项历史问题均已修复并通过回归。

测试人员：自动化测试（Codex）

测试完成时间：2026-08-27

## 关键场景与证据

| 编号 | 场景 | 结果 | 核验结果 |
|---|---|---|---|
| `API-ORDER-003` | 不通过 Luhn 校验的银联前缀卡 `6200000000000000` | 通过 | 返回 `400`，符合只允许 `62` 开头、16-19 位且通过 Luhn 校验的规则。 |
| `API-ORDER-004` | 同一待支付订单改用合规卡 `6200000000000005` 重试 | 通过 | 返回 `200`，失败后重试支付成功。 |
| `API-ORDER-005`、`API-ORDER-006` | 查询支付记录与重复提交 | 通过 | 返回数据正常，重复提交保持幂等。 |
| `INT-HOTEL-001` | 缺失或无效 `roomIds` | 通过 | 接口返回 `400`，消息不会发布给酒店预订消费者。 |
| `INT-HOTEL-002` | 使用真实房间创建酒店预订 | 通过 | 创建的预订 ID 为 `f9635b83-b307-498f-a814-b8e2e1462eda`，`room_reservation` 投影记录数为 `1`。 |
| `INT-PAY-001` | 未支付酒店订单超时 | 通过 | 10 秒超时后，`reservation=0`、`room_reservation=0`，订单与房间占用均已回滚。 |
| `INT-COM-001` | 社区服务停止并重启 | 通过 | 容器以退出码 `143` 完成优雅停止；Eureka 注销旧实例；恢复后仅 `1` 个实例，Gateway 连续 5 次返回 `200`。 |
| `INT-AI-001` | 生成上海一日游规划 | 通过 | DeepSeek 工具调用状态为 `SUCCESS`，模型为 `deepseek-v4-flash`，追踪 ID 为 `485505c8-021e-4e4f-87b9-74e0e86904b4`，MongoDB 快照数为 `1`。 |

## 已关闭问题

| 编号 | 原问题 | 修复与回归结果 |
|---|---|---|
| TST-001 | 社区服务重启后可能残留过期 Eureka 实例，Gateway 可能路由到失效端口并返回 `500`。 | 启用优雅关闭和注销，缩短社区租约与注册表刷新间隔，关闭 Gateway 负载均衡缓存；停止后注册表无实例，重启后只保留 1 个可用实例。 |
| TST-002 | 酒店预订 RabbitMQ 消费出现 `HotelEventProjector` 异常和待处理消息。 | 请求改为必须提交真实 `roomIds`，预先校验房间归属与可用性；回复解析兼容 `byte[]`、直接 JSON 和带 JSON 外层引号的消息。无效请求在发布前返回 `400`，真实订单可完成投影和超时补偿。 |

## 测试脚本与运行记录

- API 测试脚本：`travel-api/tests/integration/run-api-tests.ps1`
- 专项集成回归脚本：`travel-api/tests/integration/run-integration-remediation-tests.ps1`
- 本次 API 汇总：`test-results/2026-08-27/api/api-results.json`
- 本次 API 请求/响应：`test-results/2026-08-27/api/evidence/`
- 本次专项回归汇总：`test-results/2026-08-27/remediation/remediation-results.json`
- 本次专项回归证据：`test-results/2026-08-27/remediation/evidence/`

`test-results/` 为本地测试运行证据目录，已被 Git 忽略；可提交的自动化测试脚本和本报告用于复现测试。
