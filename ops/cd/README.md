# 256 CD 元数据

`images.tsv` 是构建清单。新增服务时同步修改该文件和 Kubernetes manifests。`retired-resources.tsv` 仅用于接管生命周期标签启用前遗留的已替代 Deployment/Service/Ingress；以后的受控资源删除由标签白名单 prune 自动完成。256 上的 root wrapper 不需要改动。`travelon-deploy-k3s` 只等待本次渲染出来的 StatefulSet/Deployment；替代工作负载与 smoke test 成功后才清理退休资源，再对带 `app.kubernetes.io/managed-by=travelon-cd` 标签的受控资源执行白名单 prune。该流程不会选择 Secret、PVC、namespace 或其他存储资源，并拒绝特权、hostPath、hostNetwork、hostPID、hostIPC 配置。

`scripts/verify-k3s-images.sh` 复用同一镜像清单，在 CI 中构建全部部署镜像。这样 Dockerfile、构建上下文或依赖问题会在 CD 之前失败。

`tests/cd/test-cd-metadata.sh` 会渲染清单，校验生命周期标签、镜像清单覆盖和退休资源白名单；可在提交前执行。

`travelon-secrets` 由管理员预置在 `travelon` namespace，CD runner 不持有或写入 Kubernetes Secret。

阿里云 Docker Compose 部署使用独立的 runner、工作流和服务器私有环境文件，参见
[ALIYUN.md](ALIYUN.md)。该部署不会替换 `production-256` K3s 流水线。
