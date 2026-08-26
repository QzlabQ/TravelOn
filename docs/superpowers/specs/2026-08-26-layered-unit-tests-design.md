# Integrated Travel Platform Layered Unit Tests Design

## Goal

补充一套稳定、可重复运行的三层单元测试，覆盖关键类、业务规则、成功结果和异常分支，并让每个测试包含可验证的结果断言。

## Scope

### Java Spring services

- `user-service`: `UserService` 注册、登录、会话鉴权和资料冲突；`TravelerService` 旅客类型校验、资源归属和默认旅客互斥。
- `payment-service`: `PaymentService` 银联卡格式、Luhn 校验和交易审批结果。
- `ai-arrange-service`: 复用已有编排测试，补充会话归属、快照/版本异常和选择状态同步。
- `community-service`: `FileStorageService` 文件名/存储异常分支；保留现有社区 service 测试结构。

### Python AI agent

- fallback plan 生成的缺失 slots 与无工具结果分支。
- planner output 的 payload 校验、UUID 清洗和错误摘要。
- tool registry 的超时、重试、handler 异常和调用上限。
- sanitizer 的敏感字段脱敏结果。

### React frontend

- `src/core/validation.ts` 的手机号、身份证、银行卡、有效期、充值金额、住宿日期、儿童/学生票规则。
- `src/reservations/orderStatus.ts` 的支付过期、退款处理中、已支付、可支付和可取消规则。
- 替换过时的 CRA `learn react` smoke test 为产品应用的最小渲染断言。

## Test design

每个测试采用“输入—结果—副作用/异常”结构。成功测试断言业务字段和关键副作用；异常测试断言异常类型以及 HTTP 状态、错误码或关键信息。Repository、HTTP client、消息队列和随机/时间边界只在依赖边界 mock；被测 service、Python registry/tool result 和前端纯函数使用真实实现。

Java 测试按服务目录独立运行 Maven；Python 使用项目 pytest 配置；前端使用非交互 Jest。测试不得依赖真实数据库、网络、外部模型或持久化文件系统。

## Acceptance criteria

1. 新增测试文件均能被对应构建工具发现并执行。
2. 每个关键成功/失败分支都有结果断言，不存在只验证“不报错”的测试。
3. Java、Python、React 三层完整测试命令均返回零退出码。
4. 现有业务代码只在测试暴露真实缺陷且为使测试表达既有契约所必需时修改；否则仅新增或调整测试。
5. 不修改用户已有的未跟踪 `docs/ite/` 内容。

## Verification commands

```text
cd travel-api/user-service && .\\mvnw test
cd travel-api/payment-service && .\\mvnw test
cd travel-api/ai-arrange-service && .\\mvnw test
cd travel-api/community-service && .\\mvnw test
cd travel-api/ai-arrange-agent-service && python -m pytest -q
cd travel-ui && yarn test --watchAll=false
```
