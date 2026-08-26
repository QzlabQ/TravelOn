# 测试覆盖率采集设计

## 目标

为集成 AI 出行平台的 Java、Python 和前端测试增加可重复的覆盖率采集，并把实际结果记录到测试报告中；不设置最低覆盖率阈值，不因覆盖率不足导致构建失败。

## 方案

- Java 微服务：在各服务 Maven `pom.xml` 配置 JaCoCo Maven Plugin，在 `test` 阶段附加 agent，并在 `verify` 阶段生成 XML、HTML 和 CSV 报告。
- Python AI 编排代理：在测试依赖中加入 `pytest-cov`，在 `pytest.ini` 配置 `--cov`、分支覆盖率和终端/XML/HTML 输出。
- 前端：使用 Create React App/Jest 原生 `--coverage` 参数，生成文本、LCOV 和 JSON 报告；在 `package.json` 增加可重复执行的 `test:coverage` 脚本。
- 记录：更新 `docs/testing-results-2026-08-26.md`，写入各模块实际行覆盖率、分支覆盖率（工具支持时）和报告路径；若某工具未提供某项指标，明确标注未采集。

## 范围与约束

- 覆盖率只统计生产代码，不统计测试源码、构建产物和依赖目录。
- 不修改业务逻辑，不新增覆盖率门槛，不删除用户现有未跟踪文件。
- 使用现有测试命令验证：各 Java 服务 `mvn verify`，Python `pytest`，前端 `npm run test:coverage`。

## 验收标准

- 三个技术栈均能生成覆盖率报告。
- 报告包含可核验的实际数字和文件路径。
- 原有 127 个测试仍全部通过。
