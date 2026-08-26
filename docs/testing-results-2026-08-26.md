# 单元测试与覆盖率结果记录

测试时间：2026-08-26 17:19（Asia/Shanghai）

## 测试范围

- Java 微服务：JUnit 5、AssertJ、Mockito、Spring Boot Test。
- AI 编排代理：pytest、pytest-asyncio、pytest-cov。
- 前端：Jest、React Testing Library。
- 用例覆盖关键类、关键方法、业务规则、正常输入、边界条件、非法输入和异常分支；每个测试用例均通过断言验证返回值、状态码、异常类型或上下文状态。

## 执行结果

| 模块 | 测试数 | 通过 | 失败 | 错误 | 结论 |
| --- | ---: | ---: | ---: | ---: | --- |
| Java 可编译微服务（9 个模块） | 67 | 67 | 0 | 0 | 通过 |
| AI 编排代理 | 52 | 52 | 0 | 0 | 通过 |
| 前端 | 8 | 8 | 0 | 0 | 通过 |
| 合计 | 127 | 127 | 0 | 0 | 通过 |

执行命令：

- 每个 Java 服务目录：`mvn verify`。
- `travel-api/ai-arrange-agent-service`：`python -m pytest -q`。
- `travel-ui`：`CI=true npm run test:coverage`。

## 实际覆盖率

未配置最低覆盖率阈值；本次仅采集、生成并记录实际数据，覆盖率不足不会使构建失败。

### Java（JaCoCo）

| 模块 | 行覆盖率 | 分支覆盖率 | 测试数 |
| --- | ---: | ---: | ---: |
| ai-arrange-service | 63.24%（1335/2111） | 41.47% | 28 |
| api-gateway | 33.33%（1/3） | 不适用 | 1 |
| community-service | 28.91%（257/889） | 22.54% | 13 |
| discovery-service | 33.33%（1/3） | 不适用 | 1 |
| hotel-service | 10.86%（62/571） | 9.38% | 6 |
| offer-provider-service | 9.77%（13/133） | 0.00% | 1 |
| payment-service | 50.85%（30/59） | 100.00% | 3 |
| reservation-service | 6.35%（57/897） | 0.00% | 2 |
| user-service | 65.95%（153/232） | 45.00% | 12 |
| 已采集模块合计 | 38.98%（1909/4898） | 31.29%（547/1748） | 67 |

每个已通过模块均生成：`travel-api/<模块>/target/site/jacoco/index.html`、`jacoco.xml` 和 `jacoco.csv`。

### AI 编排代理（pytest-cov）

| 指标 | 实际值 |
| --- | ---: |
| 行覆盖率 | 80.98%（2337/2886） |
| 分支覆盖率 | 55.11%（528/958） |
| pytest-cov 终端综合 Cover | 75% |
| 测试数 | 52 |

报告：`travel-api/ai-arrange-agent-service/coverage.xml` 和 `travel-api/ai-arrange-agent-service/htmlcov/index.html`。

### 前端（Jest / Istanbul）

| 指标 | 实际值 |
| --- | ---: |
| Statements | 3.84% |
| Branches | 3.11% |
| Functions | 2.29% |
| Lines | 4.05% |
| 测试数 | 8 |

报告：`travel-ui/coverage/lcov.info` 和 `travel-ui/coverage/coverage-final.json`。

## 失败日志与问题记录

`transport-service` 是唯一未能产生覆盖率报告的 Java 模块。运行 `mvn verify` 时，主代码在补齐 Lombok 1.18.42 注解处理器后能够编译；但已有测试源码仍引用不存在的类型：`TransportRepository`、`TransportCourseRepository`、`Location` 和 `TransportCourse`。Maven 在 `testCompile` 阶段失败，因此该模块无法执行测试或生成 JaCoCo 报告。

失败日志位置：`travel-api/transport-service/target/coverage-verify.log`。该问题与覆盖率配置无关，需要单独同步测试代码与当前领域模型/仓储接口后再采集。

其余 Java 模块、Python 和前端测试均通过。Java 25 环境会输出动态 agent 与 `Unsafe` 弃用警告，未导致测试失败。

测试人员：Codex

测试完成时间：2026-08-26 17:19（Asia/Shanghai）
