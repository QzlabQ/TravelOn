# Issue #104：Gateway HPA 真实验收记录

- 验收日期：2026-09-03
- 验收提交：`main@9607ce5`
- 验收对象：Kubernetes `travelon` 命名空间中的 `gateway` Deployment
- 原始证据：[`hpa-load-test-20260903.json`](../../evidence/issue104/hpa-load-test-20260903.json)

## 1. HPA 配置

- API 版本：`autoscaling/v2`
- 最小副本数：1
- 最大副本数：4
- CPU 平均利用率目标：60%
- 扩容稳定窗口：0 秒
- 缩容稳定窗口：120 秒

## 2. 验收命令

在 Gateway 初始为 1 个副本且已就绪的情况下执行：

```bash
python3 scripts/hpa-load-test.py \
  --url http://127.0.0.1/hotels/destinations \
  --duration 180 \
  --concurrency 32 \
  --cooldown 240 \
  --sample-interval 10 \
  --output evidence/issue104/hpa-load-test-20260903.json
```

脚本在负载期间每 10 秒采样 Gateway 的当前副本数和就绪副本数，负载结束后继续观察 240 秒。只有同时观察到就绪副本扩容和回落时才判定通过。

## 3. 实际结果

副本状态按时间变化为：

```text
1/1（负载前）
→ 2 个副本（随后 2/2 Ready）
→ 4 个副本（随后 4/4 Ready）
→ 2/2 Ready（冷却阶段）
→ 1/1 Ready（冷却阶段）
```

| 指标 | 结果 |
| --- | ---: |
| 压测时长 | 180 秒 |
| 冷却观察 | 240 秒 |
| 并发数 | 32 |
| 请求数 | 50,080 |
| 吞吐量 | 278.22 req/s |
| 平均延迟 | 80.66 ms |
| P95 延迟 | 467.29 ms |
| 错误率 | 0% |
| 副本采样错误 | 0 |
| 扩容判定 | 通过 |
| 缩容判定 | 通过 |
| 脚本退出码 | 0 |

验收结束后 Gateway 恢复为 1 个副本且就绪，关键业务探针仍可正常访问。

## 4. 验收结论

- [x] 负载升高后 Gateway Pod 数量增加
- [x] 扩容后的 Pod 均达到 Ready
- [x] 负载降低后 Pod 数量减少
- [x] 最终恢复到 1 个 Ready Pod
- [x] 记录吞吐量、平均延迟、P95 延迟和错误率
- [x] 原始 JSON 证据已保存

Issue #104 的 HPA 技术验收通过。该实验验证的是 Gateway 的水平扩缩容，不代表其他 Deployment 会自动扩容。
