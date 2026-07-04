# TravelOn微服务一站式出行平台

## 项目简介

为满足用户日益增长的出行与旅游预订需求，TravelOn 需要建设一款集机票预订、酒店住宿、旅游度假、火车票购买于一体的综合出行旅游平台。平台提供丰富的出行产品选择、智能的行程规划工具、透明的价格信息与便捷的预订流程，覆盖用户“行前规划 - 行中服务 - 行后分享”的全旅程场景。

## 技术栈

React,Typescript, JAVA SpringBoot, docker

## 架构

<img width="407" height="203" alt="image" src="https://github.com/user-attachments/assets/290798fd-97da-4652-a6d7-5ef31962d1d9" />

## 演示视频

https://github.com/user-attachments/assets/ad9d7145-eee1-4f2c-bebe-2cd7702a3f3a

# 使用说明

## 首次部署

1. 安装环境

```text
Git
Docker Desktop / Docker Engine
Node.js 20+ 或 22+
```

检查：

```powershell
git --version
docker --version
docker compose version
node --version
corepack --version
```

启用 Yarn：

```powershell
corepack enable
```

2. 拉取项目

```powershell
git clone <你的仓库地址>
cd travel-on-2026NULLptr
```

3. 配置后端环境变量

```powershell
cd travel-api
```

新建 `.env`：

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

AI 规划页默认使用 Flash 模型模式，页面中可切换为 Pro。

AI 功能需要填 key；社区功能可以留空。

4. 启动后端

```powershell
docker compose up -d --build
```

检查：

```powershell
docker compose ps
```

网关地址：

```text
http://localhost:58082
```

5. 配置前端环境变量

```powershell
cd ..\travel-ui
```

新建 `.env`：

```env
REACT_APP_API_HOSTNAME=localhost
PORT=53000
REACT_APP_API_PORT=58082
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

`.env` 注释要用 `#`，不要用 `;`。

6. 安装前端依赖

```powershell
cmd /c yarn install
```

7. 启动前端

```powershell
cmd /c yarn start
```

打开：

```text
http://localhost:53000
```

社区页面：

```text
http://localhost:53000/community
```

## 日常开发操作

**启动已有项目**

后端：

```powershell
cd travel-api
docker compose up -d
```

前端：

```powershell
cd travel-ui
cmd /c yarn start
```

**停止服务**

停止后端：

```powershell
cd travel-api
docker compose down
```

停止前端：

```powershell
Ctrl + C
```

**修改后重新构建**

前端开发服务会热更新。改了 `.env` 后需要重启：

```powershell
Ctrl + C
cmd /c yarn start
```

如果改了后端服务或 `docker-compose.yml`：

```powershell
cd travel-api
docker compose up -d --build
docker compose ps
```

**生产构建检查**

前端构建：

```powershell
cd travel-ui
cmd /c yarn build
```

---
# OLD_README.md

2026NULLptr repository that contains both frontend and backend.

## Notice
You need to add file .env under folder travel-api if ai module is needed. The file content are like:

```.env
DEEPSEEK_API_KEY=
AMAP_API_KEY=
DEEPSEEK_MODEL=
DEEPSEEK_FLASH_MODEL=deepseek-v4-flash
DEEPSEEK_PRO_MODEL=deepseek-v4-pro
DEEPSEEK_THINKING_TYPE=disabled
DEEPSEEK_MAX_TOKENS=12000
DEEPSEEK_SLOW_RESPONSE_WARNING_MS=60000
```

Frontend AMap JavaScript map rendering is configured separately in `travel-ui/.env`:

```.env
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

`AMAP_API_KEY` is used by backend services for POI / route enrichment. `REACT_APP_AMAP_JS_API_KEY` is used by the browser map component.
