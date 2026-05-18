# Travel-Agent Harness 与 Java 接入任务拆分

## 0. 当前结论

当前路线已经确定：

- 先做 Python `ai-arrange-agent-service` 的轻量 Harness 底座。
- 不先增加更多旅行工具。
- Python Agent 保持纯计算/逻辑节点，不直连 MongoDB，不直接面向前端 WebSocket。
- Java `ai-arrange-service` 仍然负责鉴权、状态管理、MongoDB 落库和前端 WebSocket 推送。
- Trace 一期只打 JSON Log，二期按需由 Java 或日志系统消费后落库。
- 前端只展示“白话版工具状态”，不展示底层 JSON，不展示模型内部思维链。

本文档用于后续开发任务追踪，避免遗漏。

## 1. 总体阶段

| 阶段 | 名称 | 目标 |
| --- | --- | --- |
| 阶段一 | Harness 底座 | 让 Agent 有工具注册、统一结果、trace、运行策略和用户可见事件 |
| 阶段二 | 旅行专业工具 | 在 Harness 之上补充航班、酒店、天气、路线、预算等旅行工具 |
| 阶段三 | Prompt 与轻量 ReAct | 让 Agent 能拆解复杂规划任务并按策略调用工具 |
| 阶段四 | Java 集成与前端联调 | Java 调用 Python Agent，落库结果，并通过 WebSocket 推送状态和规划 |

当前优先级：只执行阶段一。

## 2. 阶段一：Harness 底座

### 2.1 新增目录

在 `ai-arrange-agent-service/app/` 下新增：

```text
harness/
  __init__.py
  policy.py
  trace.py
  tool_result.py
  tool_registry.py
  hooks.py
```

### 2.2 `policy.py`

新增 `RuntimePolicy`。

职责：

- 控制每轮最大工具调用数。
- 控制每轮最大模型调用数。
- 控制单轮最大执行时间。
- 提供工具级默认超时。
- 提供是否启用 trace 的开关。

建议字段：

```python
class RuntimePolicy(BaseModel):
    max_tool_calls_per_turn: int = 5
    max_model_calls_per_turn: int = 1
    max_execution_time_seconds: float = 30.0
    default_tool_timeout_seconds: float = 10.0
    trace_enabled: bool = True
```

配置来源：

```text
AGENT_MAX_TOOL_CALLS_PER_TURN=5
AGENT_MAX_MODEL_CALLS_PER_TURN=1
AGENT_MAX_RUNTIME_SECONDS=30
AGENT_TRACE_ENABLED=true
AGENT_TOOL_TIMEOUT_SECONDS=10
```

验收标准：

- 不配置环境变量时使用默认值。
- 配置非法值时不崩溃，回退默认值。
- 运行超过限制时，Agent 返回 `PARTIAL_SUCCESS` 和 warning。

### 2.3 `tool_result.py`

新增统一工具返回结构。

建议结构：

```python
class ToolStatus(str, Enum):
    SUCCESS = "SUCCESS"
    PARTIAL_SUCCESS = "PARTIAL_SUCCESS"
    SKIPPED = "SKIPPED"
    FAILED = "FAILED"

class ToolWarning(BaseModel):
    code: str
    message: str
    source: str

class ToolResult(BaseModel):
    tool: str
    status: ToolStatus
    data: Any | None = None
    warnings: list[ToolWarning] = []
    errorCode: str | None = None
    errorMessage: str | None = None
    latencyMs: int = 0
    retryCount: int = 0
    userMessage: str | None = None
```

要求：

- 工具内部异常不得直接抛到 Agent 主流程。
- 工具失败必须转换为 `ToolResult(status=FAILED)`。
- `userMessage` 用于给前端展示白话状态，例如“正在查询上海景点...”。

验收标准：

- `amap_poi_search` 返回 `ToolResult`。
- `amap_route_plan` 返回 `ToolResult`。
- `internal_hotel_match` 返回 `ToolResult`。
- DeepSeek 调用也返回类似 `ToolResult` 或 `ModelCallResult`。

### 2.4 `tool_registry.py`

新增工具注册中心。

建议结构：

```python
class ToolSpec(BaseModel):
    name: str
    description: str
    input_schema: str
    output_schema: str
    timeout_seconds: float
    retry_count: int
    requires_secret: bool
    side_effect: bool
    user_running_message: str
    user_success_message: str
    user_failure_message: str

class ToolRegistry:
    def register(self, spec: ToolSpec, handler: Callable): ...
    def get(self, name: str): ...
    def list_tools(self): ...
```

第一阶段需要注册：

- `amap_poi_search`
- `amap_route_plan`
- `internal_hotel_match`
- `deepseek_chat_completion`
- `fallback_plan_builder`

验收标准：

- 启动时所有工具成功注册。
- 重复注册同名工具时抛出明确错误。
- 请求不存在工具时返回明确错误。
- 工具列表可用于后续 debug 或 health 扩展。

### 2.5 `trace.py`

新增 Agent 轨迹记录结构。

建议结构：

```python
class TraceEvent(BaseModel):
    traceId: str
    conversationId: str | None
    userId: str | None
    eventType: str
    name: str
    status: str
    latencyMs: int | None = None
    message: str | None = None
    metadata: dict[str, Any] = {}
    createdAt: datetime

class AgentTrace(BaseModel):
    traceId: str
    conversationId: str
    userId: str
    startedAt: datetime
    finishedAt: datetime | None = None
    events: list[TraceEvent] = []
```

日志要求：

- 一期只打印 JSON Log。
- 每条日志必须包含 `traceId`。
- 不记录模型真实思维链。
- 不记录完整 API key、Authorization、Cookie。
- 工具输入可以记录摘要，不记录敏感明文。

必须记录的事件：

- `AGENT_RUN_STARTED`
- `AGENT_RUN_FINISHED`
- `TOOL_CALL_STARTED`
- `TOOL_CALL_FINISHED`
- `MODEL_CALL_STARTED`
- `MODEL_CALL_FINISHED`
- `FALLBACK_USED`
- `RUNTIME_LIMIT_REACHED`

验收标准：

- 每次 `/agent/planner/run` 都生成一个 `traceId`。
- 控制台输出 JSON 格式 trace 日志。
- Agent 响应体包含 `traceId`。

### 2.6 `hooks.py`

新增 Hooks / Middleware。

第一阶段实现以下函数即可：

```python
before_agent_run(...)
after_agent_run(...)
before_tool_call(...)
after_tool_call(...)
before_model_call(...)
after_model_call(...)
```

职责：

- 记录 trace event。
- 统计工具调用次数。
- 检查 RuntimePolicy。
- 生成用户可见状态事件。
- 捕获异常并转换为 ToolResult。

验收标准：

- 工具调用前后均有日志。
- 工具异常不会导致 HTTP 500。
- 达到工具次数上限时不再调用新工具。

### 2.7 API 响应结构调整

修改 `AgentRunResponse`，新增字段：

```python
traceId: str
userFacingEvents: list[UserFacingEvent]
```

新增结构：

```python
class UserFacingEvent(BaseModel):
    type: str = "TOOL_STATUS"
    message: str
    status: str
    tool: str | None = None
```

示例：

```json
{
  "traceId": "f6b7...",
  "userFacingEvents": [
    {
      "type": "TOOL_STATUS",
      "message": "正在查询上海的景点和餐厅...",
      "status": "RUNNING",
      "tool": "amap_poi_search"
    },
    {
      "type": "TOOL_STATUS",
      "message": "已找到 6 个可展示地点",
      "status": "SUCCESS",
      "tool": "amap_poi_search"
    }
  ]
}
```

验收标准：

- `/agent/planner/run` 响应包含 `traceId`。
- 没有 API key 的 fallback 情况也包含 `traceId`。
- `userFacingEvents` 至少包含模型或 fallback 状态。

### 2.8 现有工具改造

需要改造的文件：

```text
ai-arrange-agent-service/app/tools/amap_tool.py
ai-arrange-agent-service/app/tools/route_tool.py
ai-arrange-agent-service/app/tools/internal_offer_tool.py
ai-arrange-agent-service/app/clients/deepseek_client.py
ai-arrange-agent-service/app/services/fallback_plan_builder.py
ai-arrange-agent-service/app/services/planner_agent.py
```

改造要求：

- 工具统一返回 `ToolResult`。
- `PlannerAgent` 不再直接拼 `ToolCall`，而是从 `ToolResult` 转换。
- warnings 统一从 `ToolResult.warnings` 汇总。
- `toolCalls` 保持兼容当前响应结构。
- 新增 `userFacingEvents`。

验收标准：

- 原有 3 个 Python 测试继续通过。
- 新增 trace 和 userFacingEvents 测试通过。
- 没有 DeepSeek / Amap key 时仍能返回结构化 fallback。

## 3. 阶段一测试任务

### 3.1 单元测试

新增或修改：

```text
ai-arrange-agent-service/tests/test_agent_api.py
ai-arrange-agent-service/tests/test_harness_policy.py
ai-arrange-agent-service/tests/test_tool_registry.py
ai-arrange-agent-service/tests/test_trace.py
```

测试点：

- `GET /agent/health` 返回 UP。
- `POST /agent/planner/run` 返回 `traceId`。
- 缺少核心槽位时返回 warning，不崩溃。
- 无 API key 时返回 fallback。
- ToolRegistry 能注册和查询工具。
- 重复注册工具时报错。
- RuntimePolicy 默认值正确。
- RuntimePolicy 环境变量覆盖生效。
- trace 日志事件包含 `traceId`。

### 3.2 手动 HTTP 验证

启动：

```powershell
cd ai-arrange-agent-service
.\.venv\Scripts\Activate.ps1
uvicorn app.main:app --reload --port 8090
```

健康检查：

```powershell
Invoke-RestMethod -Method Get -Uri http://127.0.0.1:8090/agent/health
```

规划请求：

```powershell
$body = @{
  conversationId = "00000000-0000-0000-0000-000000000010"
  userId = "00000000-0000-0000-0000-000000000001"
  coreSlots = @{
    city = "Shanghai"
    travelStartDate = "2026-06-01"
    travelEndDate = "2026-06-03"
    peopleCount = 2
    travelStyle = "relaxed"
    mustVisitKeywords = @("museum", "river view")
  }
  userMessage = "Please keep the route relaxed."
  selectedPlaceIds = @()
  latestSnapshot = @{
    version = 0
    markdown = ""
    places = @()
    routes = @()
  }
  history = @()
} | ConvertTo-Json -Depth 10

Invoke-RestMethod `
  -Method Post `
  -Uri http://127.0.0.1:8090/agent/planner/run `
  -ContentType "application/json" `
  -Body $body
```

验收：

- 返回 HTTP 200。
- 返回 `traceId`。
- 返回 `markdown`。
- 返回 `places` 数组。
- 返回 `toolCalls`。
- 返回 `warnings`。
- 返回 `userFacingEvents`。
- 控制台出现 JSON Log。

## 4. 阶段二：旅行专业工具

阶段二暂不执行，只记录任务。

### 4.1 工具候选

| Tool | 说明 | 数据来源 |
| --- | --- | --- |
| `search_hotels` | 查询酒店候选 | Java `offer-provider-service` |
| `search_flights` | 查询机票/交通 | Java `transport-service` 或外部 API |
| `get_weather` | 查询天气 | 外部天气 API |
| `estimate_budget` | 估算预算 | 本地规则 + 模型总结 |
| `optimize_route` | 优化路线顺序 | 高德路线 API |
| `match_internal_offer` | 匹配内部可订 offer | `offer-provider-service` |

### 4.2 Mock 机制

要求：

- 每个工具支持 mock 模式。
- Mock 数据放在 `ai-arrange-agent-service/tests/fixtures/` 或 `app/mock_data/`。
- Mock 模式由环境变量控制：

```text
AGENT_TOOL_MOCK_ENABLED=true
```

### 4.3 Java Context 传入

原则：

- Python 不主动查 DB。
- Python 不直接查用户订单。
- Java 调用 Agent 时主动传入用户上下文。

后续请求体可扩展：

```json
{
  "userContext": {
    "travelPreferences": {},
    "historicalTrips": [],
    "familyProfile": {},
    "budgetProfile": {}
  }
}
```

## 5. 阶段三：Prompt 与轻量 ReAct

阶段三已完成第一版轻量实现：

- Prompt 已拆分到 `app/prompts/`。
- `DeepSeekClient` 已组合 prompt 片段，不再把完整系统 prompt 写成一个长字符串。
- `PlannerAgent` 已使用有限步 ReAct 编排，默认最多 3 步。
- 证据工具默认最多 4 次，预留 1 次工具额度给 `fallback_plan_builder`。
- 达到工具限制时必须返回 partial fallback，不允许因为工具预算耗尽导致 HTTP 500。

### 5.1 Prompt 拆分

新增目录：

```text
ai-arrange-agent-service/app/prompts/
  role_prompt.py
  policy_prompt.py
  output_contract_prompt.py
  tool_selection_prompt.py
  repair_prompt.py
```

要求：

- 不再把所有 prompt 写在一个字符串里。
- 输出格式必须和 `AgentRunResponse` 对齐。
- 明确禁止输出内部思维链。
- 明确失败时返回 partial result。

### 5.2 轻量 ReAct 循环

只做有限循环，不做无限自主执行。

伪流程：

```text
while step < max_steps:
  recognize intent
  choose tool
  execute tool
  collect observation
  if enough evidence:
    generate answer
    break
```

硬限制：

- `max_steps <= 3`
- `max_tool_calls_per_turn <= 5`
- `max_model_calls_per_turn <= 2`
- 达到限制必须 fallback

## 6. 阶段四：Java 集成与前端联调

阶段四暂不执行，但需要提前约定。

### 6.1 Java 新增客户端

新增：

```text
ai-arrange-service/src/main/java/.../client/PlannerAgentClient.java
```

职责：

- 调用 `http://ai-arrange-agent:8090/agent/planner/run`。
- 设置 timeout。
- 失败后 fallback 到 Java 当前逻辑。
- 透传 `traceId`。

### 6.2 Java DTO

新增：

```text
AgentRunRequest
AgentRunResponse
AgentToolCall
AgentWarning
AgentUserFacingEvent
```

字段必须和 Python 响应对齐。

### 6.3 WebSocket 推送状态

新增或复用消息类型，待定。

建议新增：

```text
PLANNER_AGENT_STATUS
```

payload：

```json
{
  "traceId": "uuid",
  "message": "正在查询上海的景点和餐厅...",
  "status": "RUNNING",
  "tool": "amap_poi_search"
}
```

注意：

- 前端展示白话状态。
- 不展示底层 JSON。
- 不展示模型内部思维链。

### 6.4 Java 落库

要求：

- `PlannerSnapshot` 建议增加 `traceId` 字段。
- `PlannerMessage` metadata 中保存 `traceId`。
- MongoDB 仍由 Java 统一写入。
- Python 不直接写 MongoDB。

## 7. 暂不做事项

以下内容暂不进入下一轮开发：

- MCP Server
- LangGraph
- AutoGen
- 多 Agent 协作
- Python 直连 MongoDB
- Python 直接处理前端 WebSocket
- Python 直接读取用户订单数据库
- 前端展示模型内部思维链
- 完整可视化 trace 回放页面
- 真实机票外部 API
- 真实天气 API

## 8. 下一次编码建议顺序

严格按以下顺序做：

1. 新增 `harness/policy.py`。
2. 新增 `harness/tool_result.py`。
3. 新增 `harness/trace.py`。
4. 新增 `harness/tool_registry.py`。
5. 新增 `harness/hooks.py`。
6. 修改 `models.py`，增加 `traceId` 和 `userFacingEvents`。
7. 改造 `amap_tool.py`。
8. 改造 `route_tool.py`。
9. 改造 `internal_offer_tool.py`。
10. 改造 `deepseek_client.py`。
11. 改造 `planner_agent.py` 汇总 trace、tool result、events。
12. 增加测试。
13. 跑 `pytest`。
14. 手动 HTTP 验证。
15. 更新 `ai-arrange-agent-service/README.md`。

## 9. 阶段一完成标准

阶段一完成必须同时满足：

- `pytest` 全部通过。
- `/agent/health` 正常。
- `/agent/planner/run` 正常。
- 每轮响应都有 `traceId`。
- 每轮响应都有 `toolCalls`。
- 每轮响应都有 `warnings`。
- 每轮响应都有 `userFacingEvents`。
- 无 API key 时仍能返回 fallback。
- 工具失败不导致 HTTP 500。
- 控制台有 JSON Trace Log。
- `docker compose config --services` 能看到 `ai-arrange-agent`。

## 10. 风险点

| 风险 | 处理 |
| --- | --- |
| Harness 过度设计 | 阶段一只做轻量模块，不接 MCP、不接 LangGraph |
| ToolResult 改造影响现有测试 | 保持 `toolCalls` 响应兼容 |
| Trace 泄露敏感信息 | 禁止记录 API key、Authorization、Cookie、完整用户隐私 |
| Java DTO 对不上 Python 响应 | Python 响应字段先稳定，再做 Java 接入 |
| 前端误以为能看 CoT | 只提供 `userFacingEvents`，不提供模型思维链 |
| 运行时间不可控 | RuntimePolicy 设置硬限制 |

## 11. 需要用户确认但不阻塞阶段一的问题

1. `PLANNER_AGENT_STATUS` 是否作为新的 WebSocket 类型，还是复用 `PLANNER_CHAT_STREAM`？
2. `traceId` 是否需要进入 `PlannerSnapshot` 顶层字段，还是只放在 metadata？
3. Java 调 Python Agent 的 timeout 初始值使用 30 秒还是 120 秒？
4. 前端状态文案是否需要中英文双语，还是先按中文？

默认执行假设：

- 新增 `PLANNER_AGENT_STATUS`。
- `traceId` 进入 `PlannerSnapshot` 顶层字段。
- Java 调 Python Agent timeout 先用 30 秒。
- 前端状态文案先用中文。
