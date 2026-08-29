# 256 CD 元数据

`images.tsv` 是构建清单。新增或移除服务时只需同步修改该文件和 Kubernetes manifests；256 上的 root wrapper 不需要改动。`travelon-deploy-k3s` 会从渲染后的 namespace 动态发现 StatefulSet/Deployment，并拒绝特权、hostPath、hostNetwork、hostPID、hostIPC 配置。

`travelon-secrets` 由管理员预置在 `travelon` namespace，CD runner 不持有或写入 Kubernetes Secret。
