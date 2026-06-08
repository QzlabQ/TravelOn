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
```

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
```

Frontend AMap JavaScript map rendering is configured separately in `travel-ui/.env`:

```.env
REACT_APP_AMAP_JS_API_KEY=
REACT_APP_AMAP_SECURITY_JS_CODE=
```

`AMAP_API_KEY` is used by backend services for POI / route enrichment. `REACT_APP_AMAP_JS_API_KEY` is used by the browser map component.
