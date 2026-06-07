# AI Arrange Service

`ai-arrange-service` 是当前后端对前端开放的 AI 规划业务入口。它已经脱离旧项目的 Gateway / Eureka / RabbitMQ 架构，可以独立监听固定端口并直接被前端访问。

## 职责

- 创建、查询、更新 AI 规划会话。
- 通过 WebSocket 接收用户消息和地图选点。
- 调用 `ai-arrange-agent-service` 的 SSE / REST Agent 接口。
- 将 Agent 结果保存为 MongoDB 会话消息和版本化快照。
- 向前端推送规划进度、Markdown、地图点位、路线片段和错误信息。
- 在配置 `AMAP_API_KEY` 后，对 AI 推荐点位做高德 POI 补全。

## 接口

REST 基础路径：

```text
/ai-arrange/api/conversations
```

WebSocket：

```text
/ai-arrange/ws/planner?conversationId=<uuid>&userId=<uuid>
```

常用 REST：

- `POST /ai-arrange/api/conversations`
- `GET /ai-arrange/api/conversations?userId=<uuid>`
- `GET /ai-arrange/api/conversations/{conversationId}?userId=<uuid>`
- `PUT /ai-arrange/api/conversations/{conversationId}/core-slots`
- `PUT /ai-arrange/api/conversations/{conversationId}/selection`
- `GET /ai-arrange/api/conversations/{conversationId}/snapshots?userId=<uuid>`
- `POST /ai-arrange/api/conversations/{conversationId}/planner/run`

## 必填槽位

前端在开始自由对话前需要收集：

- `city`
- `travelStartDate`
- `peopleCount`

可选槽位：

- `travelEndDate`
- `budget`
- `travelStyle`
- `accommodationPreference`
- `transportPreference`
- `notes`
- `mustVisitKeywords`
- `avoidKeywords`

## 配置

- `AI_ARRANGE_SERVICE_PORT`：服务端口，默认 `8082`。
- `MONGODB_URI` 或 `MONGO_HOST`：MongoDB 连接。
- `AI_ARRANGE_AGENT_BASE_URL`：Python Agent 地址，本地默认 `http://localhost:8090`，Docker Compose 中为 `http://ai-arrange-agent:8090`。
- `AI_ARRANGE_AGENT_TIMEOUT_SECONDS`：Agent 调用超时时间，默认 `150`。
- `AI_ARRANGE_CORS_ALLOWED_ORIGINS`：允许访问 REST 接口的前端源，默认允许 `localhost:3000`。
- `DEEPSEEK_API_KEY`：启用真实模型调用。
- `DEEPSEEK_MODEL`：模型名称。
- `AMAP_API_KEY`：启用后端高德 POI / 路线补全。

未配置 `DEEPSEEK_API_KEY` 时，Python Agent 仍会返回结构化兜底方案，便于本地开发和测试。

## 本地运行

先启动 MongoDB 和 Python Agent，再运行：

```powershell
mvn spring-boot:run
```

也可以在 `travel-api` 目录用 Docker Compose 一次启动：

```powershell
docker compose up -d --build
```

## Smoke Test

在 `travel-api` 目录运行：

```powershell
.\scripts\ai-arrange-smoke-test.ps1
```

自动选中第一个地图点并验证快照刷新：

```powershell
.\scripts\ai-arrange-smoke-test.ps1 -AutoSelectFirstPlace
```
