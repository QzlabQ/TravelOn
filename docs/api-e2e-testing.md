# API 端到端测试

`travel-api/tests/integration/run-api-e2e.sh` 从 API 网关入口执行一轮完整业务回归，覆盖用户、酒店、机票、火车票、订单支付与退款、社区互动、AI 行程规划，以及 PostgreSQL/MongoDB 数据状态检查。

## 前置条件

1. 已安装 `curl`、`jq`、Docker，以及 Docker Compose 插件或独立的 `docker-compose` 命令。
2. 已启动后端 Docker Compose：

   ```bash
   cd travel-api
   docker compose up -d
   ```

3. 网关默认监听 `http://localhost:58082`，也可以通过 `API_BASE` 覆盖。
4. 运行账号需要管理员权限，用于创建并删除隔离的未来票务测试数据。脚本优先读取 `ADMIN_EMAIL`、`ADMIN_PASSWORD` 环境变量；未设置时读取仓库根目录的 `admin_account.txt`。不要把其他机器的账号密码写入脚本或提交到版本库。

## 运行

在仓库根目录执行：

```bash
bash travel-api/tests/integration/run-api-e2e.sh
```

也可以指定网关、管理员账号和证据输出目录：

```bash
API_BASE=http://localhost:58082 \
ADMIN_EMAIL=admin@example.com \
ADMIN_PASSWORD='your-password' \
RESULT_ROOT="$PWD/test-results" \
bash travel-api/tests/integration/run-api-e2e.sh
```

脚本会为本次运行创建唯一的测试用户、旅客、订单和社区帖子，并使用管理员 API 创建临时航班/火车模板。结束时会删除临时社区帖子和票务模板。每次运行的响应、数据库快照和 `summary.json` 位于 `test-results/<run-id>/`，该目录默认被 Git 忽略。

脚本退出码为：

- `0`：所有检查通过；
- `1`：至少一个检查失败；
- `2`：本地依赖或管理员账号配置缺失。

## 覆盖范围

- `BS01`：注册、登录、旅客创建与查询；
- `BS02`：酒店查询、下单及未登录拦截；
- `BS03`：航班查询和下单；
- `BS04`：火车查询和下单；
- `BS05`：无效支付、有效支付、取消、退款和支付历史；
- `BS06`：用户订单列表；
- `BS07`：社区发帖、点赞、评论、收藏和未登录拦截；
- `BS08`：AI 规划会话、快照版本、差异、回滚和参数校验；
- `DB`：PostgreSQL 与 MongoDB 最终业务数据验证。
