# 256 CD 与 Kubernetes 运维说明

本文供 TravelOn 项目组成员查看和维护 256 上的 Kubernetes 部署。操作账户为 `travelon-viewer`。

## 1. 权限范围

`travelon-viewer` 只拥有 Kubernetes `travelon` namespace 内的运维权限，可以：

- 查看工作负载、Pod、Service、Ingress 和事件；
- 查看容器日志；
- 重启、删除 Pod；
- 修改 Deployment、StatefulSet，更新镜像和副本数；
- 使用 `kubectl exec` 进入项目容器；
- 读取和维护项目内的 Secret。

该账户不能：

- 操作 `kube-system` 等其他 namespace；
- 操作 Kubernetes 节点或集群级 RBAC；
- 使用 Linux `sudo` 或直接操作 Docker；
- 访问 `travelon-runner` 的工作目录；
- 访问服务器上其他用户的个人目录和其他项目。

> `kubectl exec` 和 Secret 权限可能接触数据库密码、API Key 等敏感信息。不得复制、截图或发送到群聊、Issue、PR 和日志中。

## 2. SSH 登录

每位成员使用自己的 SSH 公钥，不共享密码或私钥。将 `~/.ssh/id_ed25519.pub` 交给服务器管理员加入 `travelon-viewer` 的 `authorized_keys`。

没有 SSH 密钥时可以生成：

```bash
ssh-keygen -t ed25519 -C "姓名或 GitHub 用户名"
```

登录命令中的主机地址由管理员单独提供：

```bash
ssh travelon-viewer@<256主机地址>
```

登录后已经配置默认 kubeconfig，无需复制管理员 kubeconfig：

```bash
kubectl config current-context
kubectl get pods
```

## 3. CD 流程

当前 CD 流程如下：

1. 代码合并到 `main`；
2. GitHub Actions CI 执行编译和测试；
3. CI 成功后自动触发 CD；
4. 256 上的 `travelon-256` self-hosted Runner checkout 对应提交；
5. Runner 在 256 本机构建镜像并导入 K3s containerd；
6. CD 将资源部署到 `travelon` namespace；
7. 等待 Deployment、StatefulSet rollout；
8. 执行 smoke test；成功后才清理已由仓库声明为退休的旧 Deployment、Service 或 Ingress，并白名单 prune 受 CD 管理的资源；
9. 全部成功后 CD 结束。

CD 不会删除 Secret、PVC、namespace 或数据库数据。旧服务下线必须通过仓库中的 `ops/cd/retired-resources.tsv` 声明，不能在服务器上手工删除后假定它不会再出现。

镜像 tag 使用提交哈希，例如：

```text
travelon-gateway:sha-8fb34e4
```

优先通过 GitHub Actions 查看 CD 状态和完整构建日志。不要为了“重新部署”而随意修改服务器文件。

## 4. 日常查看命令

查看全部主要资源：

```bash
kubectl get deployment,statefulset,pod,service,ingress,pvc
```

持续观察 Pod 状态：

```bash
kubectl get pods -w
```

查看单个 Pod 的详细状态和事件：

```bash
kubectl describe pod <Pod名称>
```

按时间查看 namespace 事件：

```bash
kubectl get events --sort-by=.lastTimestamp
```

查看 Deployment 使用的镜像：

```bash
kubectl get deployment -o custom-columns='NAME:.metadata.name,IMAGE:.spec.template.spec.containers[*].image'
```

## 5. 查看日志

查看服务最近 200 行日志：

```bash
kubectl logs deployment/gateway --tail=200
```

持续跟踪日志：

```bash
kubectl logs -f deployment/gateway --tail=100
```

查看容器上一次崩溃前的日志：

```bash
kubectl logs <Pod名称> --previous --tail=200
```

如果一个 Pod 有多个容器，先查看容器名：

```bash
kubectl get pod <Pod名称> -o jsonpath='{.spec.containers[*].name}'
kubectl logs <Pod名称> -c <容器名> --tail=200
```

## 6. 常用运维操作

### 重启服务

优先使用 rollout restart：

```bash
kubectl rollout restart deployment/gateway
kubectl rollout status deployment/gateway --timeout=15m
```

也可以删除单个 Pod，让控制器自动重建：

```bash
kubectl delete pod <Pod名称>
kubectl get pods -w
```

### 扩缩容

```bash
kubectl scale deployment/gateway --replicas=2
kubectl rollout status deployment/gateway --timeout=15m
```

手动副本数可能在下次 CD 时被仓库清单覆盖。

### 回滚 Deployment

```bash
kubectl rollout history deployment/gateway
kubectl rollout undo deployment/gateway
kubectl rollout status deployment/gateway --timeout=15m
```

回滚前需要在项目群说明原因、目标服务和对应提交；完成后应通过仓库修复并重新执行 CD，避免服务器状态长期偏离 Git。

### 进入容器排查

```bash
kubectl exec -it deployment/gateway -- sh
```

仅用于临时诊断。容器重建后，容器内手工修改会丢失；正式修复必须提交到仓库并通过 CI/CD 发布。

## 7. 数据库与 Secret

以下操作风险较高：

- 进入 `postgres-0` 或 `mongo-0`；
- 修改 `travelon-secrets`；
- 删除 StatefulSet、PVC 或数据库 Pod；
- 执行迁移、清表、删库和批量更新。

执行前必须备份并取得项目负责人确认。不要使用以下命令进行日常排障：

```text
kubectl delete namespace travelon
kubectl delete pvc ...
kubectl delete secret travelon-secrets
```

查看 Secret 会输出敏感数据，除非明确进行密钥维护，否则不要执行：

```text
kubectl get secret ... -o yaml
kubectl get secret ... -o jsonpath=...
```

## 8. 故障排查顺序

1. 在 GitHub Actions 确认 CI/CD 是否成功；
2. 执行 `kubectl get pods`，寻找 `Pending`、`CrashLoopBackOff`、`Error`；
3. 执行 `kubectl describe pod <Pod名称>` 查看探针、调度和挂载事件；
4. 执行 `kubectl logs ...` 和 `kubectl logs --previous ...`；
5. 查看 `kubectl get events --sort-by=.lastTimestamp`；
6. 明确原因后再重启或回滚，不要把重启当作永久修复；
7. 将根因修复提交到仓库，通过 CI/CD 恢复声明状态。

## 9. 操作记录要求

进行删除 Pod、重启、扩缩容、回滚、exec、数据库或 Secret 操作时，应在项目群记录：

- 操作者；
- 操作时间；
- 原因；
- 执行的命令；
- 影响的服务；
- 操作前后状态；
- 关联 Issue、PR 或 GitHub Actions Run。

多人虽然共用 Linux 用户，但必须使用各自 SSH 公钥，并主动留下操作记录。成员退出项目后，应立即从 `authorized_keys` 删除其公钥。
