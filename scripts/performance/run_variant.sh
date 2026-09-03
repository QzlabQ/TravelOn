#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 5 ]]; then
  echo "usage: $0 <before|current> <full-commit> <worktree> <results-dir> <gateway-port>" >&2
  exit 64
fi

variant=$1
commit=$2
worktree=$3
results_dir=$4
gateway_port=$5
tools_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
project="travelon-perf-${variant}"

actual_commit=$(git -C "$worktree" rev-parse HEAD)
if [[ "$actual_commit" != "$commit" ]]; then
  echo "commit mismatch: expected $commit, got $actual_commit" >&2
  exit 65
fi

case "$variant" in
  before)
    override="$tools_dir/compose-before.override.yml"
    services=(postgres rabbitmq discovery gateway hotel transport)
    ;;
  current)
    override="$tools_dir/compose-current.override.yml"
    services=(postgres rabbitmq discovery gateway travel-core-migration travel-core)
    ;;
  *)
    echo "unknown variant: $variant" >&2
    exit 64
    ;;
esac

api_dir="$worktree/travel-api"
mkdir -p "$results_dir"
touch "$api_dir/.env"
compose=(sudo -n docker compose --project-name "$project" --file "$api_dir/docker-compose.yml" --file "$override")
compose_with_ports=(
  sudo -n env
  POSTGRES_HOST_PORT=59132
  RABBITMQ_HOST_PORT=59172
  RABBITMQ_MANAGEMENT_HOST_PORT=59173
  MONGO_HOST_PORT=59117
  DISCOVERY_HOST_PORT=59110
  GATEWAY_HOST_PORT="$gateway_port"
  docker compose --project-name "$project" --file "$api_dir/docker-compose.yml" --file "$override"
)

cleanup() {
  "${compose[@]}" down --remove-orphans >/dev/null 2>&1 || true
}
trap cleanup EXIT

cleanup
"${compose_with_ports[@]}" up --detach --build "${services[@]}"

gateway="http://127.0.0.1:${gateway_port}"
ready=0
for _ in $(seq 1 180); do
  if curl --fail --silent --show-error --max-time 5 "$gateway/hotels/destinations" >/tmp/travelon-perf-destinations.json 2>/dev/null; then
    ready=1
    break
  fi
  sleep 5
done
if [[ "$ready" != 1 ]]; then
  "${compose[@]}" ps
  "${compose[@]}" logs --tail 120 gateway discovery "${services[-1]}"
  exit 1
fi

destination_id=$(jq -er '.[0].idLocation' /tmp/travelon-perf-destinations.json)
date_from=$(date -d '+10 days' +%F)
date_to=$(date -d '+12 days' +%F)
search_url="$gateway/hotels/search?destinationId=${destination_id}&dateFrom=${date_from}&dateTo=${date_to}&adults=2&sortBy=price"
hotel_id=$(curl --fail --silent --show-error --max-time 20 "$search_url" | jq -er '.[0].hotelId')

jq -n \
  --arg variant "$variant" \
  --arg commit "$commit" \
  --arg destination_id "$destination_id" \
  --argjson hotel_id "$hotel_id" \
  --arg date_from "$date_from" \
  --arg date_to "$date_to" \
  '{
    variant: $variant,
    commit: $commit,
    destination_id: $destination_id,
    hotel_id: $hotel_id,
    date_from: $date_from,
    date_to: $date_to,
    concurrency: 32,
    duration_seconds: 30,
    warmup_seconds: 10,
    application_cpuset: "12-19",
    load_generator_cpuset: "8-11"
  }' >"$results_dir/metadata-${variant}.json"

"${compose[@]}" ps --format json \
  | jq -cs 'map({service: .Service, image: .Image, state: .State, health: .Health})' \
  >"$results_dir/containers-${variant}.json"

declare -a endpoint_names=(hotel-destinations hotel-search hotel-details)
declare -a endpoint_urls=(
  "$gateway/hotels/destinations"
  "$search_url"
  "$gateway/hotels/${hotel_id}?dateFrom=${date_from}&dateTo=${date_to}&adults=2"
)

for round in 1 2 3; do
  for index in 0 1 2; do
    endpoint=${endpoint_names[$index]}
    url=${endpoint_urls[$index]}
    suffix="${variant}-${endpoint}-r${round}"
    stats_file="$results_dir/stats-${suffix}.jsonl"
    benchmark_file="$results_dir/benchmark-${suffix}.json"

    "$tools_dir/sample_docker_stats.sh" "$project" 1 "$stats_file" &
    sampler_pid=$!
    set +e
    taskset --cpu-list 8-11 python3 "$tools_dir/http_benchmark.py" "$url" \
      --concurrency 32 \
      --duration 30 \
      --warmup 10 \
      --version "$variant" \
      --commit "$commit" \
      --endpoint "$endpoint" \
      --round "$round" \
      --output "$benchmark_file"
    benchmark_status=$?
    set -e
    kill "$sampler_pid" 2>/dev/null || true
    wait "$sampler_pid" 2>/dev/null || true
    if [[ ! -s "$benchmark_file" ]]; then
      echo "benchmark produced no output: $suffix" >&2
      exit 1
    fi
    jq -n --arg suffix "$suffix" --argjson status "$benchmark_status" \
      '{suffix:$suffix, benchmark_exit_status:$status}'
    sleep 5
  done
done

python3 "$tools_dir/summarize_results.py" "$results_dir" \
  --output "$results_dir/rounds-${variant}.csv" \
  >"$results_dir/summary-${variant}.jsonl"
