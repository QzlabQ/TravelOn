#!/usr/bin/env bash
set -euo pipefail

tag="${1:?usage: deploy-k3s.sh <image-tag>}"
if [[ ! "$tag" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "invalid image tag: $tag" >&2
  exit 2
fi

sudo -n kubectl -n travelon get secret travelon-secrets >/dev/null
rendered="$(mktemp /tmp/travelon-k8s.XXXXXX.yaml)"
trap 'rm -f "$rendered"' EXIT
sudo -n kubectl kustomize k8s/base >"$rendered"
sed -Ei "s#(image: (ghcr.io/qzlabq/)?travelon-[a-z0-9-]+):latest#\1:${tag}#" "$rendered"
sudo -n kubectl apply -f "$rendered"

desired_workload_count=0
while IFS= read -r resource; do
  ((desired_workload_count += 1))
  case "$resource" in
    statefulset/postgres) timeout=25m ;;
    statefulset/*) timeout=10m ;;
    deployment/*) timeout=15m ;;
    *) exit 6 ;;
  esac
  sudo -n kubectl -n travelon rollout status "$resource" --timeout="$timeout"
done < <(
  awk '
    /^kind: StatefulSet$/ { kind = "statefulset"; next }
    /^kind: Deployment$/ { kind = "deployment"; next }
    /^metadata:$/ { read_metadata = (kind != ""); next }
    read_metadata && /^  name: / { print kind "/" $2; kind = ""; read_metadata = 0 }
  ' "$rendered"
)
(( desired_workload_count > 0 )) || { echo 'no workloads rendered' >&2; exit 6; }

sudo -n kubectl -n travelon exec deployment/travelon-ui -- wget -qO- http://discovery:8010/ >/dev/null
sudo -n kubectl -n travelon exec deployment/travelon-ui -- wget -qO- http://ai-arrange-agent:8090/agent/health >/dev/null
sudo -n kubectl -n travelon exec deployment/travelon-ui -- wget -qO- http://gateway:8082/hotels/destinations >/dev/null

retired_resources="ops/cd/retired-resources.tsv"
while IFS=$'\t' read -r api_version kind name; do
  [[ -z "$api_version" || "$api_version" == \#* ]] && continue
  [[ "$name" =~ ^[a-z0-9]([-a-z0-9]*[a-z0-9])?$ ]] || exit 7
  case "$api_version:$kind" in
    apps/v1:Deployment|v1:Service|networking.k8s.io/v1:Ingress) ;;
    *) echo "invalid retired resource: $api_version $kind" >&2; exit 7 ;;
  esac
  sudo -n kubectl -n travelon delete --ignore-not-found "$kind/$name"
done < "$retired_resources"

sudo -n kubectl -n travelon apply --prune -l app.kubernetes.io/managed-by=travelon-cd \
  --prune-allowlist=apps/v1/Deployment \
  --prune-allowlist=apps/v1/StatefulSet \
  --prune-allowlist=core/v1/Service \
  --prune-allowlist=core/v1/ConfigMap \
  --prune-allowlist=networking.k8s.io/v1/Ingress \
  --prune-allowlist=autoscaling/v2/HorizontalPodAutoscaler \
  --prune-allowlist=policy/v1/PodDisruptionBudget \
  -f "$rendered"

sudo -n kubectl -n travelon get pods
