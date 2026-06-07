# Travel API

当前后端只保留 AI 规划出行链路，旧旅游微服务项目中的网关、注册中心、酒店、交通、报价、支付、用户、数据生成等服务已不再属于本分支。

## 模块

- `ai-arrange-service`：Spring Boot 服务，对前端提供 REST 和 WebSocket；负责会话、消息、快照、选点状态和 MongoDB 持久化。
- `ai-arrange-agent-service`：Python FastAPI Agent；负责调用 DeepSeek、调用/模拟旅行工具、生成结构化行程结果。
- `scripts`：AI 规划链路 smoke test。
- `docker-compose.yml`：当前项目的最小后端编排，包括 MongoDB、Java AI 服务和 Python Agent。

## 运行

先在 `travel-api/.env` 中配置：

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

AI 规划页默认使用 Flash 模型模式，前端可切换为 Pro。

启动后端：

```powershell
docker compose up -d --build mongo ai-arrange-agent ai-arrange
```

该命令只构建并启动 AI 后端链路，不会构建 `front` 前端镜像。若需要前端容器化运行，请先解决 Docker Hub 镜像源或代理问题，或本地预拉取 `node:21-alpine` 与 `nginx:1.25-alpine`。

默认端口：

- Java AI 服务：`http://localhost:8082`
- Python Agent：`http://localhost:8090`
- MongoDB：`localhost:27017`

## 验证

```powershell
.\scripts\ai-arrange-smoke-test.ps1
```

自动选中第一个地图点并验证快照刷新：

```powershell
.\scripts\ai-arrange-smoke-test.ps1 -AutoSelectFirstPlace
```

## 本地单独启动

Python Agent：

```powershell
cd ai-arrange-agent-service
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8090
```

Java AI 服务：

```powershell
cd ai-arrange-service
mvn spring-boot:run
```

未配置 `DEEPSEEK_API_KEY` 时，Agent 会返回结构化兜底规划，便于本地联调。

检查MongoSnap shot:

```powershell
cd travel-api
docker compose exec mongo mongosh ai-arrange-db

db.planner_snapshots
  .find({}, {
    version: 1,
    traceId: 1,
    agentToolCalls: 1,
    agentWarnings: 1,
    createdAt: 1
  })
  .sort({ createdAt: -1 })
  .limit(5)
  .pretty()
```
