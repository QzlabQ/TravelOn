# NULLptr AI Travel

本仓库是前后端一体的 AI 规划出行项目。当前分支已经从旧旅游微服务项目中裁剪出来，只保留：

- `travel-ui`：React 前端。
- `travel-api/ai-arrange-service`：Spring Boot AI 规划业务入口，负责 REST、WebSocket、MongoDB 会话与快照。
- `travel-api/ai-arrange-agent-service`：Python FastAPI Agent，负责模型调用、工具编排和结构化行程生成。

旧项目中的网关、注册中心、酒店、交通、报价、支付、用户、数据生成等微服务不属于当前分支范围。

## 环境变量

在 `travel-api/.env` 中配置后端 AI 能力：

```env
DEEPSEEK_API_KEY=
AMAP_API_KEY=
DEEPSEEK_MODEL=
```

在 `travel-ui/.env` 中配置前端访问地址和高德 JS Key：

```env
REACT_APP_API_HOSTNAME=localhost
REACT_APP_API_PORT=8082
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

## 快速启动

后端：

```powershell
cd travel-api
docker compose up -d --build mongo ai-arrange-agent ai-arrange
```

前端本地开发：

```powershell
cd travel-ui
corepack enable
yarn
yarn start
```

如果需要使用前端 Docker 容器，需要先解决 Docker Hub 镜像源或代理问题，或者本地预拉取 `node:21-alpine` 和 `nginx:1.25-alpine`；否则构建 `front` 服务时可能失败。

更多开发说明见 [DEVELOPMENT.md](DEVELOPMENT.md)。
