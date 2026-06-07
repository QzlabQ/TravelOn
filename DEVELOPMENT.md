# AI 规划出行项目开发文档

## 1. 项目定位

本项目是一个包含前端与后端的 AI 规划出行系统。当前分支来源于旧旅游微服务项目，但除 AI 模块外的后端服务均属于旧项目遗留内容，已从当前分支裁剪。

当前分支保留范围：

- 前端：`travel-ui`
- AI 规划 Java 服务：`travel-api/ai-arrange-service`
- AI 规划 Python Agent：`travel-api/ai-arrange-agent-service`
- AI 后端运行编排与测试脚本：`travel-api/docker-compose.yml`、`travel-api/scripts`

不再保留的旧后端服务：

- `api-gateway`
- `discovery-service`
- `hotel-service`
- `transport-service`
- `offer-provider-service`
- `reservation-service`
- `payment-service`
- `user-service`
- `data-generator`

## 2. 当前系统架构

```text
travel-ui
  -> ai-arrange-service
      -> MongoDB
      -> ai-arrange-agent-service
          -> DeepSeek
          -> AMap
          -> mock travel tools
```

### 2.1 前端 `travel-ui`

前端使用 React + TypeScript + MUI。当前主要可用能力是 AI 规划页面：

- 固定槽位填写：目的地、日期、人数、偏好、预算等。
- AI 对话：通过 WebSocket 与后端交互。
- Markdown 行程展示：显示 AI 生成的结构化行程。
- 地图点位展示：支持高德 JS 地图或 mock 数据。
- 历史快照：查看不同版本的规划结果。

前端中仍保留旧项目的报价/订票页面代码。这些页面依赖旧项目后端接口，当前分支不再维护对应旧微服务。后续应在订票系统合并时重新对接，而不是恢复旧后端。

### 2.2 Java AI 服务 `ai-arrange-service`

职责：

- 对前端提供 REST 和 WebSocket。
- 管理规划会话、消息、地图选点和版本快照。
- 调用 Python Agent 获取规划结果。
- 将规划结果持久化到 MongoDB。
- 向前端推送进度事件、结果刷新和错误信息。

关键接口：

- `POST /ai-arrange/api/conversations`
- `GET /ai-arrange/api/conversations?userId={uuid}`
- `GET /ai-arrange/api/conversations/{conversationId}?userId={uuid}`
- `PUT /ai-arrange/api/conversations/{conversationId}/core-slots`
- `PUT /ai-arrange/api/conversations/{conversationId}/selection`
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots?userId={uuid}`
- `POST /ai-arrange/api/conversations/{conversationId}/planner/run`
- `ws://host/ai-arrange/ws/planner?conversationId={uuid}&userId={uuid}`

### 2.3 Python Agent `ai-arrange-agent-service`

职责：

- 调用 DeepSeek 生成规划内容。
- 使用工具链进行 POI、酒店候选、天气、交通、预算、路线等辅助规划。
- 在外部 Key 缺失或模型不可用时返回结构化兜底方案。
- 通过 SSE 向 Java 服务输出执行过程与最终结果。

关键接口：

- `GET /agent/health`
- `POST /agent/planner/run`
- `POST /agent/planner/stream`

## 3. 业务模块状态

| 模块 | 当前状态 | 当前分支处理方式 | 后续任务 |
| --- | --- | --- | --- |
| AI 规划系统 | 已有可运行主体 | 保留并作为当前核心后端 | 完善模型提示词、真实工具接入、异常降级和体验优化 |
| 订票系统 | 已完成，但不属于当前分支旧微服务 | 不恢复旧酒店/交通/支付微服务 | 从已完成订票系统分支/仓库合并，统一接口和前端入口 |
| 发帖系统 | 尚未开发 | 在文档中定义开发方案 | 新增帖子、评论、点赞、收藏、审核等能力 |

## 4. 运行方式

### 4.1 后端

在 `travel-api/.env` 配置：

```env
DEEPSEEK_API_KEY=
AMAP_API_KEY=
DEEPSEEK_MODEL=
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_THINKING_TYPE=disabled
DEEPSEEK_MAX_TOKENS=12000
DEEPSEEK_SLOW_RESPONSE_WARNING_MS=60000
```

前端 AI 规划页默认使用 Flash 模型模式，页面中可切换为 Pro。

启动：

```powershell
cd travel-api
docker compose up -d --build mongo ai-arrange-agent ai-arrange
```

该命令只启动 MongoDB、Python Agent 和 Java AI 服务。前端默认使用本地 `yarn start` 启动；若要构建 `front` Docker 服务，需要先解决 Docker Hub 镜像源/代理问题，或预拉取 `node:21-alpine` 与 `nginx:1.25-alpine`。

默认端口：

- `ai-arrange-service`：`http://localhost:8082`
- `ai-arrange-agent-service`：`http://localhost:8090`
- MongoDB：`localhost:27017`

验证：

```powershell
.\scripts\ai-arrange-smoke-test.ps1
```

### 4.2 前端

在 `travel-ui/.env` 配置：

```env
REACT_APP_API_HOSTNAME=localhost
REACT_APP_API_PORT=8082
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

启动：

```powershell
cd travel-ui
corepack enable
yarn
yarn start
```

## 5. 订票系统合并方案

订票系统已完成，后续合并时建议遵循以下原则：

1. 不恢复旧项目的 `hotel-service`、`transport-service`、`offer-provider-service`、`reservation-service`、`payment-service`。
2. 将已完成订票系统作为独立业务模块接入，可以命名为 `booking-service` 或按已有项目命名保留。
3. 前端保留“从 AI 推荐进入预订”的跳转能力，但实际下单接口以新订票系统为准。
4. AI 规划结果中的可订对象使用稳定字段承接：

```json
{
  "placeId": "uuid",
  "name": "酒店或产品名称",
  "type": "HOTEL",
  "source": "INTERNAL_OFFER",
  "internalOfferId": "booking-system-offer-id"
}
```

建议订票系统提供的最小接口：

- `GET /booking/offers/search`：按城市、日期、人数、预算查询可订产品。
- `GET /booking/offers/{offerId}`：查询产品详情。
- `POST /booking/orders`：创建订单。
- `GET /booking/orders/{orderId}`：查询订单状态。
- `POST /booking/orders/{orderId}/pay`：支付或模拟支付。
- `POST /booking/orders/{orderId}/cancel`：取消订单。

AI 与订票系统的集成流程：

```text
AI 生成行程
  -> Agent 标记可订酒店/产品候选
  -> Java 服务把 internalOfferId 推送给前端
  -> 用户点击预订
  -> 前端跳转订票系统详情页
  -> 用户确认并下单
```

## 6. 发帖系统开发方案

发帖系统尚未开发，建议作为独立模块新增，避免和 AI 规划服务混杂。

### 6.1 功能范围

第一阶段：

- 发布帖子：标题、正文、图片、城市、标签。
- 帖子列表：按时间、城市、标签查询。
- 帖子详情：正文、作者、发布时间、互动数据。
- 评论：新增、列表、删除自己的评论。
- 点赞和收藏。

第二阶段：

- 用户主页与帖子归档。
- AI 行程一键生成游记草稿。
- 内容审核、举报、后台管理。
- 热门榜、推荐流。

### 6.2 后端建议接口

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

### 6.3 核心数据结构

帖子：

```json
{
  "id": "uuid",
  "authorId": "uuid",
  "title": "上海三日 citywalk",
  "content": "正文",
  "city": "上海",
  "tags": ["citywalk", "美食"],
  "imageUrls": [],
  "sourcePlannerConversationId": "uuid",
  "likeCount": 0,
  "favoriteCount": 0,
  "commentCount": 0,
  "createdAt": "2026-06-07T12:00:00Z",
  "updatedAt": "2026-06-07T12:00:00Z"
}
```

评论：

```json
{
  "id": "uuid",
  "postId": "uuid",
  "authorId": "uuid",
  "content": "评论内容",
  "createdAt": "2026-06-07T12:00:00Z"
}
```

### 6.4 与 AI 规划系统的结合

AI 规划完成后，前端可以提供“生成游记草稿”入口：

1. 前端读取最新 `PlannerSnapshot`。
2. 将 Markdown 行程、城市、点位、标签提交给发帖系统。
3. 发帖系统生成草稿帖子，用户编辑后发布。
4. 帖子保留 `sourcePlannerConversationId`，便于回溯到原始行程。

## 7. 后续里程碑

| 阶段 | 目标 | 验收标准 |
| --- | --- | --- |
| M1 | 完成当前分支裁剪 | 仓库只保留前端、AI 服务、Agent 和必要运行脚本 |
| M2 | AI 规划稳定化 | smoke test 通过，前端可完成一次规划、选点、快照刷新 |
| M3 | 合并订票系统 | AI 推荐可跳转真实订票详情并完成下单 |
| M4 | 开发发帖系统第一阶段 | 可发布、浏览、评论、点赞、收藏帖子 |
| M5 | AI + 社区联动 | AI 行程可生成游记草稿并发布 |

## 8. 开发约定

- 当前分支不再新增旧微服务架构依赖，不使用 Eureka、旧 API Gateway 或 RabbitMQ 作为必需运行组件。
- AI 服务对前端保持固定入口 `localhost:8082`。
- Python Agent 不直接写 MongoDB，持久化仍由 Java 服务统一完成。
- 未配置外部 Key 时必须保留本地兜底能力，保证演示和测试可运行。
- 新增订票和发帖能力时，应优先新增独立业务模块和清晰接口，而不是复活旧项目服务。
