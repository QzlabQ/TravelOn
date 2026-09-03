# 测试运行器底层参考

日常测试请用 mise 任务，见根目录 [README](../README.md#工具链管理mise) 的「工具链管理（mise）」一节：

```bash
mise run test:pre
mise run test:unit
mise run test:migration
mise run test:integration
mise run test:e2e
mise run test:all
mise run test:ci
```

本文档记录这些任务背后的底层命令与全部参数，供**调试测试链路本身**、需要自定义组合、或不使用 mise 时查阅。

## 运行器

`run_tests.py` 是纯 Python 编排器，`shell=False` 直接拉起子进程，不依赖 PowerShell、Bash、`curl` 或 `jq`。同一组命令可在 Windows、Linux、macOS 的任意 shell 下使用。它只负责预检、编排、服务管理和汇总；测试代码本身按所属功能就近存放。

不通过 mise 直接调用时，须自行保证 PATH 中是正确的工具版本（Java 21 / Node 22.22.3 / Yarn 4.2.2 / Python 3.12），否则预检会拒绝执行。用 `mise exec -- <命令>` 可以省去这一步。

## 测试类别

```text
python tests/run_tests.py pre
python tests/run_tests.py unit
python tests/run_tests.py migration
python tests/run_tests.py integration
python tests/run_tests.py e2e
python tests/run_tests.py all
python tests/run_tests.py ci
python tests/run_tests.py full
```

| 类别 | 内容 | 需要服务 | 对应 mise 任务 |
| --- | --- | --- | --- |
| `pre` | 前置守卫：种子数据、迁移脚本、classpath 资源、MQ 与网关配置，约 20 秒 | 否 | `test:pre` |
| `unit` | 单元测试与覆盖率门禁，约 50 秒 | 否 | `test:unit` |
| `migration` | PostgreSQL 旧数据库迁移回归测试 | 临时 PostgreSQL 容器 | `test:migration` |
| `integration` | Java `*IT`、Agent 集成、API 测试；跳过真实模型调用；resilience 用例另起一段 | 是 | `test:integration` |
| `e2e` | Playwright，默认 Chromium；自动 `yarn build` 后 `yarn serve` | 是 | `test:e2e` |
| `all` | `pre + unit + integration + Chromium E2E + resilience` | 是 | `test:all` |
| `ci` | `pre + unit + migration + integration + Chromium E2E + resilience`，前置阶段失败立即停止 | 是 | `test:ci` |
| `full` | `all` 之外追加真实模型调用、WebSocket、三浏览器 E2E | 是 | `test:full` |

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
mise run test:migration
```

跨平台 Python 入口会在临时容器中构造旧数据库，执行
`travel-api/database/migration/migrate-existing-databases.sh`，并检查城市按
`city_id` 合并、重复图片清理、酒店/房间/房间预订/交通票务迁移、外键关系、完成标记、
默认关闭历史迁移、显式迁移、重复执行和失败后重试。测试结束后会自动删除临时容器，
不会使用项目的持久化数据库目录；Windows 宿主机无需安装 Bash。

该测试验证的是历史数据迁移分支，因此会显式设置
`MIGRATE_LEGACY_DATA=true`。迁移脚本在 Docker Compose 和普通启动场景下默认不迁移历史数据。

示例：

```text
python tests/run_tests.py unit --module user-service --module travel-core-service
python tests/run_tests.py migration
python tests/run_tests.py integration --module api
python tests/run_tests.py e2e --browser firefox
python tests/run_tests.py all --manage-services
python tests/run_tests.py full --manage-services --browser all
python tests/run_tests.py ci --manage-services
python tests/run_tests.py integration --manage-services --no-build
```

> `--no-build` 会让服务跑在旧镜像上。改过后端源码后务必去掉，否则测的是旧代码，会出现"源码有校验但测试报未生效"这类假阳性。

## 服务管理

`integration` / `e2e` / `all` / `ci` / `full` 默认假设后端已在运行。传入 `--manage-services` 后，运行器执行 `docker compose up -d --build`，轮询 Gateway 直到就绪（上限 20 分钟），结束时**只停止本次新启动的服务**，此前已在运行的容器不受影响。`ci` 会先完成前置守卫、单元与迁移测试，再启动服务栈运行集成测试。

## pre 阶段（前置守卫）

`unit` 以前混了一批**不测业务逻辑**的用例：断言种子 CSV 是否过期、Flyway 迁移脚本怎么写、
`R__seed.sql` 是否幂等、图片资源在不在 classpath 上、MQ 队列与网关路由的配置声明。
它们跑得快、不需要服务栈，但和"单元测试"是两回事——混在一起会让覆盖率和用例数都失真。

现在这些用例带 `@Tag("pre")`（Python 侧是 `tests/test_seed_window.py`），单独成 `pre` 阶段：

| 模块 | 用例 | 内容 |
| --- | ---: | --- |
| seed-data | 2 | 票务种子数据的滚动窗口是否仍覆盖今天 + 30 天 |
| api-gateway | 3 | 网关路由定义 |
| community-service | 5 | `R__seed.sql` 幂等、随包图片资源存在性 |
| travel-core-service | 7 | Flyway 基线兼容、种子迁移、MQ 队列与交换机声明 |

编排上的两点约定：

- `unit` 用 `-DexcludedGroups=pre` 把它们排除，所以 **unit 的覆盖率只反映真正的单元测试**。
- `pre` 排在所有阶段最前面：数据和配置本身就不对时，继续往下跑没有意义。

拆分后 `api-gateway` 和 `discovery-service` 已没有任何单元测试（前者唯一的 `*Test` 是配置断言，
后者本来就只有 IT），它们 unit 阶段的覆盖率恒为 0，jacoco 下限相应设为 0，真实覆盖看集成一列。

另外 `RoomRepositoryAvailabilityTest` 要起 H2 真跑 JPQL，已改名为 `RoomRepositoryAvailabilityIT`
挪到集成阶段——文件名以 `Test` 结尾就会被 Surefire 当单元测试跑，那样的归类名不副实。

## resilience 用例

带 `resilience` 标记的用例需要改服务配置或重启服务，不能和普通用例混在同一批里跑：

| 用例 | 需要的前置条件 |
| --- | --- |
| 支付超时补偿 | `order` 以 `APP_PAYMENT_TIMEOUT_SECONDS=10` 运行 |
| 社区停机与 Eureka 摘除恢复 | 中途 `docker compose stop community` |

`integration` / `all` / `ci` / `full` 会在所有其它测试结束后追加一段 `resilience`：先以 10 秒支付超时重建 `order` 容器，只跑这一组用例，跑完恢复默认超时。**该段需要 `--manage-services`**，否则跳过并给出提示。

10 秒超时不能作用于整批用例——它会把所有未在 10 秒内付款的订单一并回滚，全链路用例根本跑不完。运行器实际应用短超时时会注入 `TRAVEL_TEST_EXPECT_SHORT_PAYMENT_TIMEOUT=1`，此时超时用例若发现配置未生效会直接失败，而不是静默跳过。

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

酒店后台接口的 API 测试需要管理员凭据，按序查找 `ADMIN_EMAIL` / `ADMIN_PASSWORD` → 仓库根目录 `admin_account.txt`，也可用 `ADMIN_ACCOUNT_FILE` 指定其它文件。缺失时这些用例会跳过，其余用例不受影响。

下列变量由运行器自动注入子进程，仅在**绕过运行器、直接调用 pytest / Playwright** 时才需要手动设置：

| 变量 | 用途 |
| --- | --- |
| `TRAVEL_TEST_GATEWAY_URL` / `TRAVEL_TEST_EUREKA_URL` | API 测试的目标地址 |
| `TRAVEL_TEST_EVIDENCE_DIR` | API 请求/响应证据的输出目录 |
| `TRAVEL_TEST_PAYMENT_TIMEOUT_SECONDS` | 支付超时补偿用例的等待上限 |
| `TRAVEL_TEST_EXPECT_SHORT_PAYMENT_TIMEOUT` | 设为 `1` 表示本次运行确实应用了短超时，超时用例此时不允许跳过 |
| `TRAVEL_UI_URL` | Playwright 访问的前端地址 |
| `PLAYWRIGHT_REPORT_DIR` | Playwright 报告输出目录 |
| `PLAYWRIGHT_BROWSERS_PATH` | Playwright 浏览器缓存位置 |

`NO_COLOR` 设为任意值可关闭终端彩色输出。

## 绕过运行器直跑单个模块

输出直接打到终端，便于调试单个失败用例：

```text
# Java 单元测试（排除前置守卫）
cd travel-api/user-service && sh ./mvnw -DexcludedGroups=pre test

# Java 前置守卫
cd travel-api/travel-core-service && sh ./mvnw -Dgroups=pre test

# Java 集成测试
cd travel-api/user-service && sh ./mvnw test-compile failsafe:integration-test failsafe:verify

# Agent 单元 / 集成测试
cd travel-api/ai-arrange-agent-service && python -m pytest -q tests/unit
cd travel-api/ai-arrange-agent-service && python -m pytest -q tests/integration

# API 集成测试（后端需已运行）
cd travel-api/tests && python -m pytest -q -m "integration and not external and not resilience"

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
├─ <java-service>/src/test/java/        # 单元测试 *Test；前置守卫 @Tag("pre")；集成测试 *IT
├─ ai-arrange-agent-service/tests/
│  ├─ unit/                             # Agent 逻辑、工具、策略、trace
│  └─ integration/                      # FastAPI/TestClient 与组件协作
└─ tests/
   ├─ test_seed_window.py               # 前置守卫：票务种子数据窗口
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
| `summary.json` | 机器可读结果、用例数与环境版本 |
| `latest.md` | 汇总表格（含每个任务的用例数与覆盖率） |
| `unit/` `integration/` `e2e/` | JUnit、API 请求响应证据、Playwright 报告与失败截图/视频/trace |
| `coverage/{java,java-it,python,ui}/` | 各工具覆盖率报告的副本 |

子进程的详细输出只写日志文件，终端只显示进度与汇总。失败项标红并附日志路径。

进度条按**任务**计数（一个模块一个子进程），同时从日志里实时解析**已完成的用例数**：

```text
[██████░░░░░░░░░░░░░░] 3/10 · 累计 33 用例 travel-core-service 6s  用例 12
[████████░░░░░░░░░░░░] 4/10 · 累计 63 用例 ✓ travel-core-service 9.69s  30 条用例
```

用例数的解析来源：

| 来源 | 依据 |
| --- | --- |
| Surefire / Failsafe | 每个测试类结束时的 `Tests run: N, ... -- in <类名>` 行（末尾汇总行没有 `-- in`，不会重复计数） |
| pytest | `-q` 的进度点，收尾后取统计行 |
| Jest | `Tests:  10 passed, 10 total` |
| Playwright | list reporter 的逐条完成行 |

只显示已完成数，不显示 `x/n`：Maven 和 Jest 在跑完之前都不报出用例总数（Jest 连 `--listTests` 也只列文件），分母只能拿上一轮结果去猜，猜错时反而误导。识别不出日志格式时不显示用例数，不影响执行。

**Playwright 是例外**：它自己会打印 `Running N tests`，那是本次运行的实数，所以 E2E 既显示 `用例 12/18`，进度条也按用例比例推进：

```text
[░░░░░░░░░░░░░░░░░░░░] 0/1 travel-ui-e2e 12s  准备中（构建并启动前端）…
[████████████████░░░░] 0/1 travel-ui-e2e 254s  用例 14/18
[████████████████████] 1/1 · 累计 18 用例 ✓ travel-ui-e2e 345.81s  18 条用例
```

E2E 只有一个任务，条子若只按任务计数就会五分钟一格不动。这里条子按用例填充，而 `0/1` 仍如实表示任务数——两种口径分别显示，不互相冒充。其它类别拿不到真实总数，条子保持按任务推进。

> 注意：`target/surefire-reports/` 里可能残留已删除测试类的旧报告（Surefire 不会清理），直接扫这个目录统计会多算。上面的用例数取自本次运行的输出，不受影响；手工统计时先 `mvn clean`。

Playwright 报告用 `corepack yarn test:e2e:report`（在 `travel-ui` 下）打开；API 的每次请求与响应以去除令牌的 JSON 保存在 integration evidence 目录。
