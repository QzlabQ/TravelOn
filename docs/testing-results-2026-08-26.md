# 单元测试结果记录

测试时间：2026-08-26 16:01（Asia/Shanghai）

## 测试范围

- Java 微服务：JUnit 5、AssertJ、Mockito、Spring Boot Test
- AI 编排代理：pytest、pytest-asyncio
- 前端：Jest、React Testing Library
- 用例覆盖关键类、关键方法、业务规则、正常输入、边界输入、非法输入和异常分支；断言验证返回值、状态码、异常类型或上下文状态。

## 执行结果

| 模块 | 测试数 | 通过 | 失败 | 错误 | 跳过 |
| --- | ---: | ---: | ---: | ---: | ---: |
| Java 微服务 | 67 | 67 | 0 | 0 | 0 |
| AI 编排代理 | 52 | 52 | 0 | 0 | 0 |
| 前端 | 8 | 8 | 0 | 0 | 0 |
| 合计 | 127 | 127 | 0 | 0 | 0 |

执行命令：

- 各 Java 服务目录执行 `mvn test`
- `travel-api/ai-arrange-agent-service` 执行 `pytest -q`
- `travel-ui` 执行 `CI=true npm test -- --runInBand`

## 失败日志与修复

初次全量执行发现：

1. user、payment、hotel、reservation 的上下文测试尝试连接外部 PostgreSQL/RabbitMQ。
2. community、user、hotel 的 Mockito 在 Java 25 下因旧 Byte Buddy 不识别 class version 69 初始化失败。
3. 部分 `contextLoads()` 只有空方法体，没有结果断言。

处理方式：

- 为受影响服务增加 `test` profile，使用 H2 内存数据库，关闭 Flyway、Eureka 和 RabbitMQ listener 的外部依赖。
- 为 community、user、hotel 的 Maven Surefire 增加 `-Dnet.bytebuddy.experimental=true`。
- 为上下文测试注入 `ApplicationContext` 并断言非空。

修复后所有测试通过。日志中仍有 Java 25 动态 agent、H2 dialect、Python 依赖弃用等警告，但未造成测试失败。

## 覆盖率

当前项目未配置 JaCoCo、pytest-cov 或 Jest coverage，故本次未采集覆盖率，不能提供覆盖率百分比。
