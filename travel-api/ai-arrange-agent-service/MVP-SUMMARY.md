# AI Arrange Agent MVP 阶段任务总结

> 本文是 MVP 阶段历史总结，用于回顾 Harness、工具和轻量 ReAct 的起点；它不是当前最新开发计划。当前最新计划请看 `NEXT-DEVELOPMENT-PLAN.md`，其中阶段 0 已要求对齐文档、配置默认值和后续 SSE 流式输出方向。

## 1. MVP 目标

本阶段只聚焦 `ai-arrange-agent-service` Python Agent 模块，不接入 Java `ai-arrange-service`，也不做前端联调。目标是先验证一个可独立运行、可观测、可降级的 Travel Agent MVP，为后续 Java 编排、MongoDB 落库、WebSocket 推送和前端地图交互打基础。

MVP 的核心目标如下：

- 提供独立 Python Agent 服务，避免把 Agent 编排逻辑直接写进 Java 主业务服务。
- 建立轻量级 Harness Engineering 底座，使工具调用有注册、有边界、有 trace、有标准返回。
- 接入 DeepSeek OpenAI-compatible API，验证真实模型可生成结构化旅行规划。
- 提供旅行规划所需的基础工具集合，先以 mock-first 方式打通流程。
- 实现有上限的轻量 ReAct 流程，避免 Agent 无限循环或不可控调用工具。
- 在模型失败、API key 缺失、工具失败时仍能返回本地 fallback 规划结果。

## 2. 当前完成范围

当前模块已形成可运行的 FastAPI 服务：

- 服务目录：`ai-arrange-agent-service`
- 服务入口：`app/main.py`
- 健康检查接口：`GET /agent/health`
- Agent 执行接口：`POST /agent/planner/run`
- 主编排类：`app/services/planner_agent.py`
- 测试目录：`tests/`

当前 Agent 可以接收 `conversationId`、`userId`、`coreSlots`、`userMessage`、`history`、`latestSnapshot`、`userContext` 等上下文，输出规划文本、Markdown、结构化地点、路线、工具调用记录、warning 和用户可读执行状态。

必填槽位校验已在 Agent 层保留：

- `city`
- `travelStartDate`
- `peopleCount`

`travelEndDate`、预算、偏好、交通方式、住宿偏好、必去关键词、避开关键词等作为可选信息参与规划。

## 3. Harness Engineering 四层完成情况

### 3.1 能力层：Skills / Tools

已完成基础旅行工具集合，统一通过 `ToolRegistry` 注册和执行：

| 工具名 | 当前作用 | 当前数据来源 |
| --- | --- | --- |
| `search_hotels` | 查询酒店候选，返回可展示地点结构 | mock-first |
| `internal_hotel_match` | 将酒店候选与内部 offer 标识做匹配 | mock-first |
| `get_weather` | 按旅行日期返回天气参考 | mock-first |
| `search_flights` | 返回城际交通候选；名称保留为 flights，但可表达火车/航班等交通 | mock-first |
| `estimate_budget` | 估算酒店、餐饮、市内交通、门票、城际交通预算 | 本地规则 |
| `amap_route_plan` | 根据地点估算路线段 | 本地确定性估算 |
| `amap_poi_search` | 查询高德 POI，补充经纬度和基础地点信息 | 配置 `AMAP_API_KEY` 后可真实调用 |
| `deepseek_chat_completion` | 调用 DeepSeek 生成最终结构化规划 | 配置 `DEEPSEEK_API_KEY` 后真实调用 |
| `fallback_plan_builder` | 模型或工具失败时生成本地兜底计划 | 本地模板 |

MVP 阶段的工具重点是验证 Agent 能在正确时机调用正确工具，并把结果汇总给模型生成规划。除了 DeepSeek 和可选的高德 POI 外，业务工具仍以 mock 或本地规则为主。

### 3.2 连接层：API / 外部服务接口

已完成的连接方式：

- Python Agent 对外提供内部 HTTP API。
- DeepSeek 通过 OpenAI-compatible Chat Completions 格式调用。
- 高德 POI 工具预留真实 API 调用能力。
- offer-provider、transport-service、weather-service 的真实连接配置已预留环境变量，但当前工具实现仍默认走 mock。

当前没有实现：

- MCP 协议。
- Python 直连 MongoDB。
- Python 直连 user-service、reservation-service 或 offer-provider 的真实业务数据库。
- Python 直接处理前端 WebSocket。

当前连接边界是：Java 后续负责鉴权、业务状态、MongoDB 快照、WebSocket 推送；Python 只负责 Agent 计算、工具调用和返回结构化结果。

### 3.3 构建层：Prompt / SDK / 编排逻辑

已完成轻量 Agent 构建层：

- Prompt 片段位于 `app/prompts/`。
- `DeepSeekClient` 负责组装 system prompt、工具证据和用户上下文。
- 模型被约束为只返回规划 JSON payload。
- 输出契约要求包含可落库和可展示的规划结构，而不是纯自然语言。
- `PlannerAgent` 内实现确定性轻量 ReAct 流程。

当前 ReAct 流程为：

```text
校验必填槽位
-> 初始化 trace 与运行上下文
-> 选择有限工具收集旅行证据
-> 汇总 places / weather / transport / budget / route observations
-> 调用 DeepSeek 生成结构化规划
-> 如果模型失败或返回不可用，调用 fallback_plan_builder
-> 返回 AgentRunResponse
```

MVP 阶段的 ReAct 不是完全开放式自主推理，而是有明确上限的确定性工具选择流程。这样更适合当前业务阶段，便于测试、调试和后续接入 Java。

### 3.4 运行管控层：Runtime / Trace / Policy

已完成轻量 Harness 管控能力：

- `RuntimePolicy`：限制每轮工具调用数、模型调用数、ReAct 步数、总运行时间、工具超时时间。
- `ToolResult`：统一工具返回格式，包含 `status`、`data`、`warnings`、`errorCode`、`errorMessage`、`latencyMs`、`retryCount`。
- `ToolRegistry`：统一注册工具、执行工具、记录工具耗时、处理异常和调用上限。
- `TraceRecorder`：按 `traceId` 输出结构化 JSON 日志。
- Hooks：在 Agent 开始/结束、工具开始/结束、模型开始/结束时生成 trace 和用户可读事件。
- `userFacingEvents`：返回给调用方的白话状态，可由 Java 后续转成 WebSocket 状态消息。

当前 trace 只输出到控制台 JSON log，不落数据库。这符合一期设计：先保证排障能力，后续如果需要前端回放或分析面板，再由 Java 或日志消费链路异步入库。

## 4. 当前 API 契约

### 4.1 `GET /agent/health`

用于确认 Python Agent 服务是否存活，以及 DeepSeek / Amap 是否已配置。

返回核心字段：

- `status`
- `service`
- `version`
- `modelProvider`
- `model`
- `deepseekConfigured`
- `amapConfigured`

### 4.2 `POST /agent/planner/run`

用于执行一次旅行规划 Agent。

请求核心字段：

- `conversationId`
- `userId`
- `coreSlots`
- `userMessage`
- `selectedPlaceIds`
- `latestSnapshot`
- `history`
- `userContext`

响应核心字段：

- `traceId`
- `status`
- `assistantText`
- `title`
- `summary`
- `markdown`
- `nextQuestion`
- `places`
- `routes`
- `toolCalls`
- `warnings`
- `userFacingEvents`

该接口目前适合本地验证 Agent 能力。后续 Java 接入时，不建议前端直接调用 Python Agent；前端仍应通过 Java 网关或 `ai-arrange-service` 进入业务闭环。

## 5. 配置项

当前主要环境变量如下：

| 配置项 | 用途 | 默认值/说明 |
| --- | --- | --- |
| `DEEPSEEK_API_KEY` | DeepSeek API key | 为空时走 fallback |
| `DEEPSEEK_BASE_URL` | DeepSeek base URL | `https://api.deepseek.com` |
| `DEEPSEEK_CHAT_COMPLETIONS_PATH` | Chat Completions path | `/chat/completions` |
| `DEEPSEEK_MODEL` | 模型名 | `deepseek-v4-pro` |
| `DEEPSEEK_TEMPERATURE` | 生成温度 | `0.6` |
| `DEEPSEEK_TIMEOUT_SECONDS` | DeepSeek HTTP 客户端请求超时 | `90` |
| `DEEPSEEK_RETRY_COUNT` | 模型重试次数 | `2` |
| `DEEPSEEK_MAX_TOKENS` | 模型最大输出 token 数；单日结构化 JSON 默认提高以避免内容被截断 | `6000` |
| `AMAP_API_KEY` | 高德 API key | 为空时高德工具跳过或降级 |
| `AMAP_ENABLED` | 是否启用高德 | `true` |
| `AGENT_TOOL_MOCK_ENABLED` | 是否启用 mock 工具 | `true` |
| `AGENT_MAX_TOOL_CALLS_PER_TURN` | 单轮最大工具调用数 | `5` |
| `AGENT_MAX_MODEL_CALLS_PER_TURN` | 单轮最大模型调用数 | `1` |
| `AGENT_MAX_REACT_STEPS` | ReAct 最大步数 | `3` |
| `AGENT_MAX_REACT_TOOL_CALLS` | ReAct 证据工具最大调用数 | `4` |
| `AGENT_MAX_RUNTIME_SECONDS` | Agent 单轮最大运行时间 | `120` |
| `AGENT_MODEL_TIMEOUT_SECONDS` | Harness 模型工具调用超时；默认跟随 `DEEPSEEK_TIMEOUT_SECONDS` | `90` |
| `AGENT_TOOL_TIMEOUT_SECONDS` | 工具默认超时 | `10` |
| `AGENT_TRACE_ENABLED` | 是否输出 trace JSON log | `true` |

## 6. 验证情况

当前已覆盖的验证内容：

- FastAPI health 与 planner run 基础返回。
- 缺少必填槽位时返回补全提示。
- Harness policy 默认值与环境变量覆盖。
- ToolRegistry 注册、查询、执行、异常处理和调用上限。
- TraceRecorder 结构化事件记录。
- Phase 2 旅行工具返回结构。
- Phase 3 ReAct 工具选择、证据收集、模型调用和 fallback 行为。
- DeepSeek API 已在本地直连验证跑通。

推荐回归命令：

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\ai-arrange-agent-service
.\.venv\Scripts\python -m pytest
```

推荐本地运行：

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\ai-arrange-agent-service
.\.venv\Scripts\python -m uvicorn app.main:app --reload --port 8090
```

## 7. 当前明确未做事项

MVP 阶段没有实现以下内容：

- 不接入 Java `ai-arrange-service`。
- 不进行前端 WebSocket 联调。
- 不把 Python Agent 结果写入 MongoDB。
- 不在 Python 侧读取用户画像、订单、历史行程等业务库。
- 不展示或存储模型 CoT。
- 不实现多 Agent 协作框架。
- 不引入 LangGraph、AutoGen 或 MCP。
- 不实现真实 offer-provider 库存查询。
- 不实现 RabbitMQ 预订联动。
- 不实现旅游中 AI 伴游能力。

其中 CoT 的处理原则是：不落盘、不返回、不展示。当前只记录工具调用轨迹、状态、耗时、warning 和白话执行事件。

## 8. 已知风险和技术债

当前 MVP 可以用于验证 Agent 主流程，但还有以下风险和技术债：

- 大部分旅行业务工具仍是 mock-first，不能代表真实库存、真实价格、真实天气和真实交通。
- ReAct 工具选择目前是确定性规则，不是模型自主规划工具调用；优点是可控，缺点是灵活度有限。
- `userFacingEvents` 的部分中文文案在当前源码中存在编码异常，需要统一修复为 UTF-8，否则后续前端展示会出现乱码。
- DeepSeek 返回 JSON 的稳定性仍依赖 prompt 约束，后续需要加强 schema 校验、修复提示和失败恢复。
- 高德工具只完成 POI 能力入口，路线、图片质量、地点去重和城市歧义处理仍需增强。
- trace 当前只打控制台 JSON log，尚未接入日志平台、trace 查询或回放能力。
- 没有真实用户鉴权上下文，当前 `userId` 只作为请求字段透传。
- 缺少压测和并发运行验证。

## 9. 下一轮迭代建议

建议第二轮仍先聚焦 Agent 模块，不急于全量 Java 和前端联调，优先把 Agent 能力做扎实：

1. 修复中文编码问题，确保 `userFacingEvents` 可直接给前端展示。
2. 增强 DeepSeek 输出解析，加入 JSON schema 校验、自动修复和更明确的错误分类。
3. 将 ReAct 工具选择从固定规则升级为“模型建议 + Policy 裁剪”的半动态模式。
4. 完善高德能力，优先做真实 POI 查询、地点去重、经纬度补全和图片字段补全。
5. 定义 Java 调用 Python Agent 的稳定 DTO，冻结 `AgentRunRequest` 与 `AgentRunResponse` 的字段语义。
6. 为真实 offer-provider 接入设计 adapter，但仍保持 Python 不直连数据库。
7. 增加端到端 smoke test：mock tools + fake DeepSeek response + fallback path 三条链路。
8. 梳理 traceId 与 Java conversationId / snapshot version 的关联策略，为后续落库做准备。

下一阶段完成后，再进入 Java 集成会更稳：Java 负责会话、鉴权、MongoDB 快照和 WebSocket；Python Agent 专注规划、工具编排和结果生成。
