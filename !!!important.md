# 请在继续开发之前重置数据库！！！
**用 PowerShell 执行下列指令**
## 0. 切换目录
`cd travel-api`

## 1. 停止并移除所有容器
`docker compose down`

## 2. 删除三类持久化数据
`Remove-Item -Recurse -Force .\data\postgres, .\data\mongo, .\data\rabbitmq`

## 3. 重建镜像并后台启动
`docker compose up -d --build`
