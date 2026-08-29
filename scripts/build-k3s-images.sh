#!/usr/bin/env bash
set -euo pipefail

tag="${1:?usage: build-k3s-images.sh <image-tag>}"
if [[ ! "$tag" =~ ^sha-[0-9a-f]{7,40}$ ]]; then
  echo "invalid image tag: $tag" >&2
  exit 2
fi

build_and_import() {
  local name="$1" context="$2" dockerfile="$3"
  local image="travelon-${name}:${tag}"
  sudo -n docker build --file "$dockerfile" --tag "$image" "$context"
  sudo -n docker save "$image" | sudo -n k3s ctr images import -
}

build_and_import postgres . travel-api/Dockerfile.postgres
build_and_import discovery travel-api/discovery-service travel-api/discovery-service/Dockerfile
build_and_import gateway travel-api/api-gateway travel-api/api-gateway/Dockerfile
build_and_import hotel travel-api/hotel-service travel-api/hotel-service/Dockerfile
build_and_import transport . travel-api/transport-service/Dockerfile.k8s
build_and_import user travel-api/user-service travel-api/user-service/Dockerfile
build_and_import community travel-api/community-service travel-api/community-service/Dockerfile
build_and_import reservation travel-api/reservation-service travel-api/reservation-service/Dockerfile
build_and_import payment travel-api/payment-service travel-api/payment-service/Dockerfile
build_and_import ai-arrange travel-api/ai-arrange-service travel-api/ai-arrange-service/Dockerfile
build_and_import ai-arrange-agent travel-api/ai-arrange-agent-service travel-api/ai-arrange-agent-service/Dockerfile
build_and_import ui travel-ui travel-ui/Dockerfile

for image in mongo:7 rabbitmq:3.13-management; do
  sudo -n docker image inspect "$image" >/dev/null
  sudo -n docker save "$image" | sudo -n k3s ctr images import -
done
