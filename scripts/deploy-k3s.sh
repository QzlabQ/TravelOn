#!/usr/bin/env bash
set -euo pipefail

tag="${1:?usage: deploy-k3s.sh <image-tag>}"
if [[ ! "$tag" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "invalid image tag: $tag" >&2
  exit 2
fi

sudo -n kubectl -n travelon get secret travelon-secrets >/dev/null
sudo -n kubectl apply -k k8s/base
sudo -n kubectl -n travelon set image statefulset/postgres "postgres=travelon-postgres:${tag}"

for deployment in discovery gateway hotel transport user community reservation payment ai-arrange ai-arrange-agent; do
  sudo -n kubectl -n travelon set image "deployment/${deployment}" "${deployment}=travelon-${deployment}:${tag}"
done
sudo -n kubectl -n travelon set image deployment/travelon-ui "travelon-ui=travelon-ui:${tag}"

sudo -n kubectl -n travelon rollout status statefulset/postgres --timeout=25m
sudo -n kubectl -n travelon rollout status statefulset/mongo --timeout=10m
for deployment in rabbitmq discovery gateway hotel transport user community reservation payment ai-arrange ai-arrange-agent travelon-ui; do
  sudo -n kubectl -n travelon rollout status "deployment/${deployment}" --timeout=15m
done

sudo -n kubectl -n travelon exec deployment/travelon-ui -- wget -qO- http://discovery:8010/ >/dev/null
sudo -n kubectl -n travelon exec deployment/travelon-ui -- wget -qO- http://ai-arrange-agent:8090/agent/health >/dev/null
sudo -n kubectl -n travelon exec deployment/travelon-ui -- wget -qO- http://gateway:8082/hotels/destinations >/dev/null

sudo -n kubectl -n travelon get pods
