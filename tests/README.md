# 测试运行器底层参考

日常测试请用 mise 任务，见根目录 [README](../README.md#工具链管理mise) 的「工具链管理（mise）」一节：

```bash
mise run test:unit
mise run test:integration
mise run test:e2e
mise run test:all
```

本文档记录这些任务背后的底层命令与全部参数，供**调试测试链路本身**、需要自定义组合、或不使用 mise 时查阅。

## 运行器

`run_tests.py` 是纯 Python 编排器，`shell=False` 直接拉起子进程，不依赖 PowerShell、Bash、`curl` 或 `jq`。同一组命令可在 Windows、Linux、macOS 的任意 shell 下使用。它只负责预检、编排、服务管理和汇总；测试代码本身按所属功能就近存放。

不通过 mise 直接调用时，须自行保证 PATH 中是正确的工具版本（Java 21 / Node 22.22.3 / Yarn 4.2.2 / Python 3.12），否则预检会拒绝执行。用 `mise exec -- <命令>` 可以省去这一步。

## 测试类别

```text
python tests/run_tests.py unit
python tests/run_tests.py integration
python tests/run_tests.py e2e
python tests/run_tests.py all
python tests/run_tests.py full
```

| 类别 | 内容 | 需要服务 | 对应 mise 任务 |
| --- | --- | --- | --- |
| `unit` | 全部单元测试与覆盖率，约 1 分钟 | 否 | `test:unit` |
| `integration` | Java `*IT`、Agent 集成、API 测试；跳过真实 DeepSeek 与社区停机 | 是 | `test:integration` |
| `e2e` | Playwright，默认 Chromium；自动 `yarn build` 后 `yarn serve` | 是 | `test:e2e` |
| `all` | `unit + integration + Chromium E2E` | 是 | `test:all` |
| `full` | `all` 之外追加真实 DeepSeek、WebSocket、社区停机恢复、三浏览器 E2E | 是 | `test:full` |

## 参数

| 参数 | 说明 |
| --- | --- |
| `--module <名称>` | 只跑指定模块，可重复指定多个 |
| `--manage-services` | 由运行器启停 Docker 服务；不传则假设后端已在运行 |
| `--no-build` | 启动服务时跳过 `docker compose --build`，直接用已有镜像 |
| `--browser chromium\|firefox\|webkit\|all` | E2E 浏览器，`full` 默认 `all`，其余默认 `chromium` |
| `--gateway-url <URL>` | 默认 `http://localhost:58082` |
| `--eureka-url <URL>` | 默认 `http://localhost:58010` |
| `--ui-url <URL>` | 默认 `http://localhost:53000` |
| `--artifacts-dir <路径>` | 报告输出目录，默认 `artifacts/test-results`，**须在仓库目录内** |

## 数据库迁移回归测试

微服务合并后，`travel-core-service` 需要把已有 PostgreSQL 卷中的 `hotel_db` 和
`transport_db` 迁移到 `travel_core_db`。仓库提供可重复执行的 PostgreSQL 16 测试：

```bash
bash tests/migration/test-existing-databases.sh
```

测试会在临时容器中构造旧数据库，执行
`travel-api/database/migration/migrate-existing-databases.sh`，并检查城市按
`city_id` 合并、重复图片清理、酒店/房间/房间预订/交通票务迁移、外键关系、完成标记、
重复执行和失败后重试。测试结束后会自动删除临时容器，不会使用项目的持久化数据库目录。

该测试验证的是历史数据迁移分支，因此会显式设置
`MIGRATE_LEGACY_DATA=true`。迁移脚本在 Docker Compose 和普通启动场景下默认不迁移历史数据。

示例：

```text
python tests/run_tests.py unit --module user-service --module travel-core-service
python tests/run_tests.py integration --module api
python tests/run_tests.py e2e --browser firefox
python tests/run_tests.py all --manage-services
python tests/run_tests.py full --manage-services --browser all
python tests/run_tests.py integration --manage-services --no-build
```

> `--no-build` 会让服务跑在旧镜像上。改过后端源码后务必去掉，否则测的是旧代码，会出现"源码有校验但测试报未生效"这类假阳性。

## 服务管理

`integration` / `e2e` / `all` / `full` 默认假设后端已在运行。传入 `--manage-services` 后，运行器执行 `docker compose up -d --build`，轮询 Gateway 直到就绪（上限 20 分钟），结束时**只停止本次新启动的服务**，此前已在运行的容器不受影响。

`full` 若由运行器从全停状态启动服务，会将支付超时临时设为 10 秒，以便执行超时补偿用例。

首次构建需能访问 Docker Hub 拉取基础镜像。国内直连不稳时，在 **Docker Desktop → Settings → Docker Engine** 配置加速器后 Apply & Restart：

```json
{ "registry-mirrors": ["https://docker.m.daocloud.io"] }
```

## 端口一致性

改过 `docker-compose.yml` 的端口时需用对应参数覆盖：

| 参数 | 默认值 | 对应 `.env` 变量 |
| --- | --- | --- |
| `--gateway-url` | `http://localhost:58082` | `GATEWAY_HOST_PORT` |
| `--eureka-url` | `http://localhost:58010` | `DISCOVERY_HOST_PORT` |
| `--ui-url` | `http://localhost:53000` | `PORT`（前端 `.env`） |

## 环境变量

`full` 需要管理员凭据，按序查找 `ADMIN_EMAIL` / `ADMIN_PASSWORD` → 仓库根目录 `admin_account.txt`，也可用 `ADMIN_ACCOUNT_FILE` 指定其它文件。

下列变量由运行器自动注入子进程，仅在**绕过运行器、直接调用 pytest / Playwright** 时才需要手动设置：

| 变量 | 用途 |
| --- | --- |
| `TRAVEL_TEST_GATEWAY_URL` / `TRAVEL_TEST_EUREKA_URL` | API 测试的目标地址 |
| `TRAVEL_TEST_EVIDENCE_DIR` | API 请求/响应证据的输出目录 |
| `TRAVEL_TEST_PAYMENT_TIMEOUT_SECONDS` | 支付超时补偿用例的等待上限 |
| `TRAVEL_UI_URL` | Playwright 访问的前端地址 |
| `PLAYWRIGHT_REPORT_DIR` | Playwright 报告输出目录 |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright 浏览器缓存位置 |

`NO_COLOR` 设为任意值可关闭终端彩色输出。

## 绕过运行器直跑单个模块

输出直接打到终端，便于调试单个失败用例：

```text
# Java 单元测试
cd travel-api/user-service && sh ./mvnw test          # Windows cmd 用 mvnw.cmd test

# Java 集成测试
cd travel-api/user-service && sh ./mvnw test-compile failsafe:integration-test failsafe:verify

# Agent 单元 / 集成测试
cd travel-api/ai-arrange-agent-service && python -m pytest -q tests/unit
cd travel-api/ai-arrange-agent-service && python -m pytest -q tests/integration

# API 集成测试（后端需已运行）
cd travel-api/tests && python -m pytest -q -m "integration and not external and not disruptive"

# UI 单元 / E2E
cd travel-ui && corepack yarn test:unit:coverage
cd travel-ui && corepack yarn test:e2e
cd travel-ui && corepack yarn test:e2e:all
```

`*Test.java` 由 Maven Surefire 执行，`*IT.java` 由 Maven Failsafe 执行。

## 测试代码分布

```text
tests/
├─ run_tests.py                         # 本运行器
├─ requirements.txt                     # 统一 Python 测试依赖
└─ README.md                            # 本文档
travel-api/
├─ <java-service>/src/test/java/        # Java 单元测试 *Test；集成测试 *IT
├─ ai-arrange-agent-service/tests/
│  ├─ unit/                             # Agent 逻辑、工具、策略、trace
│  └─ integration/                      # FastAPI/TestClient 与组件协作
└─ tests/
   ├─ integration/                      # 经 Gateway 的 pytest + httpx API 测试
   └─ smoke/                            # AI Planner WebSocket 冒烟测试
travel-ui/tests/
├─ unit/                                # Jest + React Testing Library
└─ e2e/                                 # Playwright 及公共 helper
```

## 报告

统一写入 `artifacts/test-results/`（不入库）：

| 文件/目录 | 内容 |
| --- | --- |
| `summary.json` | 机器可读结果与环境版本 |
| `latest.md` | 汇总表格 |
| `unit/` `integration/` `e2e/` | JUnit、覆盖率、API 请求响应证据、Playwright 报告与失败截图/视频/trace |

子进程的详细输出只写日志文件，终端只显示进度与汇总。失败项标红并附日志路径。Playwright 报告用 `corepack yarn test:e2e:report`（在 `travel-ui` 下）打开；API 的每次请求与响应以去除令牌的 JSON 保存在 integration evidence 目录。
