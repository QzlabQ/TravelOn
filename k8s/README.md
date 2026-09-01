# TravelOn Kubernetes 部署

第一轮 CD 的目标是 256 上的单节点 K3s。`k8s/base` 是当前原始微服务架构的 Kustomize 清单，使用独立的 `travelon` namespace、local-path PVC 和 Traefik Ingress。

## 手动检查

```bash
sudo kubectl get nodes
sudo kubectl apply -k k8s/base
sudo kubectl -n travelon get pods -w
```

## 自动扩缩容与压测

`gateway` 使用 `autoscaling/v2` HPA：CPU 平均利用率达到 60% 时在 1～4 个 Pod
之间扩容，负载降低后等待 120 秒再按每分钟最多缩减 50%。所有 Deployment 都声明
CPU request/limit，确保 HPA 的利用率计算有稳定基线。集群需安装 metrics-server。

在能访问 Gateway 的环境运行：

```bash
python3 scripts/hpa-load-test.py --url http://<gateway>/hotels/destinations \
  --duration 180 --concurrency 32 --cooldown 240 \
  --output artifacts/hpa-load-test.json
```

脚本输出吞吐量、平均/P95 延迟、错误率，并每 10 秒记录 Deployment 的当前/就绪副本数；
负载结束后继续观察 240 秒。只有同时观察到扩容和回落时脚本才以 0 退出。验收时应在
`replica_samples` 中看到 1→2+ 及负载结束后的回落；错误率和接口依赖异常需单独标注，
不能把失败请求误判为扩缩容成功。仅调试压测指标、不连接集群时可传
`--skip-scaling-check --cooldown 0`。

## GitHub Actions 前置条件

256 需要注册为 self-hosted runner，标签为 `travelon-256`。Production environment 需要配置：

- `GHCR_USERNAME`
- `GHCR_READ_TOKEN`（仅 `read:packages`）
- `POSTGRES_PASSWORD`
- `DEEPSEEK_API_KEY`（可留空）
- `AMAP_API_KEY`（可留空）

K3s 使用 `/etc/rancher/k3s/k3s.yaml`，runner 账号必须能通过 `sudo -n kubectl` 执行命令。真实凭据只由 GitHub Environment secret 创建，不进入清单或仓库。
