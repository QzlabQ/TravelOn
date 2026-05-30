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

后续需要和后端、前端对齐的事项：

- Java `ai-arrange-service` 需要接收并透传 `planningMode`、`interaction`、`latestSnapshot`，不能让前端直接调用 Python Agent。
- Java 需要把 `snapshotDraft` 保存为 MongoDB 中的正式 `PlannerSnapshot`，并负责最终 `version` 分配、并发冲突处理、幂等校验和回滚查询。
- Java 需要定义 `snapshotDraft.checksum` 的使用规则，例如防止同一轮 Agent 响应被重复保存。
- Java 需要把 `recommendationGroups` 映射为前端可交互组件，并把用户选择重新组装为 `PlannerInteractionInput`。
- Java 需要把 `nextAction` 映射为业务状态：`NEED_MORE_INFO`、`ASK_USER_SELECTION`、`PLAN_UPDATED`、`COMPLETE`。
- WebSocket 协议需要增加或复用消息类型，用于推送 `recommendationGroups`、`snapshotDraft` 保存状态和 `userFacingEvents`。
- 前端需要确认选项展示规则：单选/多选、最多选择数、拒绝选项、确认当前方案、地图点位联动。
- 前端需要确认版本体验：查看历史版本、回退到旧版本、比较两个版本差异。
- 本阶段 Python Agent 只返回快照草稿和交互契约，不负责 MongoDB 落库、登录鉴权、WebSocket 推送和前端状态管理。

验收标准：

- 初次规划返回至少一个 `recommendationGroups`。
- 有 `latestSnapshot` 和 `interaction` 时返回新的 `snapshotDraft`。
- 缺少必填槽位时仍返回 `NEED_MORE_INFO`。
- 阶段 A 文档中已明确记录 Java、MongoDB、WebSocket、前端后续对齐事项，防止把 Agent 草稿误认为完整业务闭环。

### 阶段 B：选择驱动的再规划

目标：Agent 能根据用户选择调整规划。

任务：

- 新增 `PlannerTurnState`。
- 实现 `apply_user_interaction`。
- 将 `selectedOptionIds`、`rejectedOptionIds`、`selectedPlaceIds`、`freeText` 转成规划约束。
- fallback builder 支持基于上一版 snapshot 修改 Markdown。
- DeepSeek prompt 增加“必须尊重用户选择和拒绝项”的规则。
- 输出 `changeSummary` 和 `patchOps`。

阶段 B 还需要明确和后端、前端同步的信息，以及 Harness 接口边界：

- Python Agent 只通过内部 HTTP Harness 接口收发数据，不直接和前端、MongoDB、WebSocket 或 Java 业务库同步状态。
- Java `ai-arrange-service` 负责把前端交互整理成 `AgentRunRequest`，并把 Python 返回结果转换为正式业务状态。
- 前端只认识推荐项、地图点位和交互动作，不直接认识 Python 内部的 planner state。

请求侧需要同步给 Python Agent 的内容：

- `conversationId`、`userId`、`planningMode`、`coreSlots`
- `latestSnapshot`，至少包含 `version`、`markdown`、`places`、`routes`
- `interaction`，至少包含 `selectedOptionIds`、`rejectedOptionIds`、`selectedPlaceIds`、`rejectedPlaceIds`、`freeText`、`confirmCurrentPlan`
- `history`、`userContext`，用于补充上下文

响应侧需要同步回 Java / 前端 的内容：

- `nextAction`，用于驱动前端当前处于“继续选”“补充信息”“确认完成”哪一种状态
- `recommendationGroups`，用于前端渲染可交互选项
- `places`、`routes`，用于地图展示和路线联动
- `snapshotDraft`，用于 Java 落库、版本号推进和回溯
- `warnings`、`userFacingEvents`、`traceId`，用于前端提示和排障

版本与回溯边界：

- `snapshotDraft.proposedVersion` 只是 Agent 建议值，不是最终版本号。
- Java 必须是最终版本号和并发冲突的裁决者。
- `snapshotDraft.checksum` 用于幂等保存和重复提交判断。
- 前端不要直接把推荐选项理解成最终保存版本，必须先经过 Java 确认。

前端交互约定：

- 多选/单选/确认按钮由 `PlannerOptionGroup.mode`、`minSelect`、`maxSelect` 驱动。
- 前端选中的地点、拒绝的地点、风格偏好和自由文本，都要回传到 `interaction`。
- 地图上的点击结果优先映射为内部 `placeId`，如果只有 `amapPoiId`，由 Java 负责做一次映射再发给 Agent。
- `selected=true` 表示前端当前应高亮的推荐项，不代表最终已保存。

验收标准：

- 用户选中的地点在新版 places 中标记为 `selected=true`。
- 用户拒绝的地点不再作为主推荐。
- Markdown 中能体现本轮调整。
- snapshotDraft 的 `baseVersion` 与请求一致。
- Java / 前端 / Python 的职责边界在计划中已写明，不再依赖口头同步。

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

截至阶段 C 回归后，阶段 A/B/C 的核心能力已经进入可用基线。新的优先级需要从“一次性生成完整多日计划”调整为“按天生成、按天交互、最终汇总”：

1. 先做阶段 C+1：单天规划协议。给请求和快照增加 `planningScope`、`targetDayIndex`、`dayPlans` 等日维度字段。
2. 再做阶段 C+2：单天生成与单天交互。当前 `PlannerAgent` 每轮只生成或修订一天计划，返回当天 Markdown、地图点位、推荐选项和快照草稿。
3. 再做阶段 C+3：日计划版本链与回滚验证。通过传入不同 `latestSnapshot` 模拟查看旧版、切换版本、基于旧版重新规划。
4. 再做阶段 C+4：最终汇总。所有天确认后，由 Agent 基于已确认 day plans 生成完整旅行 Markdown。
5. 然后再评估原阶段 D：LangGraph / 多 Agent POC。只有在单天协议稳定后，才把 `DayPlannerAgent`、`TripCoordinatorAgent`、`FinalAssemblerAgent` 拆成图节点。
6. RAG 仍保留为原阶段 E，作为工具层增强进入。它应服务于单天规划，而不是先重构整个 Agent。

这样可以同时解决 token 长度、交互粒度和版本回溯三个问题，也不会因为过早引入多 Agent 框架而模糊业务契约。

## 10. 参考资料

- LangGraph Overview: https://docs.langchain.com/langgraph
- LangGraph Human-in-the-loop Interrupts: https://docs.langchain.com/oss/python/langgraph/human-in-the-loop
- LangGraph Durable Execution: https://docs.langchain.com/oss/python/langgraph/durable-execution
- LangGraph Persistence: https://docs.langchain.com/oss/python/langgraph/persistence
- LangChain Overview: https://docs.langchain.com/oss/python/langchain/overview
- LangChain Retrieval / RAG: https://docs.langchain.com/oss/python/langchain/retrieval
- LangChain RAG Agent Tutorial: https://docs.langchain.com/oss/python/langchain/rag

## 11. 阶段 C 实测结论与改进计划

### 11.1 实测结论

- DeepSeek 原始 Chat Completions 接口已验证可在约 3 秒内正常返回，说明 API key、网络和模型服务本身可用。
- Agent 模块当前的慢请求来自编排层，而不是 DeepSeek 原始接口。
- 当前编排里，DeepSeek 调用与 fallback 共用同一轮运行时预算，模型调用耗尽预算后，fallback 可能被 runtime limit 截断。
- 当前返回已经能产出 `traceId`、`snapshotDraft`、`recommendationGroups` 和 `nextAction`，说明交互协议已打通，但 DeepSeek 主路径还需要进一步收敛。

### 11.2 改进计划

1. 给 DeepSeek 输出增加明确上限，避免无界生成导致长尾等待。
2. 对 DeepSeek 启用 JSON Output，降低非法 JSON 和超长回复概率。
3. 给 fallback 预留独立执行预算，避免模型超时后连兜底都被 runtime limit 挡住。
4. 后续如需前端逐字展示，再单独评估流式传输，不作为本轮超时的第一修复项。

## 12. 阶段 C 回归复盘

### 12.1 之前失败的原因

- DeepSeek 原始接口本身是正常的，问题不在 API key。
- Agent 侧把一个完整规划请求交给了同一轮同步编排，DeepSeek 请求没有明确的输出上限，容易拉长生成时间。
- DeepSeek 调用耗尽了整轮 runtime budget，导致 fallback 也被 `runtime limit` 截断，最后返回的是占位式 fallback。

### 12.2 本次改动

- 给 DeepSeek 请求增加了 `DEEPSEEK_MAX_TOKENS` 上限。
- 给 DeepSeek 请求加了 `response_format={"type":"json_object"}`，让输出更稳定地回到 JSON。
- 给 fallback 增加了 runtime 绕行，避免主流程超时后连兜底都失效。
- 补充了对应测试，验证 JSON 输出约束和 fallback 绕行都生效。

### 12.3 当前结果

- 初始规划可正常返回。
- 交互式回传也可正常返回。
- 当前交互协议已达成，后续主要是继续压缩 prompt 和证据体积，进一步降低长尾时延。

## 13. 阶段 C 后迭代重排：按天规划与最终汇总

### 13.1 背景与结论

阶段 C 通过 `DEEPSEEK_MAX_TOKENS` 和 JSON 输出约束解决了超时与非法输出问题，但也暴露出新的产品问题：如果一次性要求模型生成完整多日计划，输出上限会压缩每日细节，导致每天的安排偏短。

新的基线调整如下：

- Agent 每轮优先只输出一天的出行安排。
- 每天结束后抛出推荐选项，让用户选择、拒绝、补充偏好或确认当天。
- 已确认的日计划进入快照草稿，下一天规划时作为约束上下文，避免重复景点和路线冲突。
- 所有日计划确认后，再生成最终完整 Markdown。
- 本阶段仍只做 Python Agent 模块，不做 Java 落库、WebSocket 和前端联调。

短期不建议马上拆成真正的多 Agent。更稳妥的做法是在现有 `PlannerAgent` 中先加入日维度协议和状态，复用已有 tool、trace、policy、fallback、validator。等单天协议稳定后，再用 LangGraph 做多 Agent / 图编排 POC。

### 13.2 用户交互流程

推荐的新流程：

```text
用户提交固定槽位：城市、日期、人数
-> Java 调用 Python Agent，planningScope=DAY_PLAN，targetDayIndex=1
-> Agent 生成 Day 1 markdown + places + routes + recommendationGroups + snapshotDraft
-> 用户选择 Day 1 推荐点位/餐厅/风格，或要求重写 Day 1
-> Java 把 latestSnapshot + interaction 回传给 Agent，planningScope=DAY_REFINE，targetDayIndex=1
-> Agent 返回 Day 1 新版本
-> 用户确认 Day 1
-> Java 调用 Agent 生成 Day 2，latestSnapshot 中带已确认 Day 1
-> 重复直到所有天确认
-> Java 调用 Agent，planningScope=TRIP_ASSEMBLE
-> Agent 汇总所有已确认 day plans，生成最终完整 Markdown
```

### 13.3 请求与快照协议调整

建议新增规划作用域：

```python
class PlanningScope(str, Enum):
    DAY_PLAN = "DAY_PLAN"
    DAY_REFINE = "DAY_REFINE"
    TRIP_ASSEMBLE = "TRIP_ASSEMBLE"
```

建议扩展请求：

```python
class AgentRunRequest(BaseModel):
    planningScope: PlanningScope = PlanningScope.DAY_PLAN
    targetDayIndex: int | None = None
    targetDate: date | None = None
```

建议新增日计划结构：

```python
class PlannerDayPlanStatus(str, Enum):
    DRAFT = "DRAFT"
    CONFIRMED = "CONFIRMED"
    NEEDS_REVISION = "NEEDS_REVISION"


class PlannerDayPlanRef(BaseModel):
    dayIndex: int
    date: date | None = None
    status: PlannerDayPlanStatus = PlannerDayPlanStatus.DRAFT
    title: str | None = None
    markdown: str = ""
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    changeSummary: str | None = None
    checksum: str | None = None
```

建议扩展 `PlannerSnapshotRef`：

```python
class PlannerSnapshotRef(BaseModel):
    version: int | None = None
    markdown: str | None = None
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    dayPlans: list[PlannerDayPlanRef] = Field(default_factory=list)
    currentDayIndex: int | None = None
    completedDayIndexes: list[int] = Field(default_factory=list)
```

建议扩展 `PlannerSnapshotDraft`：

```python
class PlannerSnapshotDraft(BaseModel):
    baseVersion: int | None = None
    proposedVersion: int | None = None
    scope: PlanningScope | None = None
    targetDayIndex: int | None = None
    currentDayPlan: PlannerDayPlanRef | None = None
    dayPlans: list[PlannerDayPlanRef] = Field(default_factory=list)
    markdown: str
    places: list[PlannerPlaceSuggestion] = Field(default_factory=list)
    routes: list[PlannerRouteSegment] = Field(default_factory=list)
    selectedPlaceIds: list[UUID] = Field(default_factory=list)
    rejectedPlaceIds: list[UUID] = Field(default_factory=list)
    changeSummary: str | None = None
    patchOps: list[dict[str, Any]] = Field(default_factory=list)
    checksum: str | None = None
```

兼容规则：

- `markdown` 继续保留。`DAY_PLAN` / `DAY_REFINE` 时表示当天 Markdown，`TRIP_ASSEMBLE` 时表示完整旅行 Markdown。
- `places` 和 `routes` 继续保留。单天模式下表示当天点位和路线；最终汇总模式下表示全程聚合点位和路线。
- `dayPlans` 是新增的结构化版本链核心，后续 Java 落库时应把它作为正式快照的一部分。
- 老请求不传 `planningScope` 时，默认按 `DAY_PLAN` 处理，`targetDayIndex` 默认从 `latestSnapshot` 推断下一天。

### 13.4 版本与回溯策略

本阶段 Python Agent 仍然不直连数据库，版本策略保持“由请求恢复状态，由响应返回草稿”：

- 每轮 Agent 返回完整 `snapshotDraft`，其中包含已确认 day plans 和当前 day plan。
- Java 后续负责把 `snapshotDraft` 保存为正式 `PlannerSnapshot`，并分配最终 `version`。
- Python 里的 `proposedVersion = baseVersion + 1` 只作为建议值，不是最终版本号。
- 用户切换旧版本或回滚时，Java 只需要把被选中的旧 `PlannerSnapshot` 作为 `latestSnapshot` 传回 Agent。
- `patchOps` 使用日维度路径，例如 `/dayPlans/1/markdown`、`/dayPlans/2/places`。
- `checksum` 至少覆盖 `scope`、`targetDayIndex`、当天 Markdown、当天 places、已确认 day plans 摘要，避免同一轮结果被重复保存。

为了控制 token，传给模型的上下文不应包含所有历史 Markdown 原文。推荐策略：

- 当前目标日：传完整当天上一版 Markdown。
- 已确认日期：传摘要、核心点位、不可重复约束，不传完整长文。
- 未规划日期：只传日期、天数、用户偏好，不传空模板。
- 最终汇总时：传所有已确认 day plans 的 Markdown，但不再调用外部搜索工具，避免汇总阶段变成重新规划。

### 13.5 Agent 编排调整

当前 `PlannerAgent.run()` 建议调整为日维度流程：

```text
1. validate_slots
2. load_trip_snapshot
3. resolve_target_day
4. apply_user_interaction_for_day
5. collect_day_evidence
6. generate_or_repair_day_plan
7. build_day_recommendation_groups
8. build_day_snapshot_draft
9. return_response
```

`TRIP_ASSEMBLE` 使用单独流程：

```text
1. validate_confirmed_day_plans
2. aggregate_places_and_routes
3. generate_final_markdown
4. build_final_snapshot_draft
5. return_response
```

实现要点：

- `resolve_target_day` 优先使用请求里的 `targetDayIndex`，没有时从 `latestSnapshot.dayPlans` 推断第一个未确认日期。
- `collect_day_evidence` 只为当天收集证据，避免每轮都查询全程。
- `generate_or_repair_day_plan` 的 prompt 必须明确“只输出目标日，不输出其他日期”。
- `build_day_recommendation_groups` 只围绕当天点位、餐厅、节奏、是否确认当天生成选项。
- `TRIP_ASSEMBLE` 不应重新改变每天安排，只做统一标题、预算摘要、注意事项和全程 Markdown 排版。

### 13.6 多 Agent 与 LangGraph 重新评估

“每天一个 Agent”这个方向可以作为中期架构，但不建议作为下一步第一实现。原因是当前真正需要稳定的是日维度 DTO、快照版本和交互协议，而不是 Agent 之间的通讯方式。

推荐演进路线：

1. 短期：一个 `PlannerAgent`，内部按 `targetDayIndex` 生成单天计划。
2. 中期：抽出普通 Python 服务类，例如 `DayPlanService`、`TripAssemblyService`、`OptionBuilderService`，仍由 `PlannerAgent` 编排。
3. 中后期：如果流程复杂度继续上升，再用 LangGraph POC 拆成图节点。

潜在 LangGraph 节点：

- `TripCoordinatorAgent`：决定当前规划哪一天、读取已确认日计划、生成跨日约束。
- `DayPlannerAgent`：只负责目标日计划生成。
- `DayCriticAgent`：检查当天路线是否过密、是否和已确认日期重复。
- `OptionBuilderAgent`：生成用户可选项。
- `FinalAssemblerAgent`：汇总全部已确认日计划。

通讯原则：

- Agent 之间不使用自然语言自由聊天传递状态。
- 所有通讯通过 `PlannerGraphState` / Pydantic DTO 传递。
- LangGraph 更适合承载 human-in-the-loop、checkpoint、节点级 trace。
- LangChain 可以局部用于 prompt template、tool schema、output parser，但不建议用高层 `create_agent` 直接替换当前业务编排。

### 13.7 任务拆分

#### 阶段 C+1：单天规划 DTO

任务：

- 新增 `PlanningScope`。
- 新增 `PlannerDayPlanStatus`、`PlannerDayPlanRef`。
- 扩展 `AgentRunRequest`：`planningScope`、`targetDayIndex`、`targetDate`。
- 扩展 `PlannerSnapshotRef`：`dayPlans`、`currentDayIndex`、`completedDayIndexes`。
- 扩展 `PlannerSnapshotDraft`：`scope`、`targetDayIndex`、`currentDayPlan`、`dayPlans`。
- 增加 DTO 兼容测试，确保旧请求仍可运行。

验收标准：

- 不传新字段时，旧 smoke test 不失败。
- 传 `planningScope=DAY_PLAN` 和 `targetDayIndex=1` 时，响应包含 `snapshotDraft.currentDayPlan`。
- `snapshotDraft.markdown` 与 `currentDayPlan.markdown` 保持一致。

#### 阶段 C+2：单天生成与交互

任务：

- 修改 DeepSeek prompt：要求只生成 `targetDayIndex` 对应日期。
- 修改 fallback builder：只生成当天计划。
- recommendationGroups 增加“确认当天”“重写当天”“进入下一天”等选项。
- `_build_snapshot_draft` 支持把当前日计划合并回 `dayPlans`。
- trace metadata 增加 `planningScope`、`targetDayIndex`。

验收标准：

- 三日行程的初始请求只返回 Day 1。
- Day 1 选择交互后，只修订 Day 1，不生成 Day 2/Day 3。
- 用户确认 Day 1 后，下一轮可以生成 Day 2。
- 模型输出比完整三日计划更具体，且不超过当前 token 上限。

#### 阶段 C+3：日计划版本链与回滚验证

任务：

- 增加测试 fixture：Day 1 v1、Day 1 v2、Day 2 v3。
- 模拟用户回滚到 Day 1 v1 后重新规划。
- 检查 `baseVersion`、`proposedVersion`、`patchOps`、`checksum`。
- 检查已拒绝点位不会在同一天继续主推。

验收标准：

- 传入旧 `latestSnapshot` 时，Agent 基于旧版本继续规划。
- `patchOps` 能指向具体 day plan。
- `checksum` 对同一输入稳定，对不同日计划变化。

#### 阶段 C+4：最终汇总

任务：

- 新增 `planningScope=TRIP_ASSEMBLE` 分支。
- 汇总所有 `CONFIRMED` day plans。
- 生成全程 Markdown：总览、每日安排、地图点位摘要、预算和注意事项。
- 汇总 `places` / `routes`，去重并保持 dayIndex 信息。
- 未确认所有日期时返回 `NEED_MORE_INFO` 或 `ASK_USER_SELECTION`。

验收标准：

- 所有天确认后可生成完整计划。
- 未确认全部天数时不生成最终计划。
- 最终汇总不擅自新增核心景点或改变已确认日程。

### 13.8 本轮不做的事项

- 不让 Python Agent 直连 MongoDB。
- 不做 Java WebSocket 推送。
- 不做前端版本历史 UI。
- 不做真实多 Agent 生产化。
- 不把 LangChain / LangGraph 作为本轮硬依赖。
- 不做 RAG 上线，只保留后续阶段 E。

### 13.9 阶段 C+1 实施记录

完成日期：2026-05-29。

已完成：

- 新增 `PlanningScope`，支持 `DAY_PLAN`、`DAY_REFINE`、`TRIP_ASSEMBLE`。
- 新增 `PlannerDayPlanStatus`、`PlannerDayPlanRef`。
- 扩展 `AgentRunRequest`，增加 `planningScope`、`targetDayIndex`、`targetDate`。
- 扩展 `PlannerSnapshotRef`，增加 `dayPlans`、`currentDayIndex`、`completedDayIndexes`。
- 扩展 `PlannerSnapshotDraft`，增加 `scope`、`targetDayIndex`、`currentDayPlan`、`dayPlans`。
- `PlannerAgent` 现在会在构建 `snapshotDraft` 时自动生成当前日计划，并把它合并回 `dayPlans`。
- `patchOps` 已能记录 `/dayPlans/{dayIndex}` 级别的新增或替换。
- trace input summary 已增加 `planningScope` 和 `targetDayIndex` 摘要，便于排查。
- 保持旧请求兼容：不传 C+1 新字段时默认按 `DAY_PLAN`、Day 1 处理。

验证结果：

- `.venv\Scripts\python.exe -m pytest` 通过，当前为 `21 passed`。

C+2 待做：

- 让 DeepSeek prompt 和 fallback builder 真正只生成目标日内容。
- recommendationGroups 增加“确认当天”“重写当天”“进入下一天”等日维度选项。
- 当前 C+1 只完成协议和快照结构，不改变多日 Markdown 生成逻辑。

### 13.10 阶段 C+2 实施记录

完成日期：2026-05-29。

已完成：

- DeepSeek 请求 payload 已增加 `dayScope`，包含 `planningScope`、`targetDayIndex`、`targetDate`、`totalDays` 和已确认日计划摘要。
- DeepSeek 输出规则已在 `DAY_PLAN` / `DAY_REFINE` 下明确要求只生成目标日，不生成其他日期。
- system policy 已补充单天规划约束：单天模式不得输出其他天，只能把已确认日期作为约束参考。
- fallback builder 已支持单天 Markdown：`DAY_PLAN` / `DAY_REFINE` 下只输出目标日章节。
- recommendationGroups 已增加 `day_plan_actions`，包含：
  - `day:confirm_current_day`
  - `day:rewrite_current_day`
  - `day:next_day`
- Agent 已能把 `day:confirm_current_day` 解释为确认当前日计划。
- planner constraints 和 trace summary 已补充 `planningScope`、`targetDayIndex`。

验证结果：

- `.venv\Scripts\python.exe -m pytest` 通过，当前为 `22 passed`。

C+3 待做：

- 增加 Day 1 v1、Day 1 v2、Day 2 v3 等版本链 fixture。
- 验证基于旧 `latestSnapshot` 回滚后重新规划。
- 校验 `/dayPlans/{dayIndex}` 级别 `patchOps`、`checksum` 稳定性和拒绝点位不再主推。

### 13.11 阶段 C+3 实施记录

完成日期：2026-05-29。

已完成：

- mock 酒店、fallback 占位点位、Amap POI 的 `placeId` 已从随机 `uuid4` 调整为基于来源内容的确定性 `uuid5`，保证同一输入可得到稳定快照 checksum。
- 增加版本链回归测试 fixture：
  - Day 1 v1
  - Day 1 v2
  - Day 2 v3
- 已验证用户回滚到 Day 1 v1 后重新规划时，Agent 只基于传入的旧 `latestSnapshot` 工作，不会误带 Day 2 v3。
- 已验证同一旧快照重复请求时，`snapshotDraft.checksum` 和 `currentDayPlan.checksum` 保持稳定。
- 已验证不同目标日或不同版本链会生成不同 checksum。
- 已验证 `patchOps` 能落到 `/dayPlans/{dayIndex}`。
- 已验证被拒绝的点位不会再进入主 places，也不会出现在推荐选项里。

验证结果：

- `.venv\Scripts\python.exe -m pytest` 通过，当前为 `23 passed`。

C+4 待做：

- 新增 `planningScope=TRIP_ASSEMBLE` 的最终汇总分支。
- 汇总所有 `CONFIRMED` day plans。
- 未确认全部日期时返回待确认状态，不生成最终完整计划。

### 13.12 C+1 到 C+3 后端同步数据与前端预留组件

本节只记录后续 Java 后端与前端需要对齐的事项。当前阶段仍只实现 Python Agent，不在本阶段接 MongoDB、WebSocket 或前端。

#### 13.12.1 Java 后端需要同步给 Python Agent 的请求数据

后续 Java `ai-arrange-service` 调用 Python Agent 时，需要完整透传以下字段：

- `conversationId`：当前规划会话 ID。
- `userId`：当前登录用户 ID。
- `planningMode`：旧交互模式，继续保留兼容，例如 `INITIAL_PLAN`、`REFINE_WITH_SELECTION`。
- `planningScope`：C+1 新增作用域，必须支持 `DAY_PLAN`、`DAY_REFINE`、`TRIP_ASSEMBLE`。
- `targetDayIndex`：当前要生成或修订第几天，从 1 开始。
- `targetDate`：当前目标日日期。可由 Java 计算后传入，也可由 Python 根据 `travelStartDate + targetDayIndex - 1` 推断。
- `coreSlots`：固定槽位，至少包含 `city`、`travelStartDate`、`travelEndDate`、`peopleCount`。
- `userMessage`：用户本轮自由文本。
- `interaction`：前端交互结果，包含：
  - `selectedOptionIds`
  - `rejectedOptionIds`
  - `selectedPlaceIds`
  - `rejectedPlaceIds`
  - `freeText`
  - `confirmCurrentPlan`
- `latestSnapshot`：Java 从 MongoDB 取出的当前基线版本，至少包含：
  - `version`
  - `markdown`
  - `places`
  - `routes`
  - `dayPlans`
  - `currentDayIndex`
  - `completedDayIndexes`
- `history`：可选，对话历史摘要，不应无限增长。
- `userContext`：可选，用户偏好、家庭画像、预算画像等，由 Java 鉴权后注入。

注意事项：

- 前端不直接调用 Python Agent，必须经过 Java。
- 回滚时，Java 应把用户选中的历史 `PlannerSnapshot` 原样作为 `latestSnapshot` 传给 Python，不要自动混入更新版本的 `dayPlans`。
- C+1 到 C+3 阶段，Python 只相信请求里的 `latestSnapshot`，不主动读取任何数据库。

#### 13.12.2 Python Agent 返回后 Java 需要落库的数据

Java 收到 `AgentRunResponse` 后，需要重点处理以下字段：

- `traceId`：用于日志串联和问题排查。
- `status`：Agent 本轮结果状态。
- `assistantText`：展示给用户的简短说明。
- `markdown`：当前目标日 Markdown。C+4 前不是完整旅行计划。
- `nextAction`：驱动前端状态，例如继续选择、计划已更新、缺少信息、完成。
- `places`：当前目标日地图点位。
- `routes`：当前目标日路线片段。
- `recommendationGroups`：前端交互选项。
- `snapshotDraft`：需要保存为正式 `PlannerSnapshot` 的草稿，包含：
  - `baseVersion`
  - `proposedVersion`
  - `scope`
  - `targetDayIndex`
  - `currentDayPlan`
  - `dayPlans`
  - `markdown`
  - `places`
  - `routes`
  - `selectedPlaceIds`
  - `rejectedPlaceIds`
  - `changeSummary`
  - `patchOps`
  - `checksum`
- `warnings`：模型或工具降级信息。
- `userFacingEvents`：可通过 WebSocket 转发为用户可读状态。

Java 落库时需要做的判断：

- `snapshotDraft.proposedVersion` 只是 Agent 建议值，正式版本号由 Java 分配。
- 必须校验 `snapshotDraft.baseVersion` 是否等于当前会话最新版本，避免并发覆盖。
- 必须用 `snapshotDraft.checksum` 做幂等判断，避免同一轮 Agent 响应被重复保存。
- `currentDayPlan.checksum` 应保存到对应 day plan，用于日计划级别比较。
- `patchOps` 需要保留，后续用于版本差异、审计和回滚说明。
- `dayPlans` 是完整日计划链，不能只保存当前日，否则 C+4 无法汇总。
- `places` / `routes` 是当前日展示数据，正式快照内仍应保留全量 `dayPlans[*].places` 和 `dayPlans[*].routes`。

#### 13.12.3 MongoDB 建议预留结构

建议正式 `PlannerSnapshot` 至少预留：

```json
{
  "id": "snapshot id",
  "conversationId": "conversation id",
  "userId": "user id",
  "version": 4,
  "baseVersion": 3,
  "scope": "DAY_REFINE",
  "targetDayIndex": 2,
  "currentDayIndex": 2,
  "completedDayIndexes": [1],
  "markdown": "# Day 2 ...",
  "places": [],
  "routes": [],
  "dayPlans": [
    {
      "dayIndex": 1,
      "date": "2026-06-01",
      "status": "CONFIRMED",
      "title": "Shanghai Day 1",
      "markdown": "# Day 1 ...",
      "places": [],
      "routes": [],
      "selectedPlaceIds": [],
      "rejectedPlaceIds": [],
      "changeSummary": "Confirmed day 1.",
      "checksum": "day checksum"
    }
  ],
  "selectedPlaceIds": [],
  "rejectedPlaceIds": [],
  "changeSummary": "Updated day 2.",
  "patchOps": [],
  "checksum": "snapshot checksum",
  "traceId": "agent trace id",
  "createdAt": "server time",
  "createdBy": "user id"
}
```

建议索引：

- `conversationId + version` 唯一索引。
- `conversationId + checksum` 幂等索引。
- `conversationId + createdAt` 历史版本查询索引。
- `conversationId + dayPlans.dayIndex` 日计划查询辅助索引。

#### 13.12.4 Java 后端需要预留的接口

后续建议预留：

- `POST /ai-arrange/api/conversations/{conversationId}/planner/run`：触发 Agent 生成或修订。
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots`：查询版本列表。
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots/{version}`：查询指定版本。
- `POST /ai-arrange/api/conversations/{conversationId}/snapshots/{version}/rollback`：以指定版本作为基线重新规划。
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots/{fromVersion}/diff/{toVersion}`：比较两个版本差异。
- `POST /ai-arrange/api/conversations/{conversationId}/days/{dayIndex}/confirm`：确认某一天。
- `POST /ai-arrange/api/conversations/{conversationId}/days/{dayIndex}/revise`：修订某一天。

这些接口由 Java 负责鉴权、版本冲突、MongoDB 落库、幂等判断和 Python Agent 调用。

#### 13.12.5 WebSocket 消息预留

可以继续复用已有 WebSocket 通道，但建议预留以下消息类型或 payload 字段：

- `PLANNER_CHAT_STREAM`：模型文本流或阶段性文本。
- `PLANNER_DATA_REFRESH`：刷新地图点位、路线、当前 Markdown。
- `PLANNER_DAY_PLAN_REFRESH`：刷新当前日计划，包含 `targetDayIndex`、`currentDayPlan`。
- `PLANNER_OPTIONS_REFRESH`：刷新 `recommendationGroups`。
- `PLANNER_SNAPSHOT_SAVED`：Java 已保存正式快照，返回正式 `version`。
- `PLANNER_VERSION_CONFLICT`：保存时发现 `baseVersion` 不是最新版本。
- `PLANNER_TRACE_EVENT`：可选，转发白话版工具状态。

前端不要依赖 Python 返回的 `proposedVersion` 作为最终版本号，必须等待 Java 的 `PLANNER_SNAPSHOT_SAVED`。

#### 13.12.6 前端需要预留的页面与组件

核心布局仍保持“左侧 Markdown + 右侧地图/点位/交互”的规划体验，但需要预留日维度能力：

- 日计划进度条 / Day Tabs：
  - 展示 Day 1、Day 2、Day 3。
  - 显示状态：未生成、草稿、待确认、已确认、需修订。
  - 点击某一天时加载对应 day plan。
- 当前日 Markdown 面板：
  - C+4 前展示的是当前日 Markdown，不是完整旅行计划。
  - 需要显示“当前为 Day N / 共 M 天”。
- 推荐选项组件：
  - 渲染 `recommendationGroups`。
  - 支持 `MULTI_SELECT`、`SINGLE_SELECT`。
  - 支持 `minSelect`、`maxSelect`。
  - 支持 selected / disabled 状态。
- 日操作按钮组：
  - 确认当天：对应 `day:confirm_current_day`。
  - 重写当天：对应 `day:rewrite_current_day`。
  - 进入下一天：对应 `day:next_day`。
- 地图点位面板：
  - 当前只展示目标日点位。
  - 已确认日期的点位可以灰色或锁定显示，避免用户误以为仍在编辑。
  - 需要支持点击地图点位后回传 `selectedPlaceIds` / `rejectedPlaceIds`。
- 点位选择卡片：
  - 支持“想去”“不去”“备选”。
  - `placeId` 是首选标识；只有 `amapPoiId` 时由 Java 映射后再传给 Agent。
- 自由反馈输入框：
  - 用于 `interaction.freeText`。
  - 例如“这天太累”“换成室内”“不要夜市”。
- 版本历史面板：
  - 展示版本号、时间、changeSummary、targetDayIndex。
  - 支持查看旧版本。
  - 支持回滚到旧版本后重新规划。
- 版本差异组件：
  - 基于 `patchOps` 显示变化。
  - 至少支持 Markdown 变更、day plan 变更、selected/rejected 变更。
- 版本冲突提示：
  - 当 Java 返回 `PLANNER_VERSION_CONFLICT` 时提示用户刷新或选择保留哪版。
- 保存状态提示：
  - 展示“AI 已生成草稿”“正在保存版本”“已保存为版本 N”。

#### 13.12.7 前端回传给 Java 的交互 payload

前端每次触发 Agent 前，建议组装为：

```json
{
  "planningScope": "DAY_REFINE",
  "targetDayIndex": 2,
  "targetDate": "2026-06-02",
  "userMessage": "这一天少走路，保留博物馆，删掉夜市",
  "interaction": {
    "selectedOptionIds": ["style:relaxed", "day:rewrite_current_day"],
    "rejectedOptionIds": ["place:22222222-2222-2222-2222-222222222222"],
    "selectedPlaceIds": ["11111111-1111-1111-1111-111111111111"],
    "rejectedPlaceIds": ["22222222-2222-2222-2222-222222222222"],
    "freeText": "这一天少走路，保留博物馆，删掉夜市",
    "confirmCurrentPlan": false
  }
}
```

如果用户点击“确认当天”，建议：

```json
{
  "planningScope": "DAY_REFINE",
  "targetDayIndex": 2,
  "interaction": {
    "selectedOptionIds": ["day:confirm_current_day"],
    "rejectedOptionIds": [],
    "selectedPlaceIds": [],
    "rejectedPlaceIds": [],
    "freeText": null,
    "confirmCurrentPlan": true
  }
}
```

#### 13.12.8 职责边界提醒

- Python Agent：只负责规划、生成日计划草稿、生成交互选项、返回快照草稿。
- Java 后端：负责登录鉴权、正式版本号、MongoDB 落库、幂等、并发冲突、历史版本查询、回滚入口、WebSocket 推送。
- 前端：负责日维度展示、用户交互、地图联动、版本历史和差异展示。
- C+1 到 C+3 不要求前端马上完整实现，但组件和接口字段必须预留，否则 C+4 汇总和后续 Java 集成会返工。

### 13.13 阶段 C+4 实施记录

完成日期：2026-05-29。

已完成：

- 新增 `planningScope=TRIP_ASSEMBLE` 分支。
- `TRIP_ASSEMBLE` 不再调用 ReAct 工具、DeepSeek 或 fallback builder，只基于 `latestSnapshot.dayPlans` 汇总。
- 汇总前会校验所有旅行日期是否都有 `CONFIRMED` day plan。
- 如果存在未确认日期，返回：
  - `status=PARTIAL_SUCCESS`
  - `nextAction=ASK_USER_SELECTION`
  - `warning.code=TRIP_ASSEMBLY_NOT_READY`
  - `snapshotDraft=null`
- 所有日期确认后，Agent 会生成最终完整 Markdown，包含：
  - Trip overview
  - Daily itinerary
  - Map points by day
  - Route notes
  - Confirmation note
- 汇总后的 `places` 会按点位去重，并在点位上保留 `dayIndexes`。
- 汇总后的 `routes` 会保留 `dayIndex`。
- 最终汇总也会生成 `snapshotDraft`，其中：
  - `scope=TRIP_ASSEMBLE`
  - `targetDayIndex=null`
  - `currentDayPlan=null`
  - `dayPlans` 保留全部已确认日计划
  - `checksum` 覆盖最终 Markdown、聚合点位、路线和 day plans。

验证结果：

- `.venv\Scripts\python.exe -m pytest` 通过，当前为 `25 passed`。

至此，C+1 到 C+4 在 Python Agent 模块内形成闭环：

```text
单天 DTO
-> 单天生成
-> 单天版本回溯
-> 多天最终汇总
```

后续进入 Java / MongoDB / WebSocket / 前端联调前，需要优先对齐 13.12 中列出的字段、接口和组件预留。

### 13.14 单日生成后的超时策略调整

实测中出现过 `deepseek_chat_completion timed out`，并导致 Agent 进入 `fallback_plan_builder`。原因不是 DeepSeek HTTP 客户端超时配置本身，而是 Harness 外层模型工具超时复用了 `AGENT_MAX_RUNTIME_SECONDS`。旧默认值为 30 秒，容易在模型仍在生成时被外层截断。

本次调整：

- 新增 `AGENT_MODEL_TIMEOUT_SECONDS`，表示 Harness 层模型工具调用超时。
- `AGENT_MODEL_TIMEOUT_SECONDS` 默认跟随 `DEEPSEEK_TIMEOUT_SECONDS`，当前默认 90 秒。
- `AGENT_MAX_RUNTIME_SECONDS` 默认从 30 秒提高到 120 秒，适配按天生成后的 DeepSeek 调用、结构化校验和兜底流程。
- `deepseek_chat_completion` 的工具注册超时改为使用 `policy.model_timeout_seconds`，不再直接使用整轮 runtime。
- `DEEPSEEK_MAX_TOKENS` 默认从 1200 提高到 6000，避免 reasoning 模型在复杂单日 JSON 输出时把正式 `message.content` 截短或留空。
- `MODEL_OUTPUT_INVALID` warning 增加原始输出预览，下一次 trace 可以直接判断模型返回的是空内容、自然语言还是截断 JSON。

手动联调建议：

```powershell
$env:DEEPSEEK_TIMEOUT_SECONDS = "90"
$env:AGENT_MODEL_TIMEOUT_SECONDS = "90"
$env:AGENT_MAX_RUNTIME_SECONDS = "120"
$env:DEEPSEEK_MAX_TOKENS = "6000"
```

如果后续接 Java，Java 调 Python Agent 的 HTTP timeout 应大于 `AGENT_MAX_RUNTIME_SECONDS`，建议先设置为 150 秒，否则 Java 侧可能先断开连接。

### 13.15 阶段 0：文档与配置对齐实施记录

完成目标：

- 新增 `NEXT-DEVELOPMENT-PLAN.md`，作为当前最新开发计划入口。
- `README.md` 已补充当前能力：交互式规划、单日规划、最终汇总、快照草稿和后续 SSE 流式输出方向。
- `MVP-SUMMARY.md` 已标注为 MVP 历史总结，避免被误认为当前最新计划。
- 代码默认配置与文档设置对齐：
  - `DEEPSEEK_TIMEOUT_SECONDS=90`
  - `AGENT_MODEL_TIMEOUT_SECONDS=90`
  - `AGENT_MAX_RUNTIME_SECONDS=120`
  - `DEEPSEEK_MAX_TOKENS=6000`
- Java 调 Python Agent 的 HTTP timeout 建议保持 150 秒。

验证结果：

- `.venv\Scripts\python.exe -m pytest` 通过，当前为 `32 passed`。

阶段 1 已确认的流式输出策略：

- Python 到 Java 采用 SSE。
- Java 使用 WebClient 消费 Python 流。
- 第一版只输出阶段状态流和最终完整 `AgentRunResponse`。
- 不做 token 级 Markdown 增量流。
- 前端只在阶段结束或最终结果到达时整块渲染 Markdown。

下一步：

- 进入阶段 1：新增 `PlannerStreamEvent` DTO 和 `/agent/planner/stream`。
- 保持 `/agent/planner/run` 兼容。
- 流式事件只暴露白话状态、摘要和最终结构化结果，不暴露 CoT、系统 prompt、API key 或原始工具 JSON。

### 13.16 阶段 1：SSE 流式输出实施记录

完成目标：

- 新增 `PlannerStreamEventType` 和 `PlannerStreamEvent`，用于 Java 消费结构化流式事件。
- 新增 `POST /agent/planner/stream`，返回 `text/event-stream`。
- 保持 `POST /agent/planner/run` 原有完整响应兼容。
- `TraceRecorder` / Hooks 产生的 `userFacingEvents` 已可转换为 SSE 阶段事件：
  - `RUN_STARTED`
  - `TOOL_STARTED`
  - `TOOL_FINISHED`
  - `MODEL_STARTED`
  - `MODEL_FINISHED`
  - `FALLBACK_USED`
- Agent 完成后会追加结构化终端事件：
  - `OPTIONS_READY`
  - `SNAPSHOT_DRAFT_READY`
  - `RUN_FINISHED`
  - `RUN_FAILED`
- 第一版不做 token 级 Markdown 增量流，只做阶段状态流和最终完整 `AgentRunResponse`。
- 无 DeepSeek / Amap key 的 fallback 路径也能返回 SSE 状态和最终结果。
- 缺少必填槽位时，SSE 最终事件仍包含完整错误提示响应。

事件边界：

- Java 可以用 WebClient 消费 SSE。
- Java 只需要在 `RUN_FINISHED` 事件里读取完整 `AgentRunResponse` 并落库。
- 流式事件不暴露 CoT、系统 prompt、Authorization、Bearer token 或 API key。
- 前端不需要 token 级 Markdown 展示，只在阶段结束或最终结果时整块刷新。

验证结果：

- `.venv\Scripts\python.exe -m pytest` 通过，当前为 `34 passed`。

### 13.17 阶段 2：Java 渐进接入实施记录

完成目标：

- `ai-arrange-service` 作为原有 Java AI 编排模块继续承担 REST、WebSocket、MongoDB 快照和前端协议职责。
- 新增 `PlannerAgentClient` / `PythonPlannerAgentClient`，使用 WebClient 调用 Python Agent。
- 支持同步调用 `POST /agent/planner/run`。
- 支持消费 `POST /agent/planner/stream` SSE 流，并把阶段事件转成 Java WebSocket 消息。
- Java WebSocket 侧转发：
  - `PLANNER_TRACE_EVENT`
  - `PLANNER_OPTIONS_REFRESH`
  - `PLANNER_DATA_REFRESH`
  - `PLANNER_SNAPSHOT_SAVED`
- 新增 Java Agent DTO，兼容 Python 当前字段，包括 `planningMode`、`planningScope`、`targetDayIndex`、`targetDate`、`interaction`、`latestSnapshot`、`recommendationGroups`、`snapshotDraft`、`dayPlans`、`patchOps`、`checksum`。
- `PlannerSnapshot` 已扩展保存 Agent 快照草稿中的版本链字段、日计划字段、patch 字段、checksum 和 traceId。
- Java 收到最终 Agent 响应后保存正式 `PlannerSnapshot`。
- 正式 `version` 由 Java 基于 MongoDB 最新快照重新分配，不直接使用 Python 的 `snapshotDraft.proposedVersion`。
- 已基于 `conversationId + checksum` 处理重复 Agent 响应的幂等保存。

当前边界：

- Python Agent 仍不写 MongoDB，不处理登录鉴权，不直接面向前端。
- Java 已完成第一批接入闭环；并发冲突校验、回滚后重规划、日计划确认接口、diff 和前端历史版本展示仍在后续批次。

验证结果：

- `mvn test` 已在 `ai-arrange-service` 目录通过，当前 Java 测试结果为 `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`。
