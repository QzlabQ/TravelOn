# AI 规划可靠性与交互简化设计

## 背景

当前 AI 规划链路是：React 页面通过 WebSocket 连接 `ai-arrange-service`，Java 服务调用 Python Agent 的 SSE 接口，Agent 返回终止事件后 Java 保存 MongoDB 快照，再通过 WebSocket 推送数据刷新事件。

现有问题有三个方面：

1. 浏览器 WebSocket 断开时，后台任务可能仍在执行并产生模型用量，但浏览器没有收到 `RUN_FINISHED`、`PLANNER_DATA_REFRESH` 或 `PLANNER_SNAPSHOT_SAVED`，页面也没有可靠的恢复查询。
2. 主页面同时展示基础表单、地图、推荐卡、日计划、Markdown、版本和调试进度，默认信息层级过深。
3. 悬浮窗的“优化当天”使用了“当前选中的地点和偏好”这一描述，但界面没有对应的地点名称和偏好选择状态；“智能修改”动作直接发送请求，不能先选择多个偏好再统一应用。

## 目标

- WebSocket 断开、重连或浏览器恢复后，已完成的 AI 运行可以从服务端读取并显示，不依赖恰好收到最后一条 WebSocket 消息。
- 同一运行请求具有客户端生成的 `runId`，重连和重复提交不会因为页面状态不确定而重复触发同一次运行。
- 服务端在运行开始、成功、失败时持久化运行状态；运行结果快照仍由现有快照服务保存。
- 悬浮窗显示当前天数、选中的地点名称和已选智能偏好；智能偏好使用多选复选框，并通过一个明确的“应用偏好”操作发送。
- 主界面默认只突出当前规划结果和必要操作，高级信息可以展开查看；保留现有 MUI、Tailwind 和颜色体系。

## 非目标

- 不把 Python Agent 的 SSE 改造成消息队列。
- 不增加 Redis、RabbitMQ 或新的持久化服务来保存运行状态。
- 不改变现有 Agent 请求字段的含义和快照版本规则。
- 不删除历史快照、Markdown 编辑和社区转发能力，只调整其默认展示层级。

## 运行可靠性设计

### 运行状态

在 `PlannerConversation` 中增加当前运行信息：

- `activeRunId`: 当前运行的客户端唯一 ID。
- `activeRunStatus`: `RUNNING`、`SUCCEEDED`、`FAILED` 或空值。
- `activeRunTargetDayIndex`: 本次运行目标日。
- `activeRunTraceId`: Python Agent 返回的 trace ID。
- `activeRunStartedAt` 和 `activeRunUpdatedAt`: 用于判断状态新鲜度和展示恢复信息。
- `activeRunErrorCode` 和 `activeRunErrorMessage`: 失败时供前端显示。

一次新的 `PLANNER_CHAT_SEND` 在调用 Agent 前保存 `RUNNING` 状态。Agent 成功并完成快照保存后保存 `SUCCEEDED` 状态和 trace ID；Agent 或快照保存失败时保存 `FAILED` 状态。状态更新必须在 WebSocket 推送之前完成，因此没有浏览器连接时也能恢复。

### WebSocket 协议

新增消息类型 `PLANNER_SYNC` 和 `PLANNER_RUN_STATE`。

- 浏览器连接建立后发送 `PLANNER_SYNC`，携带当前 `runId`（可为空）。
- 服务端验证会话权限后返回 `PLANNER_RUN_STATE`，携带当前运行状态、`runId`、目标日、trace ID、错误信息和服务端当前会话/快照版本。
- 如果状态是 `SUCCEEDED`，服务端同时发送现有的 `PLANNER_DATA_REFRESH` 和 `PLANNER_SNAPSHOT_SAVED`，前端按普通完成流程处理。
- 如果状态是 `RUNNING`，前端保持忙碌状态，等待后续事件；如果本次运行来自页面重连前的 `runId`，不得再次发送 Agent 请求。
- 如果状态是 `FAILED`，前端显示失败状态并允许用户重新提交。

运行状态消息和数据刷新消息都应包含 `runId`，前端忽略不属于当前运行的旧消息，避免快速切换会话或重连时污染页面。

### HTTP 恢复

现有 `GET /ai-arrange/api/conversations/{conversationId}` 和快照列表接口继续作为恢复来源。WebSocket 连接建立后和异常关闭后，前端调用现有接口读取最新会话与快照；若发现服务端运行已成功，则直接应用最新快照。这样即使 `PLANNER_DATA_REFRESH` 丢失，页面仍能显示结果。

前端在运行期间断线不立即把运行标记为完成，也不立即清除忙碌状态；它进入“等待恢复”状态。重连同步或 HTTP 查询确认成功/失败后再结束运行。达到有限的恢复次数仍没有结果时，显示连接问题和“重新检查”操作，不自动重复消耗模型额度。

### Java 到 Python 的 SSE

保留现有 `RUN_FINISHED`、`RUN_FAILED` 终止事件要求。SSE 正常终止后才进入结果落库；SSE 断流或超时统一标记当前运行失败并持久化错误。终止事件没有完整响应时不得标记成功。Java 服务的 WebSocket 推送失败不影响运行状态和快照保存。

## 前端交互设计

### 主界面

会话未创建时默认显示必要基础信息：目的地、日期、人数、模型模式和开始规划。预算、住宿、交通、想去/避开关键词和补充说明收进“更多偏好”折叠区域。

会话创建后默认显示：

- 顶部行程摘要：出发地、目的地、日期、人数。
- 当前日计划切换和一个主要操作区域。
- 当前日 Markdown 结果。
- 地图和推荐地点作为可展开的规划参考区域。

版本历史、差异、Markdown 编辑和社区转发继续可用，但不与当前结果争夺默认视觉层级。

### 悬浮窗上下文

悬浮窗打开后在操作区上方显示“当前规划上下文”：

- `第 N 天` 和日期。
- 已选地点名称列表；没有选择时显示“未选择地点”。
- 已选智能偏好名称列表；没有选择时显示“未选择偏好”。

地点名称从现有 `PlannerPlaceSuggestion[]` 根据 `selectedPlaceIds` 计算，不新增后端请求。

“智能修改”使用复选框，每个选项有稳定 ID、显示名称和发送给 Agent 的简短值。选项初始为空，勾选只改变本地选择，不发送请求。点击“应用偏好”时将选中的值写入 `PlannerInteractionInput.freeText`，同时带上选中的地点 ID，并生成可读消息：

- 有地点和偏好：`请基于第 N 天已选地点：A、B，并应用偏好：放慢节奏、减少换乘，优化当天行程。`
- 只有地点：`请基于第 N 天已选地点：A、B，优化当天行程。`
- 只有偏好：`请将第 N 天行程应用偏好：放慢节奏、减少换乘并重新优化。`
- 两者都没有：`请基于第 N 天当前行程进行优化。`

“优化当天”使用同一套上下文构造函数，不再写死“当前选中的地点和偏好”。

### 信息折叠

悬浮窗默认只展示当前进度、日计划操作、上下文和聊天输入。详细进度事件、票务推荐和历史消息保持可展开或滚动查看。一次只保留一个主要动作，避免“生成当天”“优化当天”“确认当天”等动作与智能修改选项同时形成相同视觉权重。

## 错误处理

- Agent 不可达：运行状态置为 `FAILED`，错误码为 `PLANNER_AGENT_UNAVAILABLE`。
- SSE 断流或缺少终止事件：运行状态置为 `FAILED`，错误码为 `PLANNER_AGENT_STREAM_FAILED`。
- 快照保存失败：运行状态置为 `FAILED`，错误码为 `PLANNER_SNAPSHOT_SAVE_FAILED`。
- WebSocket 断开但运行仍为 `RUNNING`：不重复调用 Agent，页面显示等待恢复；HTTP/WS 同步确认最终状态。
- 快速重复点击：前端在运行中禁用发送；服务端以 `runId` 检查当前活动运行，重复 `runId` 只返回当前状态，不启动第二次 Agent 调用。

## 测试设计

### Java

- 流式响应正常包含 `RUN_FINISHED` 时解析成功。
- 流式响应缺少终止事件时失败。
- `RUN_FAILED`、SSE 连接异常和快照保存异常会写入失败运行状态。
- 运行完成后先持久化状态/快照，再发送 WebSocket 更新。
- `PLANNER_SYNC` 在运行中、成功、失败和无活动运行四种状态下返回正确数据；重复 `runId` 不启动第二次运行。

### React

- WebSocket 断开时保留运行中的状态，不把请求误判为已完成。
- 重连后通过同步/HTTP 读取的最新快照更新 Markdown 和推荐地点。
- 选中复选框只更新偏好状态；点击应用时生成包含真实地点名和偏好的消息。
- 无地点、无偏好、只有地点、只有偏好四种上下文消息均符合规则。
- 悬浮窗默认状态不渲染全部高级操作，展开后仍可以访问详细进度和历史消息。

## 兼容性

旧浏览器连接只发送现有消息时，服务端仍按现有 `PLANNER_CHAT_SEND` 处理；没有 `runId` 的请求由 Java 服务生成兼容 ID。旧会话文档缺少 active run 字段时按“无活动运行”处理。前端本地缓存读取时对新增字段使用空值默认值。
