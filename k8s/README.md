# TravelOn Kubernetes 部署

第一轮 CD 的目标是 256 上的单节点 K3s。`k8s/base` 是当前原始微服务架构的 Kustomize 清单，使用独立的 `travelon` namespace、local-path PVC 和 Traefik Ingress。

## 手动检查

```bash
sudo kubectl get nodes
sudo kubectl apply -k k8s/base
sudo kubectl -n travelon get pods -w
```

## GitHub Actions 前置条件

256 需要注册为 self-hosted runner，标签为 `travelon-256`。Production environment 需要配置：

- `GHCR_USERNAME`
- `GHCR_READ_TOKEN`（仅 `read:packages`）
- `POSTGRES_PASSWORD`
- `AI_API_KEY`（可留空）
- `AI_BASE_URL`、`AI_CHAT_COMPLETIONS_PATH`、`AI_MODEL` 等模型配置在 `travelon-config` ConfigMap 中维护。
- 旧的 `DEEPSEEK_API_KEY` 仍可作为迁移期间的兼容配置。
- `AMAP_API_KEY`（可留空）

K3s 使用 `/etc/rancher/k3s/k3s.yaml`，runner 账号必须能通过 `sudo -n kubectl` 执行命令。真实凭据只由 GitHub Environment secret 创建，不进入清单或仓库。
