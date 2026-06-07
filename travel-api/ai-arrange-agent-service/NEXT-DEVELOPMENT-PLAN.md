# AI Arrange Agent 下一阶段开发计划

## 最新调整：阶段 5 先行

当前开发顺序临时调整为先完成阶段 5 的地图组件和前端联调。阶段 4 `offer-provider` adapter 与阶段 6 天气 / 交通 adapter 先忽略，不进入本轮实现。

本轮阶段 5 的最小交付：

- 前端 AI 规划页接入地图组件。
- 没有高德前端 key 时，使用模拟地图和模拟点位数据完成联调。
- 配置高德前端 key 后，地图组件加载高德 JavaScript API 展示真实地图底图。
- 后端仍可继续输出 mock-first 的 `places` / `routes` 结构，前端先按结构消费。

## 1. 本轮结论

下一阶段先更新和冻结文档，再逐步进入 Java / MongoDB / WebSocket / 前端联调。Python `ai-arrange-agent-service` 仍保持内部 Agent 规划节点定位，不直接面向前端，不直连 MongoDB，不处理登录鉴权和正式版本号。

已确认决策：

- 优先更新文档和接口契约。
- 运行配置使用当前文档中的设置：
  - `DEEPSEEK_TIMEOUT_SECONDS=90`
  - `DEEPSEEK_FLASH_MODEL=deepseek-v4-flash`
  - `DEEPSEEK_PRO_MODEL=deepseek-v4-pro`
  - `DEEPSEEK_THINKING_TYPE=disabled`
  - `AGENT_MODEL_TIMEOUT_SECONDS=90`
  - `AGENT_MAX_RUNTIME_SECONDS=120`
  - `DEEPSEEK_MAX_TOKENS=12000`
  - `DEEPSEEK_SLOW_RESPONSE_WARNING_MS=60000`
  - Java 调 Python Agent 的 HTTP timeout 建议大于 Agent runtime；默认 runtime 120 秒时至少 150 秒，Docker runtime 240 秒时使用 270 秒。
- Java 接入逐步完成，不一次性完成全部版本、回滚、diff 和 WebSocket 能力。
- 用户可见文案统一为中文。
- 外部能力接入顺序：
  1. offer-provider 酒店 / 产品 adapter
  2. 高德 POI / 路线增强
  3. 天气和交通 adapter
- 输出改为 SSE 流式输出，同时保留现有非流式接口兼容。

## 2. 总体目标

把当前 Python Agent 从“单次 HTTP 返回完整规划结果”升级为“可被 Java 后端消费的 SSE 流式规划引擎”：

```text
Java 调用 Python stream endpoint
-> Python 按阶段返回规划事件、工具状态、模型输出片段、最终结构化结果
-> Java 将事件转成 WebSocket 消息推给前端
-> Java 收到最终 AgentRunResponse 后负责保存正式 PlannerSnapshot
```

最终体验目标：

- 前端能看到实时中文状态，例如“正在查询酒店候选”“正在生成 Day 2 行程”“已生成可选择地点”。
- Markdown 可以逐步展示，但最终仍以 Python 返回的完整 `AgentRunResponse` 为准。
- `recommendationGroups`、`snapshotDraft`、`places`、`routes` 只在结构完整时进入最终事件。
- Java 仍是正式版本号、幂等、并发冲突和 MongoDB 落库的裁决者。

## 3. 阶段 0：文档与配置对齐

目标：先把文档、README、环境变量、Java 对接说明对齐，避免后续联调时口径不一致。

状态：已执行。当前文档、README 和代码默认配置已按本节设置对齐；`.venv\Scripts\python.exe -m pytest` 已通过，当前为 `32 passed`。后续阶段从 SSE 流式输出契约开始。

任务：

- 更新 `README.md`，补充当前已支持的交互式规划、单日规划、最终汇总和即将加入的流式输出。
- 更新 `HARNESS-ITERATION5.18-PLAN.md`，补充本计划链接、流式输出方案、Java 渐进接入策略。
- 更新 `MVP-SUMMARY.md`，标注它是 MVP 历史总结，避免被误认为当前最新状态。
- 将代码默认配置与文档设置对齐：
  - `DEEPSEEK_TIMEOUT_SECONDS` 默认改回 90。
  - `AGENT_MAX_RUNTIME_SECONDS` 默认改回 120。
  - `DEEPSEEK_MAX_TOKENS` 默认提高到 12000，避免单日规划被输出上限压得过短。
  - `DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL` 用于前端 Flash/Pro 模型模式选择，前端默认使用 Flash。
  - `DEEPSEEK_THINKING_TYPE` 默认 `disabled`，确保 DeepSeek thinking mode 默认关闭。
  - `DEEPSEEK_SLOW_RESPONSE_WARNING_MS` 默认 60000，用于标记模型慢响应。
  - `AGENT_MODEL_TIMEOUT_SECONDS` 默认继续跟随 `DEEPSEEK_TIMEOUT_SECONDS`。
- 文档中明确：Java HTTP timeout 必须大于 `AGENT_MAX_RUNTIME_SECONDS`。

验收标准：

- README 能说明当前 Agent 的最新 API 和下一步 stream endpoint。
- 文档和代码默认配置一致。
- 测试全部通过。

## 4. 阶段 1：流式输出契约

目标：新增流式输出能力，但不破坏现有 `/agent/planner/run`。

状态：已执行。已新增 `PlannerStreamEvent` DTO、`/agent/planner/stream` SSE 接口、阶段状态事件转换和最终完整响应事件；`.venv\Scripts\python.exe -m pytest` 已通过，当前为 `34 passed`。

建议新增内部接口：

```text
POST /agent/planner/stream
Content-Type: application/json
Accept: text/event-stream
```

保留：

```text
POST /agent/planner/run
```

设计原则：

- `/run` 继续返回完整 `AgentRunResponse`，用于测试、降级、Java 非流式调用。
- `/stream` 返回 SSE 事件，Java 消费后转成 WebSocket 消息。
- 最后一个事件必须包含完整 `AgentRunResponse`，Java 只基于最终事件落库。
- 不在流里返回 CoT、系统 prompt、API key、原始工具 JSON 或敏感用户明文。

建议事件结构：

```json
{
  "eventId": "uuid",
  "traceId": "trace id",
  "conversationId": "conversation id",
  "type": "TOOL_STARTED",
  "status": "RUNNING",
  "message": "正在查询酒店候选...",
  "phase": "tool",
  "tool": "search_hotels",
  "snapshotVersion": 3,
  "targetDayIndex": 2,
  "data": {},
  "createdAt": "2026-05-30T00:00:00Z"
}
```

事件类型第一版建议：

| type | 用途 | data |
| --- | --- | --- |
| `RUN_STARTED` | Agent 开始执行 | 请求摘要 |
| `TOOL_STARTED` | 工具开始 | 工具名、中文状态 |
| `TOOL_FINISHED` | 工具结束 | 状态、耗时、摘要 |
| `MODEL_STARTED` | 模型开始 | 模型名、中文状态 |
| `MODEL_FINISHED` | 模型结束 | 输出摘要 |
| `FALLBACK_USED` | 使用本地兜底 | 原因摘要 |
| `OPTIONS_READY` | 推荐选项已生成 | `recommendationGroups` |
| `SNAPSHOT_DRAFT_READY` | 快照草稿已生成 | `snapshotDraft` 摘要 |
| `RUN_FINISHED` | 完整结果完成 | 完整 `AgentRunResponse` |
| `RUN_FAILED` | 本轮失败 | warning / error 摘要 |

实现任务：

- 新增 `PlannerStreamEvent` DTO。
- 将 `TraceRecorder` / Hooks 产出的 `userFacingEvents` 转成 stream events。
- 在 `PlannerAgent` 中增加 async generator，按阶段 yield event。
- DeepSeek 第一版不接 token streaming，只在阶段开始/结束、工具完成和最终结果时推送 SSE。
- 如果后续确实需要逐字输出，再单独做第二版 token streaming。
- fallback builder 也要走 stream 事件，保证无 API key 时前端仍有实时状态。
- 最终 `RUN_FINISHED` 事件包含完整 `AgentRunResponse`。

验收标准：

- `/agent/planner/stream` 能持续返回 SSE。
- 无 DeepSeek key 时，仍能流式返回状态和最终 fallback 响应。
- Java 即使只消费最后一个事件，也能得到与 `/run` 兼容的完整结果。
- 前端只在阶段结束或最终结果到达时整块渲染 Markdown，不要求 token 级增量展示。
- 测试覆盖正常路径、fallback 路径、缺槽位路径和最终事件结构。

## 5. 阶段 2：Java 渐进接入

目标：Java 后端先能稳定调用 Python Agent，并保存最终快照；复杂功能分批完成。

状态：第一批已执行。`ai-arrange-service` 已升级为 Java 编排/落库/WebSocket 接入层，能够通过 WebClient 调用 Python `/agent/planner/run` 和 `/agent/planner/stream`，并把最终 `AgentRunResponse.snapshotDraft` 保存成 Java 正式 `PlannerSnapshot`。`.mvnw` 不存在，已改用本机 `mvn test` 验证，当前为 `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`。

第一批 Java 接入范围：

- 新增 `PlannerAgentClient`。
- 支持调用 `/agent/planner/run` 和 `/agent/planner/stream`。
- HTTP timeout 必须大于 Agent runtime；当前默认 150 秒，Docker 长运行配置使用 270 秒。
- 定义 Java DTO，与 Python 当前字段保持兼容：
  - `planningMode`
  - `planningScope`
  - `targetDayIndex`
  - `targetDate`
  - `interaction`
  - `latestSnapshot`
  - `recommendationGroups`
  - `snapshotDraft`
  - `dayPlans`
  - `patchOps`
  - `checksum`
- Java 收到最终响应后保存正式 `PlannerSnapshot`。
- Java 分配正式 `version`，不直接使用 Python 的 `proposedVersion` 作为最终版本号。

本阶段已落地内容：

- 新增 `PlannerAgentClient` / `PythonPlannerAgentClient`，基于 WebClient 对接 Python Agent。
- 新增 `POST /ai-arrange/api/conversations/{conversationId}/planner/run`，用于 Java 侧同步触发 Agent 规划。
- WebSocket `PLANNER_CHAT_SEND` 改为消费 Python SSE，并转发 `PLANNER_TRACE_EVENT`、`PLANNER_OPTIONS_REFRESH`、`PLANNER_DATA_REFRESH`、`PLANNER_SNAPSHOT_SAVED`。
- 新增 Java 侧 Agent DTO，覆盖 `planningMode`、`planningScope`、`interaction`、`latestSnapshot`、`recommendationGroups`、`snapshotDraft`、`dayPlans`、`patchOps`、`checksum` 等字段。
- `PlannerSnapshot` 已扩展保存 `baseVersion`、`scope`、`targetDayIndex`、`currentDayIndex`、`completedDayIndexes`、`dayPlans`、`changeSummary`、`patchOps`、`checksum`、`traceId`、`agentToolCalls` 和 `agentWarnings`。
- `PlannerSnapshotService.createSnapshotFromAgentResponse` 由 Java 分配正式版本号，`snapshotDraft.proposedVersion` 只作为 Agent 建议值，不作为最终版本。
- 已基于 `conversationId + checksum` 做重复响应幂等保存；并发冲突、回滚后重规划、日计划确认和 diff 仍属于后续批次。

第二批 Java 接入范围：

- 幂等保存：基于 `conversationId + checksum`。
- 并发冲突：校验 `snapshotDraft.baseVersion` 是否等于当前最新版本。
- 版本历史查询。
- 回滚后重新规划。
- 日计划确认接口。

第三批 Java 接入范围：

- diff 接口。
- WebSocket 完整推送。
- 前端版本历史 / 回滚 / 差异展示。

验收标准：

- Java 可以完成初次 Day 1 生成、保存版本 1。
- Java 可以传入 version 1 的 `latestSnapshot`，生成 Day 1 修订或 Day 2。
- Java 可以保存 `dayPlans` 全量链路。
- Python 不直接写 MongoDB。

## 6. 阶段 3：中文文案统一

目标：所有用户可见状态、按钮、推荐选项、warning 的前端可展示文案统一为中文。

状态：已执行。fallback 响应、Markdown 固定标题、`assistantText`、`nextQuestion`、`recommendationGroups` 展示文案、工具 warning、trace/userFacingEvents 消息和 Java WebSocket/REST 错误提示已统一为中文；内部枚举值和协议字段仍保留英文。Python `pytest` 当前为 `34 passed`，Java `mvn test` 当前为 `Tests run: 6, Failures: 0, Errors: 0, Skipped: 0`。

任务：

- 将 `PlannerOption` 的 `label`、`description`、`impact` 改为中文。
- 将 fallback markdown 中的固定标题和提示改为中文。
- 将 `assistantText` 和 `nextQuestion` 的本地兜底文案改为中文。
- 保留内部枚举值英文，例如 `DAY_PLAN`、`ASK_USER_SELECTION`，便于前后端稳定对接。
- 文档说明：字段值是机器契约，展示文案是中文。

本阶段已落地内容：

- fallback Markdown 中的固定标题已改为中文，例如“天气参考”“预算估算”“到达交通候选”“推荐地点”“第 N 天”“路线估算”。
- fallback 的 `assistantText`、`title`、`summary`、`nextQuestion` 已改为中文。
- 推荐组选项的 `title`、`label`、`description`、`impact` 已改为中文，`optionId` 和枚举值继续保持英文契约。
- `snapshotDraft.changeSummary` 和 `patchOps.summary` 已改为中文。
- 工具 warning 和 `userMessage` 已统一为中文，外部接口未配置、mock 数据、限流、结构修复等提示不再直接露出英文解释。
- Prompt 中已明确要求模型返回中文用户可见字段。
- Java 侧 WebSocket/REST 错误提示已改为中文，避免把异常英文直接透给前端。

验收标准：

- 无 DeepSeek key 的 fallback 响应中，用户可见文本是中文。
- `recommendationGroups` 可直接给前端渲染中文。
- trace 中可保留英文技术字段，但 `userFacingEvents.message` 为中文。

## 7. 阶段 4：offer-provider 酒店 / 产品 adapter

目标：把酒店和内部产品从 mock-first 升级为真实 adapter，但仍保留 mock 模式。

这一步的业务作用：

- 把“可订酒店 / 可订产品”从纯 mock 候选变成真实业务候选。
- 让 Agent 生成的地点和选项能落到 Java 业务体系里的 offer 上。
- 支撑前端看到更可信的酒店、产品、价格、区域和可订状态。
- 让 `internalOfferId`、价格、区域、图片、标签等字段成为规划结果的一部分，而不是模型随便猜。

边界：

- Python 不直连数据库。
- Python 只通过 Java 提供的 offer-provider HTTP API 或内部服务地址查询。
- Java 仍负责鉴权和业务权限控制。

最小交付：

- 新增 provider 抽象：
  - `HotelProvider`
  - `MockHotelProvider`
  - `OfferProviderAdapter`
- 定义 offer-provider 返回数据到 `PlannerPlaceSuggestion` 的映射规则。
- 明确 `internalOfferId`、价格、区域、可订状态、图片、标签字段。
- 增加 adapter 开关：
  - mock 模式继续默认可跑。
  - real 模式需要配置 `OFFER_PROVIDER_BASE_URL`。
- 工具 warning 区分：
  - mock 数据
  - offer-provider 不可用
  - 部分产品不可订

验收标准：

- mock 模式测试稳定。
- real adapter 有契约测试或 fake server 测试。
- offer-provider 失败时不导致 Agent HTTP 500。
- 真实产品 ID 只来自 offer-provider，不由模型编造。

## 8. 阶段 5：高德 POI / 路线增强

目标：提升地图点位和路线质量。

任务：

- 增强 POI 搜索：
  - 城市歧义处理。
  - 地点去重。
  - 坐标补全。
  - 图片字段质量筛选。
  - 景点 / 餐厅 / 酒店类型映射优化。
- 增强路线：
  - 优先使用真实高德路线 API。
  - 无 key 或 API 失败时保留确定性估算。
  - route 上补充 `dayIndex`、交通方式、时间、距离。
- 将 Amap 结果纳入 trace summary，不暴露原始响应给前端。

验收标准：

- 有 key 时能真实补全 POI。
- 无 key 时仍走 fallback。
- 地图点位具备稳定 `placeId`。
- 被用户拒绝的点位不会重新作为主推荐。

## 9. 阶段 6：天气和交通 adapter

目标：将天气和交通从 mock 数据升级为真实或半真实 adapter。

任务：

- 新增 `WeatherProvider` 抽象和真实天气 adapter。
- 新增 `TransportProvider` 抽象和真实交通 adapter。
- 区分城市内交通、城际交通、到达离开交通。
- 真实接口不可用时 fallback 到 mock / 本地规则。

验收标准：

- adapter 失败不影响基础规划。
- budget 能使用真实交通价格或估算价格。
- Markdown 中能说明实时数据的不确定性。

## 10. 阶段 7：前端联调预留

目标：让前端基于 Java WebSocket 和 REST 接口完成交互式规划体验。

前端展示规则：

- Markdown 不需要 token 级滚动输出。
- 前端只在阶段完结时，或者最终结果到达时，整块刷新 Markdown。
- 其它实时体验主要来自状态事件、选项事件和快照保存事件。

前端优先组件：

- Day Tabs / 日计划进度。
- 当前日 Markdown 面板。
- 推荐选项组件。
- 地图点位面板。
- 自由反馈输入框。
- 保存状态提示。

后续组件：

- 版本历史。
- 回滚。
- diff 展示。
- 版本冲突处理。

前端只消费 Java 输出，不直接调用 Python Agent。

## 11. 测试策略

每个阶段都需要保留以下回归：

- 无外部 key 的 fallback 路径。
- 缺少必填槽位路径。
- Day 1 生成。
- Day 1 修订。
- Day 2 生成。
- 回滚到旧 snapshot 后重新规划。
- 所有 day plans 确认后的 `TRIP_ASSEMBLE`。
- stream 最终事件包含完整 `AgentRunResponse`。
- trace 和 stream 不泄露 API key、Authorization、Cookie、用户自由文本明文。

推荐命令：

```powershell
cd E:\2026spring\26NULLptr\repositories\travel-api\ai-arrange-agent-service
.\.venv\Scripts\python.exe -m pytest
```

## 12. 已确认事项

当前已确认：

- Python 到 Java 的流式协议采用 SSE。
- 第一版只做阶段状态流 + 最终完整结果。
- Java 使用 WebClient 消费 Python 的流。
- 前端只需要在阶段结束或最终结果时整块渲染 Markdown。

仍需后续补齐的是 offer-provider 的真实接口细节，但这不影响第一阶段先把 adapter 抽象、mock 流程和业务作用写清楚。
