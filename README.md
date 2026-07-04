
# TravelOn: A One-Stop Travel Platform Powered by Microservices

为满足用户日益增长的出行与旅游预订需求，TravelOn 需要建设一款集机票预订、酒店住宿、旅游度假、火车票购买于一体的综合出行旅游平台。平台提供丰富的出行产品选择、智能的行程规划工具、透明的价格信息与便捷的预订流程，覆盖用户“行前规划 - 行中服务 - 行后分享”的全旅程场景。 
To meet users’ growing demand for travel and vacation bookings, TravelOn needs to build a comprehensive travel platform that integrates flight bookings, hotel accommodations, vacation packages, and train ticket purchases. The platform offers a wide selection of travel products, intelligent itinerary planning tools, transparent pricing information, and a convenient booking process, covering the entire travel journey—from pre-trip planning to in-trip services to post-trip sharing.

## 演示视频

https://github.com/user-attachments/assets/ad9d7145-eee1-4f2c-bebe-2cd7702a3f3a

---

## 目录 | Table of Contents

- [项目简介 | Overview](#项目简介--overview)
- [技术栈 | Tech Stack](#技术栈--tech-stack)
- [项目结构 | Project Structure](#项目结构--project-structure)
- [环境要求 | Prerequisites](#环境要求--prerequisites)
- [快速开始（首次部署）| Quick Start (First-Time Setup)](#快速开始首次部署-quick-start-first-time-setup)
- [日常开发 | Daily Development](#日常开发--daily-development)
- [环境变量说明 | Environment Variables](#环境变量说明--environment-variables)
- [常见问题排查 | Troubleshooting](#常见问题排查--troubleshooting)
- [FAQ](#faq)

---

## 项目简介 | Overview

**中文：**  
本仓库包含：

- 后端服务：`travel-api`
- 前端应用：`travel-ui`

项目支持 AI 相关功能（需配置 Key），社区功能可独立运行。

**English:**  
This repository includes:

- Backend service: `travel-api`
- Frontend app: `travel-ui`

AI-related features are supported (API keys required), while community features can run independently.

---

## 技术栈 | Tech Stack

**中文：** 主要语言与技术包括 Java、TypeScript、Python、PL/pgSQL、Docker。  
**English:** Main technologies include Java, TypeScript, Python, PL/pgSQL, and Docker.

---

## 项目结构 | Project Structure

<img width="407" height="203" alt="image" src="https://github.com/user-attachments/assets/290798fd-97da-4652-a6d7-5ef31962d1d9" />

```text
travel-on-2026NULLptr/
├─ travel-api/      # 后端服务 | Backend services
└─ travel-ui/       # 前端应用 | Frontend application
```

---

## 环境要求 | Prerequisites

**中文：** 请先安装以下工具：  
**English:** Install the following tools first:

```text
Git
Docker Desktop / Docker Engine
Node.js 20+ or 22+
```

检查版本 | Verify versions:

```powershell
git --version
docker --version
docker compose version
node --version
corepack --version
```

启用 Yarn（Corepack）| Enable Yarn (Corepack):

```powershell
corepack enable
```

---

## 快速开始（首次部署）| Quick Start (First-Time Setup)

### 1) 拉取项目 | Clone the repository

```powershell
git clone <你的仓库地址 / your-repository-url>
cd travel-on-2026NULLptr
```

### 2) 配置后端环境变量 | Configure backend environment variables

```powershell
cd travel-api
```

新建 `travel-api/.env` | Create `travel-api/.env`:

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

说明 | Notes:

- 中文：AI 规划页默认使用 Flash 模型，可在页面中切换为 Pro。AI 功能需要配置 Key；社区功能可留空。  
- English: The AI planning page uses Flash mode by default and can be switched to Pro in the UI. AI features require API keys; community features can be left without AI keys.

### 3) 启动后端 | Start backend

```powershell
docker compose up -d --build
docker compose ps
```

网关地址 | Gateway URL:

```text
http://localhost:58082
```

### 4) 配置前端环境变量 | Configure frontend environment variables

```powershell
cd ..\travel-ui
```

新建 `travel-ui/.env` | Create `travel-ui/.env`:

```env
REACT_APP_API_HOSTNAME=localhost
PORT=53000
REACT_APP_API_PORT=58082
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

注意 | Important:

- 中文：`.env` 注释请使用 `#`，不要用 `;`。  
- English: Use `#` for comments in `.env`, not `;`.

### 5) 安装前端依赖 | Install frontend dependencies

```powershell
cmd /c yarn install
```

### 6) 启动前端 | Start frontend

```powershell
cmd /c yarn start
```

访问地址 | URLs:

```text
http://localhost:53000
http://localhost:53000/community
```

---

## 日常开发 | Daily Development

### 启动已有项目 | Start existing services

后端 | Backend:

```powershell
cd travel-api
docker compose up -d
```

前端 | Frontend:

```powershell
cd travel-ui
cmd /c yarn start
```

### 停止服务 | Stop services

停止后端 | Stop backend:

```powershell
cd travel-api
docker compose down
```

停止前端 | Stop frontend:

```powershell
Ctrl + C
```

### 修改后重启/重建 | Restart/Rebuild after changes

前端支持热更新；若修改 `.env` 需重启前端。  
Frontend supports hot reload; restart is required after `.env` changes.

```powershell
Ctrl + C
cmd /c yarn start
```

若修改后端服务或 `docker-compose.yml`：  
If backend services or `docker-compose.yml` changes:

```powershell
cd travel-api
docker compose up -d --build
docker compose ps
```

### 前端生产构建检查 | Frontend production build check

```powershell
cd travel-ui
cmd /c yarn build
```

---

## 环境变量说明 | Environment Variables

### 后端 | Backend (`travel-api/.env`)

- `DEEPSEEK_API_KEY`：DeepSeek API Key
- `AMAP_API_KEY`：后端 POI / 路线增强使用的高德 Key  
  AMap key for backend POI/route enrichment
- `DEEPSEEK_MODEL`：默认模型（可选）  
  Optional default model
- `DEEPSEEK_FLASH_MODEL`：Flash 模型名  
  Flash model name
- `DEEPSEEK_PRO_MODEL`：Pro 模型名  
  Pro model name
- `DEEPSEEK_THINKING_TYPE`：思考模式开关  
  Thinking mode switch
- `DEEPSEEK_MAX_TOKENS`：最大 token 数  
  Max token limit
- `DEEPSEEK_SLOW_RESPONSE_WARNING_MS`：慢响应告警阈值（毫秒）  
  Slow response warning threshold (ms)

### 前端 | Frontend (`travel-ui/.env`)

- `REACT_APP_API_HOSTNAME`：后端主机名（通常 `localhost`）  
  Backend hostname (usually `localhost`)
- `REACT_APP_API_PORT`：后端端口（默认 `58082`）  
  Backend port (default `58082`)
- `PORT`：前端开发服务端口（默认 `53000`）  
  Frontend dev server port (default `53000`)
- `REACT_APP_AMAP_JS_API_KEY`：浏览器端地图渲染 Key  
  AMap JS key for browser map rendering
- `REACT_APP_AMAP_SECURITY_JS_CODE`：高德 JS 安全码  
  AMap JS security code

---

## 常见问题排查 | Troubleshooting

### 1) Docker 服务未正常启动 | Docker services failed to start

```powershell
docker compose ps
docker compose logs
```

中文：确认 Docker 已启动、端口未冲突。  
English: Ensure Docker is running and ports are not occupied.

### 2) 前端无法连接后端 | Frontend cannot reach backend

检查 | Check:

- `REACT_APP_API_HOSTNAME`
- `REACT_APP_API_PORT`
- 后端容器状态（`travel-api` 下执行 `docker compose ps`）  
  Backend container status (`docker compose ps` in `travel-api`)

### 3) 地图不显示 | Map is not displayed

检查前端高德配置 | Check frontend AMap variables:

- `REACT_APP_AMAP_JS_API_KEY`
- `REACT_APP_AMAP_SECURITY_JS_CODE`

### 4) AI 功能不可用 | AI features unavailable

检查后端 AI 配置 | Check backend AI variables:

- `DEEPSEEK_API_KEY`
- `DEEPSEEK_FLASH_MODEL` / `DEEPSEEK_PRO_MODEL`

并在修改 `.env` 后重启后端服务。  
Restart backend services after `.env` updates.

---

## FAQ

### Q1: 不配置 AI Key 可以运行吗？  
### Q1: Can I run it without AI keys?

**A:** 可以运行社区等非 AI 功能；AI 功能需要正确配置 Key。  
**A:** Yes. Non-AI features (e.g., community pages) can run without AI keys; AI features require proper keys.

### Q2: `AMAP_API_KEY` 和 `REACT_APP_AMAP_JS_API_KEY` 有什么区别？  
### Q2: What is the difference between `AMAP_API_KEY` and `REACT_APP_AMAP_JS_API_KEY`?

**A:**  
- `AMAP_API_KEY`：后端调用高德服务（POI/路线增强）  
- `REACT_APP_AMAP_JS_API_KEY`：前端浏览器地图渲染

**A (EN):**  
- `AMAP_API_KEY`: used by backend services (POI/route enrichment)  
- `REACT_APP_AMAP_JS_API_KEY`: used by frontend browser map rendering

### Q3: 修改 `.env` 后是否需要重启？  
### Q3: Do I need to restart after updating `.env`?

**A:**  
- 前端：需要重启 `yarn start`  
- 后端：建议重新 `docker compose up -d --build`

**A (EN):**  
- Frontend: restart `yarn start`  
- Backend: recommended to rerun `docker compose up -d --build`
