# Travel UI

`travel-ui` 是当前 AI 规划出行项目的前端。当前分支保留完整前端代码，但后端只保留 AI 规划链路，因此可直接联调的核心页面是 AI 规划页面。

## 当前可用能力

- AI 规划入口：`/ai-planner`
- 固定槽位填写：城市、日期、人数、预算、偏好等。
- AI 对话：通过 WebSocket 连接 `ai-arrange-service`。
- Markdown 行程展示和历史快照切换。
- 地图点位展示、选点和路线展示。
- Mock 数据加载，用于无后端或无外部 Key 时演示页面效果。

## 待合并页面

前端中仍保留旧项目的报价、详情和预订页面代码，例如：

- `/offers`
- `/offerDetails`
- `/buyOffer`
- `/clientPreferences`
- `/TOUpdates`

这些页面依赖旧旅游微服务接口。旧后端服务已经从当前分支移除，后续应在“已完成订票系统”合并时重新对接真实订票接口。

发帖系统目前尚未开发，建议后续新增帖子列表、帖子详情、发布页、评论互动等页面。

## 环境变量

在 `travel-ui/.env` 中配置：

```env
REACT_APP_API_HOSTNAME=localhost
REACT_APP_API_PORT=8082
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

其中：

- `REACT_APP_API_HOSTNAME` / `REACT_APP_API_PORT` 指向 `ai-arrange-service`。
- `REACT_APP_AMAP_JS_API_KEY` / `REACT_APP_AMAP_SECURITY_JS_CODE` 用于浏览器端高德地图渲染。

后端 POI / 路线补全使用 `travel-api/.env` 中的 `AMAP_API_KEY`。

## 本地启动

```powershell
corepack enable
yarn
yarn start
```

默认访问：

```text
http://localhost:3000/ai-planner
```

## 构建

```powershell
yarn build
```
