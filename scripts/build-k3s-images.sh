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

manifest="ops/cd/images.tsv"
[[ -r "$manifest" ]] || { echo "missing image manifest: $manifest" >&2; exit 3; }
while IFS=$'\t' read -r name context dockerfile; do
  [[ -z "$name" || "$name" == \#* ]] && continue
  [[ "$name" =~ ^[a-z0-9-]+$ && "$context" != /* && "$dockerfile" != /* && "$context" != *..* && "$dockerfile" != *..* ]] || {
    echo "invalid image manifest entry: $name" >&2
    exit 4
  }
  [[ -d "$context" && -f "$dockerfile" ]] || {
    echo "missing build input for $name" >&2
    exit 5
  }
  build_and_import "$name" "$context" "$dockerfile"
done < "$manifest"

for image in mongo:7 rabbitmq:3.13-management; do
  sudo -n docker image inspect "$image" >/dev/null
  sudo -n docker save "$image" | sudo -n k3s ctr images import -
done
