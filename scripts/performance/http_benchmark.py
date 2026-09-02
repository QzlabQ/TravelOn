#!/usr/bin/env python3
"""Small dependency-free HTTP benchmark with per-request latency output."""

from __future__ import annotations

import argparse
import concurrent.futures
import datetime as dt
import http.client
import json
import math
import statistics
import threading
import time
import urllib.parse
from pathlib import Path


def percentile(values: list[float], quantile: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    position = (len(ordered) - 1) * quantile
    lower = math.floor(position)
    upper = math.ceil(position)
    if lower == upper:
        return ordered[lower]
    return ordered[lower] + (ordered[upper] - ordered[lower]) * (position - lower)


def new_connection(parsed: urllib.parse.SplitResult, timeout: float) -> http.client.HTTPConnection:
    connection_type = http.client.HTTPSConnection if parsed.scheme == "https" else http.client.HTTPConnection
    return connection_type(parsed.hostname, parsed.port, timeout=timeout)


def request_once(
    connection: http.client.HTTPConnection,
    path: str,
    host: str,
) -> tuple[int, int]:
    connection.request("GET", path, headers={"Host": host, "Connection": "keep-alive"})
    response = connection.getresponse()
    body = response.read()
    return response.status, len(body)


def worker(
    parsed: urllib.parse.SplitResult,
    path: str,
    deadline: float,
    barrier: threading.Barrier,
    timeout: float,
) -> dict[str, object]:
    latencies_ms: list[float] = []
    statuses: dict[str, int] = {}
    errors: dict[str, int] = {}
    transferred = 0
    connection = new_connection(parsed, timeout)
    barrier.wait()

    while time.perf_counter() < deadline:
        started = time.perf_counter_ns()
        try:
            status, body_size = request_once(connection, path, parsed.netloc)
            statuses[str(status)] = statuses.get(str(status), 0) + 1
            transferred += body_size
        except Exception as exc:  # benchmark output records the exact failure class
            name = type(exc).__name__
            errors[name] = errors.get(name, 0) + 1
            try:
                connection.close()
            finally:
                connection = new_connection(parsed, timeout)
        finally:
            latencies_ms.append((time.perf_counter_ns() - started) / 1_000_000)

    connection.close()
    return {
        "latencies_ms": latencies_ms,
        "statuses": statuses,
        "errors": errors,
        "bytes": transferred,
    }


def warm_up(parsed: urllib.parse.SplitResult, path: str, seconds: float, timeout: float) -> None:
    if seconds <= 0:
        return
    connection = new_connection(parsed, timeout)
    deadline = time.perf_counter() + seconds
    while time.perf_counter() < deadline:
        try:
            request_once(connection, path, parsed.netloc)
        except Exception:
            try:
                connection.close()
            finally:
                connection = new_connection(parsed, timeout)
    connection.close()


def merge_counts(results: list[dict[str, object]], key: str) -> dict[str, int]:
    merged: dict[str, int] = {}
    for result in results:
        for name, count in result[key].items():  # type: ignore[union-attr]
            merged[name] = merged.get(name, 0) + count
    return merged


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("url")
    parser.add_argument("--concurrency", type=int, default=32)
    parser.add_argument("--duration", type=float, default=30.0)
    parser.add_argument("--warmup", type=float, default=10.0)
    parser.add_argument("--timeout", type=float, default=10.0)
    parser.add_argument("--version", required=True)
    parser.add_argument("--commit", required=True)
    parser.add_argument("--endpoint", required=True)
    parser.add_argument("--round", type=int, required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()

    if args.concurrency < 1 or args.duration <= 0:
        parser.error("concurrency and duration must be positive")

    parsed = urllib.parse.urlsplit(args.url)
    if parsed.scheme not in {"http", "https"} or not parsed.hostname:
        parser.error("url must be an absolute http(s) URL")
    path = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))

    warm_up(parsed, path, args.warmup, args.timeout)
    time.sleep(2)

    barrier = threading.Barrier(args.concurrency + 1)
    started_at = dt.datetime.now(dt.timezone.utc)
    started = time.perf_counter()
    deadline = started + args.duration
    with concurrent.futures.ThreadPoolExecutor(max_workers=args.concurrency) as executor:
        futures = [
            executor.submit(worker, parsed, path, deadline, barrier, args.timeout)
            for _ in range(args.concurrency)
        ]
        barrier.wait()
        results = [future.result() for future in futures]
    elapsed = time.perf_counter() - started

    latencies = [latency for result in results for latency in result["latencies_ms"]]
    statuses = merge_counts(results, "statuses")
    errors = merge_counts(results, "errors")
    total = len(latencies)
    success = sum(count for status, count in statuses.items() if 200 <= int(status) < 400)
    failed = total - success

    report = {
        "schema_version": 1,
        "started_at": started_at.isoformat(),
        "version": args.version,
        "commit": args.commit,
        "endpoint": args.endpoint,
        "round": args.round,
        "request_path": path,
        "concurrency": args.concurrency,
        "configured_duration_seconds": args.duration,
        "warmup_seconds": args.warmup,
        "elapsed_seconds": elapsed,
        "requests": total,
        "successful_requests": success,
        "failed_requests": failed,
        "error_rate_percent": failed / total * 100 if total else 100.0,
        "requests_per_second": total / elapsed,
        "response_bytes": sum(int(result["bytes"]) for result in results),
        "status_counts": statuses,
        "error_counts": errors,
        "latency_ms": {
            "mean": statistics.fmean(latencies) if latencies else 0.0,
            "p50": percentile(latencies, 0.50),
            "p90": percentile(latencies, 0.90),
            "p95": percentile(latencies, 0.95),
            "p99": percentile(latencies, 0.99),
            "max": max(latencies, default=0.0),
        },
    }

    args.output.parent.mkdir(parents=True, exist_ok=True)
    args.output.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))
    return 0 if failed == 0 else 2


if __name__ == "__main__":
    raise SystemExit(main())
