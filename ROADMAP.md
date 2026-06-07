# NULLptr AI Travel 路线图

> 更新时间：2026-06-07
> 范围：`travel-ui`、`ai-arrange-service`、`ai-arrange-agent-service`、后续订票系统合并、社区发帖系统开发。

## 1. 文档定位

这份路线图是项目级交付计划，用来说明后续先做什么、为什么这样排、每个阶段做到什么程度算完成。它不替代已有模块文档，而是作为总入口使用：

- `DEVELOPMENT.md`：当前架构、运行方式和模块边界。
- `travel-api/ai-arrange-agent-service/NEXT-DEVELOPMENT-PLAN.md`：Python Agent 内部迭代计划。
- `travel-api/ai-arrange-service/README.md`：Java AI 服务接口和运行说明。
- `travel-ui/README.md`：前端运行方式和当前页面状态。

整体路线原则：

1. 先稳定 AI 规划闭环。
2. 再把已完成的订票系统作为独立业务模块合并进来。
3. 然后开发社区发帖系统 MVP。
4. 最后打通 AI 规划、订票、社区发布三条产品链路。

## 2. 当前基线

### 2.1 仓库范围

当前分支只保留 AI 出行规划相关栈：

| 模块 | 路径 | 当前状态 |
| --- | --- | --- |
| 前端 | `travel-ui` | React + TypeScript + MUI。当前主要维护 AI 规划页，旧报价/订票页面代码仍保留，后续需要重新对接新订票系统。 |
| Java AI 服务 | `travel-api/ai-arrange-service` | Spring Boot REST/WebSocket 入口，负责会话、消息、MongoDB 快照、正式版本号和前端协议。 |
| Python Agent | `travel-api/ai-arrange-agent-service` | FastAPI 规划引擎，负责模型调用、工具编排、兜底规划、结构化行程输出和 SSE 事件。 |
| 运行脚本 | `travel-api/docker-compose.yml`、`travel-api/scripts` | 当前最小后端运行链路和 smoke test。 |

旧项目里的 Gateway、Eureka、酒店、交通、报价、预订、支付、用户、数据生成等微服务已经不属于当前分支范围。

### 2.2 已具备的 AI 规划能力

当前 AI 规划链路已经具备：

- 前端通过 Java `ai-arrange-service` 进入 REST/WebSocket。
- Python Agent 提供 `/agent/planner/run` 和 `/agent/planner/stream`。
- Python 通过 SSE 输出阶段事件，Java 转成 WebSocket 推给前端。
- Java 将会话和版本化 `PlannerSnapshot` 保存到 MongoDB。
- 正式快照版本号由 Java 分配。
- 已基于 `conversationId + checksum` 做重复响应的幂等保存。
- 用户可见状态文案已统一为中文。
- 没有外部模型/API Key 时仍可返回结构化兜底行程。
- Agent 协议中已有地图点位、路线、推荐选项、日计划和快照草稿。

### 2.3 待完成业务模块

| 模块 | 当前状态 | 路线图决策 |
| --- | --- | --- |
| AI 规划系统 | 已有可运行基线 | 继续作为核心产品面，优先稳定。 |
| 订票系统 | 已完成但不在当前分支 | 作为新的独立业务模块合并，不恢复旧微服务。 |
| 发帖系统 | 尚未开发 | 订票合并后开发 MVP，先做小闭环。 |
| 用户/账号体系 | 当前分支未包含完整实现 | 暂时显式传 `userId`，等订票/社区需要权限时再补正式鉴权。 |

## 3. 总体里程碑

| 里程碑 | 目标 | 完成效果 |
| --- | --- | --- |
| M0 | 仓库裁剪和文档对齐 | 当前分支范围清晰，只保留前端、AI 服务、Agent 和必要运行脚本。 |
| M1 | AI 规划稳定化 | 用户能完成一次规划、接收状态事件、查看地图点位和保存快照。 |
| M2 | AI 规划产品化打磨 | 日计划、版本历史、回滚重规划和前端状态变得可演示、可回归。 |
| M3 | 合并订票系统 | AI 推荐能跳转真实订票详情，并完成下单、支付或模拟支付、取消。 |
| M4 | 社区发帖 MVP | 用户能发布、浏览、评论、点赞、收藏帖子。 |
| M5 | AI + 订票 + 社区联动 | AI 行程能引导订票，完整行程能生成游记草稿。 |
| M6 | 发布前加固 | 测试、日志、错误处理、文档、部署和演示流程完整。 |

## 4. 阶段计划

## Phase 0：仓库基线和文档

状态：已完成 / 基本完成

目标：让当前分支边界清晰，后续成员能快速理解项目。

主要任务：

- 从当前运行链路中移除旧旅游微服务依赖。
- 保留最小后端链路：MongoDB、Java AI 服务、Python Agent。
- 文档化前后端环境变量。
- 文档化订票系统合并方案和发帖系统方向。
- 保持根目录 README、`DEVELOPMENT.md` 和各模块 README 口径一致。

交付物：

- 根目录 README 说明当前保留模块。
- `DEVELOPMENT.md` 说明架构、接口、订票合并和发帖方案。
- 后端可通过以下命令启动：

```powershell
cd travel-api
docker compose up -d --build mongo ai-arrange-agent ai-arrange
```

验收标准：

- `travel-api` 下执行 `docker compose config --services` 能看到当前 AI 运行服务。
- `.\scripts\ai-arrange-smoke-test.ps1` 能验证 AI 规划链路。
- 文档不再暗示旧 Gateway/Eureka 架构是必需运行条件。

## Phase 1：AI 规划稳定化

建议周期：第 1 周

目标：把 AI 规划链路稳定到可以承接订票和社区功能。

后端任务：

- 验证 `POST /ai-arrange/api/conversations/{conversationId}/planner/run` 调用 Python `/agent/planner/run`。
- 验证 WebSocket `PLANNER_CHAT_SEND` 消费 Python `/agent/planner/stream`。
- 保证每个最终 Agent 响应都能创建或复用合法 `PlannerSnapshot`。
- 补齐 `snapshotDraft.baseVersion` 的并发版本冲突处理。
- 为重复 checksum、旧 baseVersion、Agent 超时、Agent 不可用提供明确响应。
- 继续保持 Python Agent 不直接写 MongoDB。

Agent 任务：

- 保持 `/agent/planner/run` 向后兼容。
- 继续把 `/agent/planner/stream` 作为 Java 集成优先路径。
- 强化模型 JSON 输出校验、修复和兜底。
- 防止 API Key、Authorization、Cookie、系统 prompt、模型思维链泄露。
- 细化 warning 类型：模型超时、外部 API 未配置、外部 API 调用失败、兜底已启用。

前端任务：

- 确认 AI 规划页只消费 Java REST/WebSocket，不直接调用 Python。
- 展示阶段状态事件，但不展示内部 trace JSON。
- 把兜底规划当成正常可用行程展示。
- 地图面板同时支持 mock 数据和高德 JS Key。

交付物：

- 稳定的 AI 规划端到端 smoke test。
- Java 覆盖 Agent client、快照保存、幂等和冲突路径。
- Python 覆盖 stream 最终事件、兜底、缺槽位、模型输出非法路径。

验收标准：

- 无外部 Key 时，用户仍能获得结构化兜底行程。
- 配置 `DEEPSEEK_API_KEY` 后，用户能获得模型生成的结构化行程。
- 配置 `AMAP_API_KEY` 后，后端能增强 POI / 路线数据。
- 前端能收到状态、推荐选项、地图数据和快照保存事件。
- 同一个最终 Agent 响应不会重复创建快照。

## Phase 2：AI 规划产品化打磨

建议周期：第 2 周

目标：让 AI 规划从“能跑通”变成“用户能理解、能恢复、能继续编辑”的产品流程。

后端任务：

- 新增或完善版本历史接口：

```text
GET  /ai-arrange/api/conversations/{conversationId}/snapshots
GET  /ai-arrange/api/conversations/{conversationId}/snapshots/{version}
POST /ai-arrange/api/conversations/{conversationId}/snapshots/{version}/rollback
GET  /ai-arrange/api/conversations/{conversationId}/snapshots/{fromVersion}/diff/{toVersion}
```

- 新增日维度操作：
  - 确认当前日。
  - 修订当前日。
  - 生成下一天。
  - 全部日期确认后汇总完整行程。
- 稳定保存 `dayPlans`、`currentDayIndex`、`completedDayIndexes`、`patchOps`、`checksum`、`traceId`。

前端任务：

- 增加 Day Tabs 或日计划进度条。
- 把 `recommendationGroups` 渲染为可交互组件。
- 增加版本历史面板。
- 增加回滚和基于旧版本重规划入口。
- 展示清晰保存状态：生成中、保存中、已保存为版本 N、版本冲突、失败。
- 保证桌面端和移动端都能完成核心规划流程。

Agent 任务：

- 稳定 `planningScope=DAY_PLAN`、`DAY_REFINE`、`TRIP_ASSEMBLE`。
- 用户拒绝的点位不再作为主推荐出现。
- 用户选择的点位在下一版快照中保持选中状态。
- 优化路线强度、预算估计和 Markdown 表述。

交付物：

- 完整演示链路：创建规划 -> 选择/拒绝推荐 -> 修订 -> 确认当天 -> 汇总完整行程。
- 可以从历史版本回滚，并以旧版本作为新的规划基线。
- 用户能看懂每次修订改变了什么。

验收标准：

- 用户能从一次不满意的 AI 修订中恢复。
- 用户能完成多日计划，不需要手动编辑 JSON 或 Markdown。
- Java 仍是唯一的 MongoDB 规划状态写入方。

## Phase 3：订票系统合并

建议周期：第 3-4 周

目标：把已完成订票系统作为清晰业务模块合并，并让 AI 推荐能进入可订产品。

架构决策：

- 不恢复旧 `hotel-service`、`transport-service`、`offer-provider-service`、`reservation-service`、`payment-service`。
- 将已完成订票系统作为独立模块或服务接入，例如 `booking-service`。
- Java AI 服务通过明确 adapter 调用订票接口。
- Python Agent 只能通过 Java 提供的上下文或受控 provider API 获取可订候选，不直接读订票数据库。

最小订票接口：

```text
GET  /booking/offers/search
GET  /booking/offers/{offerId}
POST /booking/orders
GET  /booking/orders/{orderId}
POST /booking/orders/{orderId}/pay
POST /booking/orders/{orderId}/cancel
```

后端任务：

- 合并或挂载订票模块。
- 定义 `BookingOffer` 和 `BookingOrder` DTO。
- 新增 Java 侧 offer search / offer detail adapter。
- 将订票 offer 映射到 AI 规划中的可订对象：

```json
{
  "placeId": "uuid",
  "name": "酒店或产品名称",
  "type": "HOTEL",
  "source": "INTERNAL_OFFER",
  "internalOfferId": "booking-system-offer-id"
}
```

- 下单前刷新可订状态和价格。
- 根据订票系统现状接入支付或模拟支付。

Agent 任务：

- 新增或完善 `OfferProviderAdapter` / booking provider 抽象。
- 保留 mock provider 作为本地默认兜底。
- `internalOfferId` 只能来自订票/provider 数据，不能由模型编造。
- 产品不可用或过期时返回 warning，不导致 Agent HTTP 500。

前端任务：

- 将旧报价/详情/购买页面重新对接新订票接口，或用新页面替换。
- 在 AI 推荐酒店/产品卡片上增加“预订”入口。
- 展示价格、库存、取消政策和订单状态。
- 订票状态和规划快照状态保持分离。

交付物：

- AI 推荐酒店/产品可以打开真实订票详情页。
- 用户可以从可订 offer 创建订单。
- 用户可以支付或模拟支付，并可以取消订单。

验收标准：

- 订票服务不可用时，AI 行程仍然可用，订票动作给出友好错误。
- 创建订单前必须校验最新库存和价格。
- 同一个 offer ID 在 AI 展示和订票详情中保持一致。

## Phase 4：社区发帖 MVP

建议周期：第 5-6 周

目标：做出第一版可用社区闭环，同时避免污染 AI 规划服务。

架构决策：

- 发帖能力作为独立模块，例如 `post-service`，或者在单体 Spring Boot 内保持清晰包边界。
- 帖子持久化和 planner snapshots 分离。
- 从 AI 行程生成帖子时，只保存 planner conversation / snapshot 引用。

MVP 后端接口：

```text
POST   /posts
GET    /posts
GET    /posts/{postId}
PUT    /posts/{postId}
DELETE /posts/{postId}
POST   /posts/{postId}/comments
GET    /posts/{postId}/comments
DELETE /posts/{postId}/comments/{commentId}
POST   /posts/{postId}/likes
DELETE /posts/{postId}/likes
POST   /posts/{postId}/favorites
DELETE /posts/{postId}/favorites
```

核心数据模型：

- `Post`：id、authorId、title、content、city、tags、imageUrls、sourcePlannerConversationId、sourceSnapshotVersion、计数字段、时间戳、状态。
- `Comment`：id、postId、authorId、content、时间戳。
- `PostReaction`：postId、userId、type。
- `PostFavorite`：postId、userId。

后端任务：

- 实现帖子 CRUD 和作者权限检查。
- 实现评论、点赞、收藏。
- 增加分页、城市筛选、标签筛选。
- 预留软删除或 status 字段，方便后续审核。
- 增加正文长度和图片 URL 校验。

前端任务：

- 新增帖子列表页。
- 新增帖子详情页。
- 新增帖子编辑/发布页。
- 新增评论、点赞、收藏交互。
- 在导航中加入社区入口，不影响 AI 规划页。

交付物：

- 用户可以发布、浏览、查看、评论、点赞、收藏帖子。
- 帖子可以选择性关联 planner conversation / snapshot。

验收标准：

- 删除帖子不会删除原始 planner snapshot。
- 发帖失败不会影响 AI 规划或订票。
- 列表和详情页具备加载、空状态、错误、分页状态。

## Phase 5：AI + 订票 + 社区联动

建议周期：第 7-8 周

目标：把三个产品面串成完整旅行 workflow。

AI 到订票：

- 在规划结果中标记可订酒店/产品。
- 用户可从 AI 行程跳转到订票详情。
- 用户可从订单详情回到来源规划快照。

AI 到社区：

- 完整行程页面增加“生成游记草稿”入口。
- 将 itinerary markdown、城市、点位、路线、标签转成帖子草稿。
- 用户发布前必须能编辑。
- 帖子保存 `sourcePlannerConversationId` 和 `sourceSnapshotVersion`。

订票到社区：

- 用户愿意时，可把已完成订单/行程作为发帖上下文。
- 公共帖子不得默认暴露私密订单信息。

后端任务：

- 增加草稿生成接口，例如：

```text
POST /posts/drafts/from-planner
```

- 校验用户拥有来源 planner conversation / snapshot。
- 保存或发布前清洗 AI 生成内容。
- 保留可追溯字段，但不复制私密订票/订单数据到公共内容。

前端任务：

- 在完整行程页添加“生成游记草稿”按钮。
- 自动填充标题、城市、标签和正文。
- 用户编辑后再发布。
- 公共帖子可在合适场景链接回非私密行程摘要。

交付物：

- 用户能完成：规划行程 -> 选择可订产品 -> 下单 -> 从行程生成游记草稿 -> 发布帖子。

验收标准：

- 公共帖子不暴露原始 planner trace、用户私密上下文、支付信息或内部订单元数据。
- AI 生成草稿保持用户可编辑、可控制。
- 跨模块链接使用引用，不复制业务状态。

## Phase 6：加固、观测和发布

建议周期：持续进行，Phase 5 后集中收口

目标：让系统达到演示、验收和后续开发都比较稳的状态。

测试：

- Python Agent：覆盖 fallback、stream、输出校验、日计划、provider adapter。
- Java 服务：覆盖 Agent client、快照服务、版本冲突、幂等、订票和发帖接口。
- 前端：覆盖 planner 状态、订票状态、帖子列表/详情/编辑组件。
- E2E smoke test：覆盖 AI 规划、订票下单、发帖发布。

观测：

- 保留 Python `traceId`，并贯穿 Java 日志和快照。
- 订票和发帖接口增加 request id。
- 用户可见状态和内部日志分离。
- 脱敏 API Key、Authorization、Cookie、手机号、支付数据、私密订单数据。

运行准备：

- 文档化所有 `.env` 字段。
- 保持无 Key 兜底模式可运行，方便本地演示。
- 提供清晰的前后端启动命令。
- 提供一份稳定 demo script。
- 说明 Docker 镜像依赖，尤其是前端基础镜像。

发布验收：

- 全新 clone 后，能按文档启动最小 AI 后端和前端。
- 没有外部 Key 时，smoke test 通过并使用兜底/mock 数据。
- 配置 Key 后，模型和地图增强可用。
- 订票和发帖模块失败时，不会拖垮 AI 规划页面。

## 5. 横向技术债

| 领域 | 技术债 | 建议处理 |
| --- | --- | --- |
| 前端旧订票页面 | 仍指向旧接口 | Phase 3 中重新对接新订票 API 或替换页面。 |
| 用户鉴权 | 当前主要靠显式 `userId` | 订票/社区需要所有权校验时补正式鉴权。 |
| 真实旅行数据 | 很多 Agent 工具仍是 mock-first | 用 provider/adapter 接真实数据，同时保留 mock 兜底和契约测试。 |
| 模型输出稳定性 | LLM 可能返回非法或截断 JSON | schema 校验、repair、fallback 必须保留。 |
| 版本冲突 | 已有幂等基础，旧版本冲突还需完善 | Java 拒绝 stale `baseVersion`，前端提供可恢复状态。 |
| Trace 存储 | Python trace 主要在日志中 | Java 状态保留 `traceId`，需要时再做 trace 查询。 |
| 内容审核 | 发帖 MVP 暂无完整审核 | 先预留 status/review/report 字段，后续再实现审核流。 |
| 部署 | 前端 Docker 依赖基础镜像拉取 | 文档说明镜像源/代理，或本地开发优先。 |

## 6. 推荐依赖顺序

建议实现顺序：

1. 稳定 AI 规划和 snapshot/version 行为。
2. 打磨规划前端状态和恢复路径。
3. 合并订票模块，并固定清晰 API。
4. 将 AI 推荐连接到订票 offer。
5. 开发发帖 MVP。
6. 增加 AI 行程生成帖子草稿能力。
7. 补齐测试、日志、文档和演示脚本。

明确避免：

- 不恢复旧 Gateway/Eureka/RabbitMQ 作为必需运行基础设施。
- 不让 Python Agent 直接写 MongoDB 或订票数据库。
- 不让前端直接调用 Python Agent。
- 不让模型编造 `internalOfferId`。
- 不把公开帖子和私密订单/支付数据混在一起。
- 不让订票或发帖失败影响 AI 规划页基础可用性。

## 7. 最终演示目标

最终集成演示应能覆盖：

1. 从干净仓库启动后端和前端。
2. 打开 `/ai-planner`。
3. 输入城市、日期、人数和偏好。
4. 看到 AI 阶段状态，并获得结构化行程。
5. 选择或拒绝推荐地点。
6. 保存或修订规划快照。
7. 从行程打开可订酒店/产品详情。
8. 创建订单并支付或模拟支付。
9. 返回完整行程。
10. 从行程生成游记草稿。
11. 编辑并发布帖子。
12. 在社区列表和详情页查看帖子。

## 8. 完成定义

一个阶段只有同时满足以下条件，才算完成：

- 主要用户流程能从前端走通。
- 后端 API 覆盖成功、参数错误、依赖失败三类测试。
- 本地 fallback/mock 模式仍然可运行。
- 对应 README 或根目录文档已经更新。
- 错误可恢复，用户可见文案为中文。
- 新代码不依赖已经移除的旧微服务架构。

