# TravelOn 测试学习教程设计

## 1. 目标

为已经学习过 Java、C/C++、Docker、Bash、CMake 的学生制作一套可在本仓库中直接阅读的测试教程。

教程需要解决三个问题：

1. 说明测试在软件开发中的作用，而不是只介绍测试框架 API。
2. 用 TravelOn 当前仓库中的真实测试代码解释测试结构、断言、Mock、业务规则和异常分支。
3. 给出连续的学习路径，让读者从最小的单元测试逐步进入多语言测试和测试质量判断。

教程不修改生产业务逻辑，不把集成测试、接口测试或端到端测试伪装成单元测试。需要明确区分“测试代码验证的对象”和“测试运行所依赖的外部环境”。

## 2. 读者和前置条件

读者已经具备：

- Java 基础语法、类、接口、异常和集合知识。
- 基本的 Python、TypeScript 或 JavaScript 阅读能力。
- 基本命令行使用能力。
- 能理解项目目录、依赖和进程。

读者暂时不要求掌握：

- Spring 容器的全部机制。
- Python 高级异步编程。
- React 组件设计。
- 测试驱动开发或持续集成。

教程遇到这些内容时只解释理解当前测试所需的最小部分，并提供后续学习方向。

## 3. 内容组织方案

采用“概念递进、技术穿插”的结构，而不是按语言分别讲完。

学习链条如下：

1. 测试的对象、输入输出和断言。
2. 一个最小单元测试如何组织。
3. Java/JUnit 5 中如何隔离依赖。
4. 如何从业务规则设计边界值和异常分支。
5. 如何测试文件系统、归属校验和失败结果。
6. Python/pytest 中如何测试异步、重试、超时和限流。
7. React/Jest/Testing Library 中如何验证用户可观察行为。
8. 如何判断测试是否有效、可维护、覆盖了关键风险。
9. 如何在当前仓库中运行测试、分析失败并继续练习。

推荐阅读顺序是目录页中的 1 到 8 章。读者可以从目录跳转到任意章节，但每章都会链接到前置和后续章节。

## 4. 输出目录和页面

新教程放在：

```text
docs/testing-learning/
├── index.html
├── 1-testing-basics.html
├── 2-first-java-test.html
├── 3-business-rules.html
├── 4-exceptions-and-mocks.html
├── 5-python-pytest.html
├── 6-frontend-tests.html
├── 7-test-quality.html
└── 8-run-and-practice.html
```

页面使用纯静态 HTML、CSS 和少量原生 JavaScript，不引入新的构建工具。打开 `index.html` 即可开始阅读。每个章节页都能独立打开，代码示例不依赖网络请求。

页面风格参考：

- `E:\2026spring\software-contest\backend-basics\backend-basics\index.html`
- `E:\2026spring\software-contest\backend-basics\backend-basics\1-what-is-backend.html`

具体保留目录页、章节导航、代码块、提示框、动手练习、自测和章节间导航；不复制参考教程中的后端主题内容。

## 5. 章节设计

### 5.1 `index.html`：测试学习路线

内容：

- 说明本教程服务于 TravelOn 的现有测试代码。
- 给出学习路线图：
  `输入/输出 → 断言 → 单元隔离 → 业务规则 → 异常分支 → 异步测试 → 前端行为 → 测试质量`。
- 给出项目测试地图：
  - Java/Spring：`travel-api/*/src/test/java`
  - Python：`travel-api/ai-arrange-agent-service/tests`
  - React：`travel-ui/src/**/*.test.*`
- 显示每章的目标、依赖和代表文件。
- 环境准备只给出运行教程所需的命令，不要求先启动全部 Docker 服务。
- 说明测试的基本术语：被测对象、测试输入、预期结果、实际结果、断言、测试夹具、Mock。

目录页的自测要求读者回答：

- 哪个测试只验证一个 Java Service 的业务结果？
- 哪个测试需要异步运行？
- 为什么启动 Docker Compose 不是单元测试本身？

### 5.2 `1-testing-basics.html`：从断言开始

使用以下真实代码：

- `travel-api/ai-arrange-agent-service/tests/test_unit_edge_cases.py`
- `travel-api/ai-arrange-agent-service/app/services/fallback_plan_builder.py`
- `travel-api/ai-arrange-agent-service/app/validation/planner_output.py`

内容顺序：

1. 测试不是“程序没有报错”，而是对结果作出判断。
2. 一个测试的 Arrange、Act、Assert 三部分。
3. `assert`、`pytest.raises` 和结果字段断言的差异。
4. 用 `FallbackPlanBuilder().build(request(), [])` 讲返回值的多个业务条件。
5. 用 `validate_planner_output_payload` 讲合法输入、非法输入和异常类型。
6. 解释为什么 `assert result` 的信息量低于 `assert result.status is ToolStatus.SUCCESS`。

动手练习：

- 把一个只检查“返回对象存在”的测试改成至少三个有意义的结果断言。
- 为 `validate_planner_output_payload` 增加一个缺少 `title` 的异常测试。

### 5.3 `2-first-java-test.html`：JUnit 5、Mockito 和 AssertJ

使用以下真实代码：

- `travel-api/user-service/src/test/java/org/microarchitecturovisco/userservice/services/UserServiceTest.java`
- `travel-api/user-service/src/main/java/org/microarchitecturovisco/userservice/services/UserService.java`

内容顺序：

1. Maven 测试目录约定和测试类命名。
2. `@Test`、`@ExtendWith(MockitoExtension.class)`、`@Mock`、`@InjectMocks`。
3. 为什么 `UserServiceTest` 不需要启动 PostgreSQL。
4. `when(...).thenReturn(...)` 如何提供依赖行为。
5. `verify(...)` 和 `ArgumentCaptor` 如何验证副作用。
6. AssertJ 的值断言和异常断言。
7. 逐段解释 `registerNormalizesEmailAndSavesProfileDefaults`：
   - 输入被规范化。
   - 默认角色和等级被设置。
   - 密码被哈希。
   - Repository 收到保存请求。
   - 返回 token 与保存对象一致。
8. 逐段解释重复邮箱和错误密码分支。

动手练习：

- 增加一个“用户不存在时登录返回 401”的测试。
- 增加一个断言，验证重复邮箱分支不会调用 `save`。

### 5.4 `3-business-rules.html`：业务规则、边界值和等价类

使用以下真实代码：

- `travel-api/payment-service/src/test/java/org/microarchitecturovisco/paymentservice/services/PaymentServiceTest.java`
- `travel-ui/src/core/validation.test.ts`
- `travel-ui/src/core/validation.ts`

重点解释：

1. 先从需求提取规则，再选择测试数据。
2. 等价类：合法 UnionPay 卡、非 UnionPay 卡、格式错误、Luhn 校验错误。
3. 边界值：充值金额最小值和最大值、卡片有效期、入住起止日期。
4. 组合规则：儿童必须有成人或学生同行，交通类型会改变年龄规则。
5. 为什么一个测试可以验证多个相关断言，但每个断言都必须表达明确业务结果。
6. 测试名称如何描述规则，而不是描述实现细节。

真实示例至少包括：

- `6222021234567894` 通过 Luhn 和 UnionPay 前缀检查。
- `4111111111111111` 被拒绝。
- 入住开始日期等于当天可以通过，早于当天失败。
- 只有儿童的旅客列表失败，儿童和成人同行通过。

动手练习：

- 为充值金额 `10`、`9`、`50001` 设计等价类表。
- 为学生票规则补充一个合法输入测试。

### 5.5 `4-exceptions-and-mocks.html`：异常分支与外部依赖

使用以下真实代码：

- `travel-api/community-service/src/test/java/org/microarchitecturovisco/communityservice/service/FileStorageServiceTest.java`
- `travel-api/ai-arrange-service/src/test/java/org/microarchitecturovisco/aiarrangeservice/service/PlannerConversationServiceTest.java`
- `travel-api/user-service/src/test/java/org/microarchitecturovisco/userservice/services/UserServiceTest.java`

内容顺序：

1. 异常分支也是业务结果，不能只覆盖成功路径。
2. `assertThatThrownBy` 如何断言异常类型和状态信息。
3. `@TempDir` 如何让文件测试使用临时目录并自动清理。
4. 文件上传测试如何同时验证：
   - 返回公开路径。
   - 扩展名正确。
   - 实际文件存在。
   - 文件内容一致。
5. 空文件和非图片文件为什么属于两个输入分支。
6. 会话归属测试如何验证用户不能读取其他用户的 AI 行程会话。
7. Mock 的边界：只替换外部依赖，不替换被测业务规则。

动手练习：

- 为文件存储增加一个路径相关的异常测试。
- 为 AI 会话增加“会话不存在”和“用户不匹配”两个用例，并分别断言异常结果。

### 5.6 `5-python-pytest.html`：pytest 和异步失败场景

使用以下真实代码：

- `travel-api/ai-arrange-agent-service/tests/test_unit_edge_cases.py`
- `travel-api/ai-arrange-agent-service/tests/test_tool_registry.py`
- `travel-api/ai-arrange-agent-service/app/harness/tool_registry.py`

内容顺序：

1. pytest 如何发现 `test_*.py` 和 `test_*` 函数。
2. 测试辅助函数 `request`、`context`、`spec` 的作用。
3. `pytest.raises(ValidationError)` 的异常断言。
4. `@pytest.mark.asyncio` 和 `async def` 测试。
5. 使用闭包计数器验证第一次失败、第二次成功的重试行为。
6. 使用短超时构造 `TOOL_TIMEOUT`。
7. 使用调用次数限制验证 `TOOL_CALL_LIMIT_REACHED`。
8. 验证异常被转换为 `ToolStatus.FAILED` 和 `TOOL_EXCEPTION`，而不是直接让测试进程崩溃。
9. 解释 Python 测试中 `is`、`==`、`in` 的适用场景。

动手练习：

- 为工具注册表增加“未注册工具”的测试。
- 把重试次数从 1 改为 2，写出可以证明调用次数的断言。

### 5.7 `6-frontend-tests.html`：Jest、React Testing Library 和用户行为

使用以下真实代码：

- `travel-ui/src/core/validation.test.ts`
- `travel-ui/src/reservations/orderStatus.test.ts`
- `travel-ui/src/App.test.js`

内容顺序：

1. CRA 中 `yarn test` 和 Jest 的关系。
2. 纯函数校验测试与 React 组件测试的区别。
3. 通过 `expect(...).toBe(...)`、`not.toBe('')` 断言业务结果。
4. 表单校验、订单支付/退款状态和 App shell smoke test。
5. React Testing Library 的核心原则：测试用户能看到和操作的行为，而不是组件内部状态。
6. 为什么旧的默认 `learn react` 测试不能证明 TravelOn 的页面可用。
7. 日期、身份证号和当前时间相关测试如何固定输入，减少不确定性。

动手练习：

- 为订单状态增加一个非法状态转换测试。
- 为表单校验增加一个空手机号或无效银行卡号测试。

### 5.8 `7-test-quality.html`：从“能运行”到“有效测试”

内容：

1. 有效断言的四个问题：
   - 断言了什么业务结果？
   - 失败时能否定位规则？
   - 是否覆盖异常或边界？
   - 是否依赖不稳定的外部环境？
2. 测试隔离：单元测试为什么不应依赖 PostgreSQL、MongoDB、RabbitMQ 或真实外部 API。
3. 测试替身的选择：Mock、Stub、临时目录、固定日期和假数据。
4. 测试覆盖率的作用与局限：
   - 覆盖率高不等于断言正确。
   - 未执行异常分支时，行覆盖率可能掩盖业务风险。
5. 测试可读性：测试名称、Arrange/Act/Assert、辅助函数和最小数据。
6. 参数化和重复测试的改进方向。
7. 单元测试、集成测试和端到端测试在 TravelOn 中的边界。

本章会使用一个“只判断没有抛异常”的反例，对比当前项目中的结果字段断言。

### 5.9 `8-run-and-practice.html`：运行、排错和练习路线

内容：

- Java 单模块测试：

```powershell
cd travel-api/user-service
mvn test
```

- 在本机 JDK 25 环境下遇到旧 Byte Buddy 时的说明：

```powershell
mvn -Dnet.bytebuddy.experimental=true test
```

- Python：

```powershell
cd travel-api/ai-arrange-agent-service
pytest
```

- 前端：

```powershell
cd travel-ui
yarn test
```

- 说明完整 Spring 上下文测试可能依赖 `postgres` 主机；这类失败要区分为环境依赖问题，而不是把它误判成业务断言失败。
- 给出排错顺序：先读失败测试名，再读失败断言，再看输入和 Mock 配置，最后检查环境。
- 给出一个从低风险到高风险的练习列表：
  1. 给已有测试补充一个明确断言。
  2. 增加一个异常分支。
  3. 增加一个边界值。
  4. 替换一个真实外部依赖为 Mock。
  5. 为一个未覆盖的业务 Service 建立测试类。

## 6. 统一页面模板

每个章节页包含以下区域：

1. 顶部面包屑和章节编号。
2. 本章学习目标。
3. “先回答一个问题”提示框。
4. 概念讲解。
5. 项目代码路径和代码片段。
6. 代码片段逐段说明。
7. 常见错误或边界提醒。
8. 动手练习。
9. 原生 JavaScript 自测题，点击后显示答案。
10. 上一章、目录、下一章导航。

代码示例使用深色 `pre` 块和少量静态高亮，不依赖语法高亮库。代码中的路径、命令和测试名称使用等宽字体。所有示例都注明“代码来自哪个文件”和“本段断言验证什么”。

## 7. 交互和可访问性

- 目录页章节卡片可点击。
- 章节页的代码块提供复制按钮。
- 自测题在未选择答案时也显示解释，不阻止继续阅读。
- 代码块支持横向滚动。
- 页面在窄屏下将侧栏变为顶部导航。
- 使用语义化标题、按钮和链接，保证键盘可以完成导航和自测。
- 不使用外部图片、远程字体或网络接口，教程在离线环境也能打开。

## 8. 验收标准

### 内容

- 至少包含上述 8 个章节页和 1 个目录页。
- 每个章节至少引用一个仓库内真实测试文件。
- 至少出现 Java、Python、React 三种测试工具链的可运行命令。
- 至少解释一个成功分支、一个边界分支和一个异常分支。
- 至少解释一次 Mock、一次临时目录或固定输入、一次异步测试。
- 所有示例都包含判断结果的断言，不以“没有报错”作为唯一结论。

### 页面

- 从 `docs/testing-learning/index.html` 可以进入所有章节。
- 每个章节都能返回目录并进入下一章。
- 页面无需构建即可在浏览器中打开。
- 代码块、提示框、自测和移动端布局可正常使用。

### 技术核对

- Java 示例与当前 JUnit 5、Mockito、AssertJ 写法一致。
- Python 示例与当前 pytest、pytest-asyncio 配置一致。
- 前端示例与当前 Jest、Testing Library 和 CRA 脚本一致。
- 不声称 Docker Compose 启动验证属于单元测试。
- 不修改现有生产代码和已有测试文件。

## 9. 非目标

- 不新增测试框架或生产依赖。
- 不重写现有测试。
- 不把所有业务模块都扩展成完整测试套件。
- 不提供完整的 CI/CD 配置。
- 不替代项目现有的测试文档、部署文档或需求文档。
