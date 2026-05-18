# AI Arrange Agent 交互式规划与 Harness 迭代方案

## 1. 当前基线

当前 `ai-arrange-agent-service` 已完成 MVP：

- FastAPI 内部服务：`GET /agent/health`、`POST /agent/planner/run`。
- DeepSeek OpenAI-compatible API 接入。
- 轻量 Harness：`RuntimePolicy`、`ToolRegistry`、`ToolResult`、`TraceRecorder`、Hooks、`userFacingEvents`。
- mock-first 旅行工具：酒店、天气、交通、预算、内部酒店匹配、路线估算、高德 POI 入口。
- 轻量 ReAct：确定性工具选择、证据收集、DeepSeek 生成、fallback 兜底。
- DTO 中已经预留 `latestSnapshot` 和 `selectedPlaceIds`，但还没有形成完整的交互式规划协议。

下一轮目标不是直接做 Java 或前端联调，而是在 Agent 模块内先把“用户选择驱动的可回溯规划”做成稳定契约。

## 2. 交互式规划目标

业务目标：

- AI 每轮规划结束后，不只返回 Markdown，还要返回一组可交互推荐选项。
- 用户可以选择、拒绝或补充说明这些选项。
- Agent 在下一轮根据上一版规划快照和用户选择重新规划。
- 每次规划都能形成可回溯版本。
- 本阶段 Python Agent 不负责持久化，版本落库、鉴权、WebSocket 推送仍由 Java 后续完成。

推荐的交互循环：

```text
用户进入规划页并提交固定槽位
-> Java 调用 Python Agent，latestSnapshot 为空
-> Agent 生成初版 markdown + places + routes + recommendationGroups + snapshotDraft
-> Java 保存 snapshot version 1，前端展示选项
-> 用户选择想去的点位/酒店/路线偏好
-> Java 把 latestSnapshot version 1 + 用户选择传给 Agent
-> Agent 生成新版规划和下一组选项
-> Java 保存 snapshot version 2
-> 重复，直到用户确认方案
```

## 3. Agent 内需要新增的核心契约

### 3.1 请求侧新增交互输入

建议在 `AgentRunRequest` 中新增：

```python
class PlannerInteractionInput(BaseModel):
    selectedOptionIds: list[str] = Field(default_factory=list)
    rejectedOptionIds: list[str] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    freeText: str | None = None
    confirmCurrentPlan: bool = False
```

并新增规划模式：

```python
class PlanningMode(str, Enum):
    INITIAL_PLAN = "INITIAL_PLAN"
    REFINE_WITH_SELECTION = "REFINE_WITH_SELECTION"
    ASK_MORE_OPTIONS = "ASK_MORE_OPTIONS"
    FINALIZE_PLAN = "FINALIZE_PLAN"
```

请求示例：

```json
{
  "conversationId": "00000000-0000-0000-0000-000000000010",
  "userId": "00000000-0000-0000-0000-000000000001",
  "planningMode": "REFINE_WITH_SELECTION",
  "coreSlots": {
    "city": "Shanghai",
    "travelStartDate": "2026-06-01",
    "travelEndDate": "2026-06-03",
    "peopleCount": 2
  },
  "latestSnapshot": {
    "version": 1,
    "markdown": "# Shanghai 3-day plan",
    "places": [],
    "routes": []
  },
  "interaction": {
    "selectedOptionIds": ["place:yuyuan", "style:relaxed"],
    "rejectedOptionIds": ["place:night-market"],
    "freeText": "希望路线轻松一点，少走路。"
  }
}
```

### 3.2 响应侧新增推荐选项

建议在 `AgentRunResponse` 中新增：

```python
class PlannerOptionType(str, Enum):
    PLACE = "PLACE"
    HOTEL = "HOTEL"
    ROUTE = "ROUTE"
    FOOD = "FOOD"
    TRANSPORT = "TRANSPORT"
    BUDGET = "BUDGET"
    STYLE = "STYLE"
    FINALIZE = "FINALIZE"


class PlannerOption(BaseModel):
    optionId: str
    type: PlannerOptionType
    label: str
    description: str | None = None
    placeId: UUID | None = None
    value: dict[str, Any] = Field(default_factory=dict)
    selected: bool = False
    disabled: bool = False
    confidence: float | None = None
    impact: str | None = None


class PlannerOptionGroup(BaseModel):
    groupId: str
    title: str
    mode: str = "MULTI_SELECT"
    minSelect: int = 0
    maxSelect: int | None = None
    options: list[PlannerOption] = Field(default_factory=list)
```

响应示例：

```json
{
  "status": "SUCCESS",
  "assistantText": "我先给你做了一版轻松型上海三日游。",
  "markdown": "# Shanghai 3-day plan...",
  "places": [],
  "recommendationGroups": [
    {
      "groupId": "must_visit_places",
      "title": "你想加入哪些地点？",
      "mode": "MULTI_SELECT",
      "maxSelect": 4,
      "options": [
        {
          "optionId": "place:yuyuan",
          "type": "PLACE",
          "label": "豫园",
          "description": "适合半日轻松游览，可和外滩串联。",
          "placeId": "00000000-0000-0000-0000-000000000101",
          "impact": "加入后 Day 1 会更偏城市文化路线。"
        }
      ]
    }
  ],
  "nextAction": "ASK_USER_SELECTION"
}
```

### 3.3 响应侧新增快照草稿

Python Agent 不直接保存版本，但应返回“可保存的快照草稿”和“基于哪个版本生成”。

建议新增：

```python
class PlannerSnapshotDraft(BaseModel):
    baseVersion: int | None = None
    proposedVersion: int | None = None
    markdown: str
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    changeSummary: str | None = None
    patchOps: list[dict[str, Any]] = Field(default_factory=list)
    checksum: str | None = None
```

设计原则：

- `baseVersion` 来自请求里的 `latestSnapshot.version`。
- `proposedVersion` 可以在 Agent 本地按 `baseVersion + 1` 生成，但只作为建议值。
- Java 后续落库时拥有最终版本号和并发冲突判断权。
- `checksum` 用于后续幂等校验，避免同一轮响应被重复保存。
- `patchOps` 用于解释本轮相对上一版做了什么，便于审计和回溯。

## 4. Agent 模块内的规划流程改造

推荐把当前 `PlannerAgent.run()` 拆成更清晰的阶段：

```text
1. validate_slots
2. load_turn_state
3. apply_user_interaction
4. collect_evidence
5. generate_or_repair_plan
6. build_recommendation_groups
7. build_snapshot_draft
8. return_response
```

其中：

- `load_turn_state`：读取 `latestSnapshot`、`history`、`interaction`，形成本轮 `PlannerTurnState`。
- `apply_user_interaction`：把用户选择转成约束，例如“必须包含这些 placeId”“拒绝这些 placeId”“路线强度调低”。
- `collect_evidence`：继续复用现有工具，但根据用户选择减少不必要工具调用。
- `generate_or_repair_plan`：调用 DeepSeek；失败时 fallback。
- `build_recommendation_groups`：根据 places、routes、budget、用户选择生成下一组选项。
- `build_snapshot_draft`：生成可保存的版本草稿。

这一步不需要 Java，也不需要真实 MongoDB。测试可以通过传入 `latestSnapshot` 和 `interaction` 来模拟版本链。

## 5. Harness Engineering 迭代建议

### 5.1 能力层：Skills / Tools

当前工具能跑通，但还不够现代化。建议下一轮做三件事：

- 给每个工具补齐 Pydantic 输入/输出 schema，不再只用字符串描述 `input_schema` / `output_schema`。
- 把 mock 和 real adapter 分离，例如 `HotelTool` 只定义能力，`MockHotelProvider`、`OfferProviderAdapter` 分别实现数据来源。
- 新增 `build_recommendation_options` 作为明确工具或服务能力，专门把规划结果转成前端可选项。

短期不建议把所有工具迁移到 LangChain Tool。当前自研 `ToolRegistry` 已经能承载 policy、trace、userFacingEvents，先补 schema 和 adapter 更稳。

### 5.2 连接层：API / MCP / 外部服务

当前连接层以 HTTP API 为主，适合 MVP。下一轮建议：

- 保持 Python Agent 的 HTTP 内部接口，不让前端直接调用。
- 继续保持 Python 不直连 MongoDB，不直连业务库。
- 对外部 API 增加 adapter 层和 mock/real 开关。
- MCP 暂不作为近期目标；等工具来源变多、需要跨团队标准化工具接入时再评估。

高德、DeepSeek 仍属于 Python 可以直接调用的外部 API；用户状态、订单、库存、历史行程仍应由 Java 提供上下文。

### 5.3 构建层：Prompt / SDK / 编排

当前 ReAct 是确定性流程，优点是可控，缺点是交互式状态会越来越难维护。建议分两步升级：

第一步：继续用自研编排，但引入明确的 `PlannerTurnState`。

第二步：在交互协议稳定后，做 LangGraph POC，把流程拆成节点：

```text
validate_slots
-> apply_user_interaction
-> retrieve_context
-> collect_travel_evidence
-> generate_plan
-> validate_output
-> build_options
-> build_snapshot_draft
```

LangGraph 适合这里的原因是它面向长运行、有状态 Agent 编排，官方文档也把 durable execution、streaming、human-in-the-loop 作为核心能力。它的 interrupt 能在图执行中暂停并等待外部输入，persistence/checkpointer 能保存并恢复图状态。

但本项目有一个重要边界：Python 暂时不落库。因此 LangGraph 不能一上来就依赖 Python 本地数据库作为生产持久层。推荐策略：

- 近期：自研 DTO + stateless Agent，Java 传入 `latestSnapshot` 恢复状态。
- 中期：LangGraph 作为编排 runtime，但 checkpointer 先用内存或测试实现，只做 POC。
- 后期：如果确实需要 LangGraph 级别的 durable execution，再设计 Java 管理的 checkpoint service 或独立基础设施，而不是让 Python 直接写业务 MongoDB。

### 5.4 运行管控层：状态、Trace、监控、评估

下一轮需要把 Harness 从“能记录”升级到“能排错、能评估、能防失控”：

- Trace 事件标准化：固定 `eventType`、`phase`、`tool`、`latencyMs`、`status`、`errorCode`、`snapshotVersion`。
- 增加敏感信息脱敏：API key、用户手机号、证件信息、订单号不能出现在 trace。
- 增加 planner output validator：模型输出不符合 schema 时进入 repair 或 fallback。
- 增加 idempotency：同一个 `traceId` / request hash 不应产生不可解释的重复快照。
- 增加 evaluation fixtures：固定几组城市、日期、偏好，回归检查 Markdown、places、options、snapshotDraft。
- 保持不记录 CoT，只记录工具轨迹、状态、输入摘要、输出摘要和错误。

## 6. RAG / LangGraph / LangChain 是否建议使用

### 6.1 RAG：建议使用，但不要用错地方

RAG 适合补充“相对稳定的旅行知识”，例如：

- 城市旅行攻略。
- 景点背景和游玩时长建议。
- 季节性提醒。
- 亲子、老人、情侣、轻松游等路线策略。
- 平台内部的规划规范和运营策略文档。

RAG 不适合替代：

- 实时库存。
- 实时价格。
- 实时天气。
- 用户订单。
- 用户隐私画像。

因此推荐新增一个 `knowledge_retrieval` 工具：

- MVP 先用本地 `knowledge/` Markdown 或 JSON 文件。
- 后续可以接向量库或 Java 提供的检索服务。
- Python 不直接读业务数据库。
- 检索结果必须带 source、title、version，方便 trace 和评估。

RAG 进入 Agent 的方式建议是“工具化”而不是直接塞进模型 prompt。也就是由 Agent 在需要时调用 `knowledge_retrieval`，再把结果作为证据传给 DeepSeek。

### 6.2 LangGraph：建议中期引入

LangGraph 很适合本项目的交互式规划：

- 人在回路：每轮结束等待用户选择。
- 有状态流程：基于上一版 snapshot 继续规划。
- 可恢复：未来可以从 checkpoint 恢复长流程。
- 可观察：节点级事件更清晰。

但不建议马上重写当前 Agent。先稳定 DTO 和交互协议，再用 LangGraph 做 POC。原因是当前最大不确定性不是框架，而是业务状态契约：推荐选项怎么表达、快照怎么回溯、用户选择怎么影响下一轮。

### 6.3 LangChain：建议谨慎、局部使用

LangChain 的优势是模型、工具、检索、agent 抽象丰富，并且官方说明 LangChain agents 构建在 LangGraph 之上。对本项目来说：

- 可以考虑用 `langchain-core` 或相关组件做 tool schema、prompt template、output parser。
- 不建议一开始直接使用高层 `create_agent` 替代自研 `PlannerAgent`，因为当前需要严格控制 tool policy、trace、fallback、用户状态和 Java 边界。
- 如果后续接入更多模型和检索组件，再逐步引入 LangChain 组件会更自然。

结论：

```text
短期：继续自研 Harness，补交互协议、快照草稿、schema 校验。
中期：LangGraph POC，用图节点承载当前 PlannerAgent 阶段。
长期：RAG 工具化，必要时局部使用 LangChain 组件，不把业务控制权完全交给高层 Agent。
```

## 7. 下一轮任务拆分

### 阶段 A：交互 DTO 与快照草稿

目标：Agent 能表达“下一步请用户选什么”，并能返回可保存的规划版本草稿。

任务：

- 新增 `PlanningMode`。
- 新增 `PlannerInteractionInput`。
- 新增 `PlannerOptionType`、`PlannerOption`、`PlannerOptionGroup`。
- 新增 `PlannerNextAction`，例如 `ASK_USER_SELECTION`、`NEED_MORE_INFO`、`PLAN_UPDATED`、`COMPLETE`。
- 新增 `PlannerSnapshotDraft`。
- 扩展 `AgentRunRequest` 和 `AgentRunResponse`。
- 保持向后兼容：老请求不传新字段仍能跑通。
- 增加 API tests 覆盖新字段。

验收标准：

- 初次规划返回至少一个 `recommendationGroups`。
- 有 `latestSnapshot` 和 `interaction` 时返回新的 `snapshotDraft`。
- 缺少必填槽位时仍返回 `NEED_MORE_INFO`。

### 阶段 B：选择驱动的再规划

目标：Agent 能根据用户选择调整规划。

任务：

- 新增 `PlannerTurnState`。
- 实现 `apply_user_interaction`。
- 将 `selectedOptionIds`、`rejectedOptionIds`、`selectedPlaceIds`、`freeText` 转成规划约束。
- fallback builder 支持基于上一版 snapshot 修改 Markdown。
- DeepSeek prompt 增加“必须尊重用户选择和拒绝项”的规则。
- 输出 `changeSummary` 和 `patchOps`。

验收标准：

- 用户选中的地点在新版 places 中标记为 `selected=true`。
- 用户拒绝的地点不再作为主推荐。
- Markdown 中能体现本轮调整。
- snapshotDraft 的 `baseVersion` 与请求一致。

### 阶段 C：Harness 现代化

目标：让工具、trace、输出校验更可控。

任务：

- ToolSpec 支持真实 Pydantic schema。
- ToolResult 增加 `inputSummary`、`outputSummary`。
- Trace 增加 `phase`、`snapshotVersion`、`requestHash`。
- 增加敏感信息脱敏。
- 增加 output validator 和 repair flow。
- 修复当前源码中的中文文案编码问题。

验收标准：

- trace 不包含 API key 和敏感字段。
- 模型返回非法 JSON 时能自动 repair 或 fallback。
- `userFacingEvents` 中文可直接展示。

### 阶段 D：LangGraph POC

目标：验证 LangGraph 是否适合替代当前自研 ReAct 编排。

任务：

- 新建实验目录，例如 `app/graphs/`。
- 定义 `PlannerGraphState`。
- 将现有流程映射为 graph nodes。
- 使用 feature flag 控制是否启用 LangGraph。
- POC 中先不接生产持久层。
- 对比自研流程和 LangGraph 流程的测试复杂度、trace 清晰度、可维护性。

验收标准：

- 同一请求在自研 Planner 与 LangGraph POC 下输出结构兼容。
- 支持在“等待用户选择”节点暂停或返回待交互状态。
- 不破坏现有 API。

### 阶段 E：RAG 工具化

目标：让 Agent 获取稳定旅行知识，而不是完全依赖模型常识。

任务：

- 新增 `knowledge/` 测试知识库。
- 新增 `knowledge_retrieval` 工具。
- 检索结果包含 source、title、version、content。
- Prompt 中要求模型引用检索证据生成规划建议。
- 增加 RAG regression tests。

验收标准：

- 当用户提出“亲子轻松游”“雨天备选”“博物馆路线”等需求时，Agent 会调用知识检索工具。
- 检索失败不影响基础规划。
- RAG 结果进入 trace，但不暴露底层检索 JSON 给前端。

## 8. 超出 Agent 模块的事项记录

以下事项本阶段不做，只记录给后续 Java / 前端阶段：

- Java 负责用户登录态和鉴权。
- Java 负责 MongoDB 保存 `PlannerSnapshot` 版本链。
- Java 负责分配最终 snapshot version 和处理并发冲突。
- Java 负责把 `userFacingEvents` 转成 WebSocket 消息。
- Java 负责将前端选项选择转成 Agent 的 `PlannerInteractionInput`。
- 前端负责地图点位展示、多选/拒绝/确认交互。
- 前端负责展示快照历史、版本回退和差异对比。
- offer-provider 实时库存查询、RabbitMQ 预订联动、AI 伴游不进入本轮。

## 9. 推荐优先级

最推荐的下一步顺序：

1. 先做阶段 A：交互 DTO 与快照草稿。
2. 再做阶段 B：选择驱动的再规划。
3. 同时修复中文编码问题。
4. 然后做阶段 C：Harness 现代化。
5. 最后用阶段 D 做 LangGraph POC，不急于替换现有 PlannerAgent。
6. RAG 可以在阶段 E 进入，作为工具层扩展，而不是先重构整个 Agent。

这样可以保证每一步都能独立验证，也不会因为过早引入框架而模糊业务契约。

## 10. 参考资料

- LangGraph Overview: https://docs.langchain.com/langgraph
- LangGraph Human-in-the-loop Interrupts: https://docs.langchain.com/oss/python/langgraph/human-in-the-loop
- LangGraph Durable Execution: https://docs.langchain.com/oss/python/langgraph/durable-execution
- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangChain Overview: https://docs.langchain.com/oss/python/langchain/overview
- LangChain Retrieval / RAG: https://docs.langchain.com/oss/python/langchain/retrieval
- LangChain RAG Agent Tutorial: https://docs.langchain.com/oss/python/langchain/rag
