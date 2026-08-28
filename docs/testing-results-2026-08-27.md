# 本地测试与覆盖率结果

测试日期：2026-08-27（Asia/Shanghai）

## 测试目标

验证关键类、方法、业务规则及异常分支的正确性，并为每个测试用例提供明确断言。

## 执行入口

在仓库根目录执行：

```powershell
powershell -ExecutionPolicy Bypass -File .\travel-api\tests\run-unit-test-coverage.ps1
```

Python AI 服务固定在独立 Conda 环境 `travelon-tests`（Python 3.12）中运行：

```powershell
conda run -n travelon-tests python -m pytest -q
```

执行完成后自动生成中文汇总、JSON 数据和逐模块日志：

- `artifacts/test-results/latest.md`
- `artifacts/test-results/summary.json`
- `artifacts/test-results/logs/`

## 测试内容与验收证据

- 关键类和关键方法：Java 服务、Python AI 编排服务与前端领域工具均由统一入口执行。
- 业务规则：覆盖行程规划、支付、预订授权、交通查询、用户及旅客规则等核心路径。
- 正常输入、边界条件、非法输入和异常分支：测试使用结果、HTTP 状态、异常或依赖交互断言，而非仅检查程序未报错。
- 异常兼容性：`reservation-service` 将控制器依赖改为窄接口，避免在 JDK 25 下 mock 具体类触发 Mockito/Byte Buddy 1.14.12 的类重定义限制。

## 实测结果

统一入口本次执行完成时间：2026-08-27 14:16（Asia/Shanghai）。

- 测试用例数量：155
- 通过数量：155
- 失败数量：0
- 错误数量：0
- 跳过数量：0
- 总体状态：通过

| 模块 | 测试（通过/总数） | 行覆盖率 | 分支覆盖率 |
| --- | ---: | ---: | ---: |
| ai-arrange-service | 28/28 | 63.24% | 41.47% |
| api-gateway | 1/1 | 33.33% | 未获取 |
| community-service | 13/13 | 28.91% | 22.54% |
| discovery-service | 1/1 | 33.33% | 未获取 |
| hotel-service | 6/6 | 10.86% | 9.38% |
| offer-provider-service | 1/1 | 9.77% | 0.00% |
| payment-service | 3/3 | 50.85% | 100.00% |
| reservation-service | 12/12 | 10.32% | 5.50% |
| transport-service | 15/15 | 50.65% | 58.44% |
| user-service | 15/15 | 70.78% | 45.00% |
| ai-arrange-agent-service | 52/52 | 80.98% | 55.11% |
| travel-ui | 8/8 | 13.00% | 3.11% |

## 失败问题与日志

- 断言失败：无。
- 测试错误：无。
- 非失败警告：Python 测试输出一条 FastAPI/Starlette 对 `TestClient` 的第三方弃用警告，不影响 52 个 pytest 用例或统一入口的通过状态。
- 完整日志由 `artifacts/test-results/logs/` 自动生成；该目录为生成物，不纳入版本控制。

测试人员：CodeAstronauth

测试完成时间：2026-08-27 14:16（Asia/Shanghai）
