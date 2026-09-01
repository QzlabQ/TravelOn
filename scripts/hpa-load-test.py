#!/usr/bin/env python3
"""Run a bounded HTTP load and record latency/error and HPA replica evidence."""
import argparse, json, os, statistics, subprocess, time
from concurrent.futures import ThreadPoolExecutor, as_completed
from urllib.request import Request, urlopen
from urllib.error import HTTPError, URLError

def replicas(namespace, deployment):
    try:
        raw = subprocess.check_output(["kubectl", "-n", namespace, "get", "deployment", deployment,
                                       "-o", "jsonpath={.status.replicas}:{.status.readyReplicas}"], text=True).strip()
        current, ready = (raw.split(":") + [""])[:2]
        return {"replicas": int(current or 0), "ready": int(ready or 0)}
    except (subprocess.SubprocessError, ValueError, OSError):
        return None

def one(url, timeout):
    started = time.perf_counter()
    try:
        with urlopen(Request(url, headers={"User-Agent": "TravelOn-hpa-load-test/1.0"}), timeout=timeout) as response:
            response.read(256)
            return time.perf_counter() - started, 200 <= response.status < 400
    except (HTTPError, URLError, TimeoutError, OSError):
        return time.perf_counter() - started, False

def main():
    p = argparse.ArgumentParser()
    p.add_argument("--url", default="http://localhost:8082/hotels/destinations")
    p.add_argument("--namespace", default="travelon")
    p.add_argument("--deployment", default="gateway")
    p.add_argument("--duration", type=int, default=180)
    p.add_argument("--concurrency", type=int, default=32)
    p.add_argument("--timeout", type=float, default=10)
    p.add_argument("--sample-interval", type=float, default=10)
    p.add_argument("--cooldown", type=int, default=240,
                   help="seconds to watch replicas after load stops")
    p.add_argument("--skip-scaling-check", action="store_true")
    p.add_argument("--output", default="artifacts/hpa-load-test.json")
    a = p.parse_args()
    started = time.monotonic()
    end = started + a.duration
    samples, results = [], []
    with ThreadPoolExecutor(max_workers=a.concurrency) as pool:
        futures = set()
        next_sample = 0.0
        while time.monotonic() < end or futures:
            now = time.monotonic()
            if now < end:
                while len(futures) < a.concurrency:
                    futures.add(pool.submit(one, a.url, a.timeout))
            done = {f for f in futures if f.done()}
            for f in done:
                results.append(f.result()); futures.remove(f)
            if now >= next_sample:
                samples.append({"at": time.time(), "phase": "load", **(replicas(a.namespace, a.deployment) or {})})
                next_sample = now + a.sample_interval
            time.sleep(0.02)
    cooldown_end = time.monotonic() + a.cooldown
    while time.monotonic() < cooldown_end:
        samples.append({"at": time.time(), "phase": "cooldown", **(replicas(a.namespace, a.deployment) or {})})
        time.sleep(a.sample_interval)
    latencies = [latency for latency, _ in results]
    successful = sum(ok for _, ok in results)
    ordered = sorted(latencies)
    p95 = ordered[max(0, int(len(ordered) * .95) - 1)] if ordered else None
    observed = [sample["replicas"] for sample in samples if "replicas" in sample]
    peak = max(observed) if observed else None
    final = observed[-1] if observed else None
    scale_up = peak is not None and peak > observed[0]
    scale_down = scale_up and final < peak
    report = {"url": a.url, "duration_seconds": a.duration, "cooldown_seconds": a.cooldown,
              "concurrency": a.concurrency, "requests": len(results),
              "throughput_rps": len(results) / max(a.duration, 1),
              "average_latency_ms": statistics.mean(latencies) * 1000 if latencies else None,
              "p95_latency_ms": p95 * 1000 if p95 is not None else None,
              "error_rate": (len(results) - successful) / len(results) if results else 1,
              "scale_up_observed": scale_up, "scale_down_observed": scale_down,
              "replica_samples": samples, "finished_at": time.time()}
    output_dir = os.path.dirname(a.output)
    if output_dir: os.makedirs(output_dir, exist_ok=True)
    with open(a.output, "w", encoding="utf-8") as f: json.dump(report, f, indent=2)
    print(json.dumps(report, indent=2))
    if not results: raise SystemExit("load test produced no requests")
    if not a.skip_scaling_check and not (scale_up and scale_down):
        raise SystemExit("expected both scale-up and scale-down were not observed")

if __name__ == "__main__": main()
