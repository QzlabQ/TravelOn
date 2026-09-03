# Issue 109：微服务故障注入与隔离演示记录

- 实验日期：2026-09-02
- 实验环境：256 单节点 K3s
- 目标链路：`ai-arrange-service -> ai-arrange-agent-service`
- 无关对照链路：Gateway → hotel 查询
- 实验负责人：@sulinmk

## 1. 实验目标

主动停止一个可控的依赖服务，观察受影响业务是否在有限时间内返回可识别的友好错误，并证明无关业务不受影响；随后恢复依赖并验证主流程恢复。

本次选择 AI 行程规划 Agent 作为依赖服务。Java AI 服务通过集群内 `ai-arrange-agent:8090` 调用 Python Agent；Agent 停止后，Java 服务将连接失败映射为 `PLANNER_AGENT_UNAVAILABLE`，通过 WebSocket 返回中文提示。

## 2. 实验环境

### 2.1 256 主机

- 主机名：`ubuntu-System-Product-Name`
- 节点内网地址：`10.132.91.181`
- Ubuntu 25.04，x86_64
- Linux `6.14.0-37-generic`
- Intel Core Ultra 9 285K，24 核/24 线程
- NVIDIA GeForce RTX 5070，12227 MiB 显存，驱动 `580.95.05`
- 内存 244 GiB，Swap 8 GiB
- 系统盘 3.6 TiB ext4；实验后使用率约 4%

### 2.2 K3s

- 单节点，节点角色 `control-plane`
- 节点状态 `Ready`
- K3s/Kubernetes `v1.36.4+k3s1`
- 容器运行时 `containerd://2.3.4-k3s1.36`
- 命名空间：`travelon`

相关 systemd 服务在实验前后均为 active：

- `k3s.service`
- `docker.service`
- `actions.runner.QzlabQ-TravelOn.travelon-256.service`

### 2.3 TravelOn 服务

实验恢复后，以下工作负载均为 `1/1 Ready`：

- Deployment：`ai-arrange`、`ai-arrange-agent`、`community`、`discovery`、`gateway`、`hotel`、`order`、`payment`、`rabbitmq`、`reservation`、`transport`、`travel-core`、`travelon-ui`、`user`
- StatefulSet：`mongo`、`postgres`

关键服务端口：

| 服务 | 端口 | 作用 |
| --- | ---: | --- |
| `gateway` | 8082 | 对外 API 网关 |
| `ai-arrange` | 8087 | Java AI 行程服务 |
| `ai-arrange-agent` | 8090 | Python 规划 Agent |
| `hotel` | 8083 | 酒店查询/预订服务 |
| `postgres` | 5432 | PostgreSQL |
| `mongo` | 27017 | MongoDB |
| `rabbitmq` | 5672 / 15672 | 消息队列 / 管理端 |

## 3. 故障注入与恢复

实验只调整 `ai-arrange-agent` Deployment 的副本数，不修改镜像、部署清单、Secret、配置文件或数据库内容。

```bash
# 注入故障
k3s kubectl -n travelon scale deployment/ai-arrange-agent --replicas=0
k3s kubectl -n travelon get deployment,pods

# 恢复服务
k3s kubectl -n travelon scale deployment/ai-arrange-agent --replicas=1
k3s kubectl -n travelon rollout status deployment/ai-arrange-agent --timeout=180s
k3s kubectl -n travelon get deployment,pods
```

实验操作必须在复测完成后恢复为 1 个副本；不得删除 PVC、重置数据库或清理 RabbitMQ 持久化目录。

## 4. 实验结果

| 阶段 | AI 规划 WebSocket | 酒店查询 | 集群状态 |
| --- | --- | --- | --- |
| 故障前 | `PLANNER_DATA_REFRESH`，1.146 秒 | HTTP 200，0.415 秒 | 所有服务 1/1 |
| 故障中 | `PLANNER_ERROR`，0.225 秒；`PLANNER_AGENT_UNAVAILABLE` | HTTP 200，0.183 秒 | Agent 0/0，其余服务 1/1 |
| 恢复后 | `PLANNER_DATA_REFRESH`，0.267 秒，快照版本 1 | HTTP 200，0.157 秒 | 所有服务恢复 1/1 |

故障中返回的提示为：`规划引擎暂时不可用，请确认 Python Agent 已启动，并检查 AI_ARRANGE_AGENT_BASE_URL 配置。`

服务日志记录了连接被拒绝，但 AI 服务进程没有退出，酒店查询仍能正常响应。Agent 恢复并通过就绪检查后，AI 规划重新生成并保存快照。

## 5. 验收结论

- [x] 依赖服务和受影响业务链路明确
- [x] 故障注入可重复
- [x] 故障在约 0.225 秒内返回友好错误
- [x] 未出现无限等待、白屏或无说明的 HTTP 500
- [x] 无关酒店链路在故障期间保持 HTTP 200
- [x] 依赖恢复后主链路恢复
- [x] 故障前、中、后的服务状态和请求结果已保存

本次验证的是依赖服务整体不可用时的故障隔离路径，不等同于 Agent 内部模型或地图调用失败后的 `fallback_plan_builder` 降级路径。后者可作为后续补充演示。

## 6. 复现注意事项

- 实验应使用专用测试会话，不使用真实用户业务数据。
- 记录故障前、故障中和恢复后的时间戳、请求结果、Pod 状态和服务日志。
- 公开汇报时可展示错误码、耗时和服务状态；凭据、Token、Secret 内容以及远程访问方式不得写入报告。
