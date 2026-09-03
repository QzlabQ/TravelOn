# 阿里云 Docker Compose CD

该部署与 `production-256` K3s 部署并行存在。`CI` 在 `main` 成功后触发
`CD Aliyun`，由带有 `travelon-aliyun` 标签的 self-hosted runner 执行。

## 服务器约束

- Runner 用户固定为 `travelon-runner`，不得以 root 运行 Actions Runner。
- root 安装 `/usr/local/sbin/travelon-deploy-compose`，runner 只能免密调用该入口。
- 持久数据和私有配置位于 `/root/demo-app/travel-api`，不会从 Actions 工作区删除。
- 生产环境文件 `/root/demo-app/travel-api/.env` 权限为 `0600`，不得提交到 Git。
- 公网只开放 SSH、HTTP/HTTPS；数据库、中间件、Eureka 和 Gateway 只绑定回环地址。

环境文件至少应包含：

```dotenv
POSTGRES_PASSWORD=<strong-password>
POSTGRES_HOST_PORT=127.0.0.1:55432
RABBITMQ_HOST_PORT=127.0.0.1:55672
RABBITMQ_MANAGEMENT_HOST_PORT=127.0.0.1:55673
MONGO_HOST_PORT=127.0.0.1:57017
DISCOVERY_HOST_PORT=127.0.0.1:58010
GATEWAY_HOST_PORT=127.0.0.1:58082
FRONT_HOST_PORT=80
AI_API_KEY=<provider-api-key>
AMAP_API_KEY=<amap-web-service-key>
```

`AMAP_API_KEY` 供后端 Web 服务 API 使用。前端地图另需
`REACT_APP_AMAP_JS_API_KEY` 和 `REACT_APP_AMAP_SECURITY_JS_CODE`，二者会进入前端
构建产物，应使用高德控制台中限制了域名的 JS API 凭据。

## 安装服务器入口

服务器需要 Docker Engine、Docker Compose v2、Git、curl、rsync 和 Python 3。国内网络
无法稳定访问 Docker Hub 时，应由管理员为 Docker 配置可用的 registry mirror，并在应用
部署前验证：

```bash
docker pull postgres:16
docker pull maven:3.9.9-eclipse-temurin-21
```

创建 runner 用户后，按 GitHub `Settings -> Actions -> Runners` 页面给出的当前版本和短期
注册令牌安装 runner，并增加 `travelon-aliyun` 标签。Actions Runner 必须以
`travelon-runner` 用户作为 systemd 服务运行。

部署入口及 sudoers 安装如下：

```bash
sudo install -o root -g root -m 0755 \
  ops/runner/travelon-deploy-compose /usr/local/sbin/travelon-deploy-compose
sudo install -o root -g root -m 0440 \
  ops/runner/sudoers-aliyun /etc/sudoers.d/travelon-aliyun
sudo visudo -cf /etc/sudoers.d/travelon-aliyun
```

在 GitHub `production-aliyun` environment 中可配置部署审批。工作流不读取生产
API Key；密钥只保存在服务器环境文件中。

## 验证和回滚

当前部署提交记录在 `/root/demo-app/.deploy-revision`。查看状态：

```bash
cd /root/demo-app
docker compose --env-file travel-api/.env \
  -f travel-api/docker-compose.yml \
  -f ops/cd/docker-compose.aliyun.yml ps
```

回滚通过 revert `main` 上的目标变更完成；revert 的 CI 成功后会自动重新部署。紧急情况下，
管理员可在 runner 工作区检出目标提交后调用同一部署入口。镜像使用 `sha-<commit>` 标签，
历史镜像不会被部署脚本自动删除。
