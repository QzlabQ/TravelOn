# Performance comparison on the deployment host

Issue #122 compares the deployment-host behavior of two immutable Git revisions:

- current: the full commit recorded from `origin/main` immediately before the run;
- before consolidation: `monolith-start^{}`.

The label “before consolidation” is deliberate: the tagged source already contains a gateway,
service discovery, and multiple separately deployed services, so it is not a code-level monolith.

## Fairness controls

- Run both revisions sequentially on the same host and through Docker Compose.
- Use a unique Compose project, isolated bind-mounted data directories, and non-production ports.
- Do not send benchmark traffic to the production K3s ingress.
- Build each stack from a clean detached worktree at its recorded full SHA.
- Use the same hotel and common seed inputs. Their contents are identical between the two revisions.
- Test only compatible, read-only hotel endpoints; transport fixtures changed between revisions.
- Use the same concurrency, duration, warm-up, endpoint order, and three recorded rounds.
- Keep the production workload running for both variants.

## Tools

`http_benchmark.py` uses one persistent HTTP connection per worker and records throughput,
HTTP/error counts, mean latency, P50/P90/P95/P99, and transferred bytes as JSON.

`sample_docker_stats.sh` samples all containers belonging to the isolated Compose project.
Keep one stats file per benchmark JSON, using the same suffix:

```text
benchmark-current-hotel-search-r1.json
stats-current-hotel-search-r1.jsonl
```

Summarize completed runs with:

```bash
python3 scripts/performance/summarize_results.py evidence/performance \
  --output evidence/performance/rounds.csv
```

The comparison report must include the complete commands, fixed commits, machine metadata,
endpoint parameters, container inventory, data hashes, raw per-round results, and caveats.

`run_variant.sh` is the host-side orchestration entry point. It fixes application containers to
CPUs 12-19 and the load generator to CPUs 8-11, creates isolated ports/data, waits for a real API
response, executes three rounds, and tears down only its own Compose project on exit.
