#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 3 ]]; then
  echo "usage: $0 <compose-project> <interval-seconds> <output-jsonl>" >&2
  exit 64
fi

project=$1
interval=$2
output=$3
mkdir -p "$(dirname "$output")"
: >"$output"

while true; do
  timestamp=$(date --iso-8601=ns)
  mapfile -t containers < <(sudo -n docker ps \
    --filter "label=com.docker.compose.project=${project}" \
    --format '{{.ID}}')
  if [[ ${#containers[@]} -eq 0 ]]; then
    printf '{"timestamp":"%s","containers":[]}\n' "$timestamp" >>"$output"
  else
    sudo -n docker stats --no-stream --format '{{json .}}' "${containers[@]}" \
      | jq -cs --arg timestamp "$timestamp" --arg project "$project" \
        '{
          timestamp: $timestamp,
          containers: map({
            service: (.Name | sub("^" + $project + "-"; "") | sub("-1$"; "")),
            cpu_percent: .CPUPerc,
            memory_usage: .MemUsage,
            memory_percent: .MemPerc,
            pids: .PIDs
          })
        }' >>"$output"
  fi
  sleep "$interval"
done
