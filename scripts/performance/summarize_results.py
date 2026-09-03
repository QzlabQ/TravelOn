#!/usr/bin/env python3
"""Summarize benchmark JSON files and Docker stats JSONL without third-party packages."""

from __future__ import annotations

import argparse
import csv
import json
import re
import statistics
from collections import defaultdict
from pathlib import Path


SIZE_RE = re.compile(r"^([0-9.]+)([KMGTP]?i?B)$")
SIZE_FACTORS = {
    "B": 1,
    "KB": 1000,
    "MB": 1000**2,
    "GB": 1000**3,
    "TB": 1000**4,
    "KiB": 1024,
    "MiB": 1024**2,
    "GiB": 1024**3,
    "TiB": 1024**4,
}


def size_bytes(value: str) -> float:
    match = SIZE_RE.match(value.strip())
    if not match:
        raise ValueError(f"unsupported Docker size: {value}")
    return float(match.group(1)) * SIZE_FACTORS[match.group(2)]


def load_resource_summary(path: Path) -> dict[str, float]:
    cpu_samples: list[float] = []
    memory_samples: list[float] = []
    with path.open(encoding="utf-8") as handle:
        for line in handle:
            sample = json.loads(line)
            containers = sample.get("containers", [])
            cpu_samples.append(
                sum(float(item.get("cpu_percent", item.get("CPUPerc", "0%")).rstrip("%")) for item in containers)
            )
            memory_samples.append(
                sum(
                    size_bytes(item.get("memory_usage", item.get("MemUsage", "0B / 0B")).split(" / ", 1)[0])
                    for item in containers
                )
            )
    return {
        "cpu_mean_percent": statistics.fmean(cpu_samples) if cpu_samples else 0.0,
        "cpu_peak_percent": max(cpu_samples, default=0.0),
        "memory_mean_mib": statistics.fmean(memory_samples) / 1024**2 if memory_samples else 0.0,
        "memory_peak_mib": max(memory_samples, default=0.0) / 1024**2,
        "resource_samples": len(cpu_samples),
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("results", type=Path)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    rows: list[dict[str, object]] = []
    for benchmark_path in sorted(args.results.rglob("benchmark-*.json")):
        benchmark = json.loads(benchmark_path.read_text(encoding="utf-8"))
        stats_path = benchmark_path.with_name(benchmark_path.name.replace("benchmark-", "stats-").replace(".json", ".jsonl"))
        resource = load_resource_summary(stats_path) if stats_path.exists() else {}
        rows.append({
            "version": benchmark["version"],
            "commit": benchmark["commit"],
            "endpoint": benchmark["endpoint"],
            "round": benchmark["round"],
            "concurrency": benchmark["concurrency"],
            "requests": benchmark["requests"],
            "requests_per_second": benchmark["requests_per_second"],
            "latency_mean_ms": benchmark["latency_ms"]["mean"],
            "latency_p95_ms": benchmark["latency_ms"]["p95"],
            "error_rate_percent": benchmark["error_rate_percent"],
            **resource,
        })

    args.output.parent.mkdir(parents=True, exist_ok=True)
    if rows:
        with args.output.open("w", newline="", encoding="utf-8") as handle:
            writer = csv.DictWriter(handle, fieldnames=list(rows[0]), lineterminator="\n")
            writer.writeheader()
            writer.writerows(rows)

    grouped: dict[tuple[str, str], list[dict[str, object]]] = defaultdict(list)
    for row in rows:
        grouped[(str(row["version"]), str(row["endpoint"]))].append(row)
    for (version, endpoint), group in sorted(grouped.items()):
        print(json.dumps({
            "version": version,
            "endpoint": endpoint,
            "rounds": len(group),
            "rps_mean": statistics.fmean(float(row["requests_per_second"]) for row in group),
            "latency_mean_ms": statistics.fmean(float(row["latency_mean_ms"]) for row in group),
            "p95_mean_ms": statistics.fmean(float(row["latency_p95_ms"]) for row in group),
            "error_rate_mean_percent": statistics.fmean(float(row["error_rate_percent"]) for row in group),
            "cpu_mean_percent": statistics.fmean(float(row.get("cpu_mean_percent", 0)) for row in group),
            "memory_mean_mib": statistics.fmean(float(row.get("memory_mean_mib", 0)) for row in group),
        }, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
